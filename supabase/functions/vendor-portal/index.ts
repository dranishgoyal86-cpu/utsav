import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
};

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { action, token, content, messageType, cardData, messageId } = await req.json();

    if (!token) {
      return new Response(JSON.stringify({ error: "token required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate token first, on every action — this is the entire security boundary
    const { data: vendor, error: vendorError } = await supabaseAdmin
      .from("personal_vendors")
      .select("id, name, category, customer_id, token_expires_at")
      .eq("access_token", token)
      .maybeSingle();

    if (vendorError || !vendor) {
      return new Response(JSON.stringify({ error: "Invalid link" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (new Date(vendor.token_expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "This link has expired" }), {
        status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "get_messages") {
      const { data: messages } = await supabaseAdmin
        .from("personal_vendor_messages")
        .select("*")
        .eq("vendor_id", vendor.id)
        .order("created_at", { ascending: true });

      // Mark customer messages as read since vendor just viewed them
      await supabaseAdmin
        .from("personal_vendor_messages")
        .update({ is_read: true })
        .eq("vendor_id", vendor.id)
        .eq("sender_type", "customer")
        .eq("is_read", false);

      return new Response(
        JSON.stringify({ vendor: { name: vendor.name, category: vendor.category }, messages: messages || [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "send_message") {
      if (!content?.trim()) {
        return new Response(JSON.stringify({ error: "content required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data, error } = await supabaseAdmin
        .from("personal_vendor_messages")
        .insert({
          vendor_id: vendor.id,
          sender_type: "vendor",
          content: content.trim(),
          message_type: messageType || "text",
          card_data: cardData || null,
        })
        .select()
        .single();

      if (error) throw error;
      return new Response(JSON.stringify({ message: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "confirm_card") {
      const { data: msg } = await supabaseAdmin
        .from("personal_vendor_messages")
        .select("confirmed_by")
        .eq("id", messageId)
        .eq("vendor_id", vendor.id) // ensures vendor can only touch their own thread's messages
        .maybeSingle();

      if (!msg) {
        return new Response(JSON.stringify({ error: "Message not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const updated = [...new Set([...(msg.confirmed_by || []), "vendor"])];
      await supabaseAdmin
        .from("personal_vendor_messages")
        .update({ confirmed_by: updated })
        .eq("id", messageId);

      return new Response(JSON.stringify({ confirmed_by: updated }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.log("vendor-portal error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});