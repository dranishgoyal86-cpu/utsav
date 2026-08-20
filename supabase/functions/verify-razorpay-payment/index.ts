import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

async function isValidSignature(orderId: string, paymentId: string, signature: string, secret: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(`${orderId}|${paymentId}`));
  const expected = Array.from(new Uint8Array(sigBuffer))
    .map(b => b.toString(16).padStart(2, "0")).join("");
  return expected === signature;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(jwt);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { bookingId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = await req.json();
    if (!bookingId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return new Response(JSON.stringify({ error: "Missing payment fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: booking, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .select("id, customer_id, provider_id, total_amount, commission_amount, status")
      .eq("id", bookingId)
      .maybeSingle();

    if (bookingError || !booking) {
      return new Response(JSON.stringify({ error: "Booking not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (booking.customer_id !== user.id) {
      return new Response(JSON.stringify({ error: "This booking does not belong to you" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (booking.status !== "payment_pending") {
      return new Response(JSON.stringify({ error: "This booking has already been processed" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET")!;
    const valid = await isValidSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature, keySecret);
    if (!valid) {
      // Do NOT touch the booking here — leave it payment_pending so a retry
      // (or a legitimate follow-up webhook) can still resolve it correctly.
      return new Response(JSON.stringify({ error: "Payment signature verification failed" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const totalAmount = booking.total_amount;
    const commissionAmount = booking.commission_amount;
    const providerAmount = totalAmount - commissionAmount;

    const { error: updateError } = await supabaseAdmin
      .from("bookings")
      .update({ status: "pending", payment_id: razorpay_payment_id })
      .eq("id", booking.id);
    if (updateError) throw updateError;

    await supabaseAdmin
      .from("orders")
      .insert({
        booking_id: booking.id,
        customer_id: booking.customer_id,
        provider_id: booking.provider_id,
        total_amount: totalAmount,
        commission_amount: commissionAmount,
        provider_amount: providerAmount,
        payment_id: razorpay_payment_id,
        payment_status: "paid",
      });

    const { data: provider } = await supabaseAdmin
      .from("providers")
      .select("user_id")
      .eq("id", booking.provider_id)
      .maybeSingle();

    if (provider?.user_id) {
      await supabaseAdmin.from("messages").insert({
        booking_id: booking.id,
        sender_id: booking.customer_id,
        receiver_id: provider.user_id,
        content: "Payment confirmed",
        message_type: "payment_confirmation",
        card_data: {
          totalAmount,
          platformFee: commissionAmount,
          providerAmount,
          paymentId: razorpay_payment_id,
          paidAt: new Date().toISOString(),
          payoutNote: "Payouts processed on the 1st of every month",
        },
        is_read: false,
      });
    }

    return new Response(
      JSON.stringify({ success: true, paymentId: razorpay_payment_id, totalAmount, commissionAmount, providerAmount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.log("verify-razorpay-payment error:", err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
