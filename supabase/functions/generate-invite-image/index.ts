const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      // Not configured yet — a clear, actionable error instead of a generic
      // 500, since this is expected until the host sets the secret.
      return json({ error: "AI image generation isn't set up yet. Ask the app owner to run: supabase secrets set OPENAI_API_KEY=..." }, 501);
    }

    const { prompt } = await req.json();
    if (!prompt || typeof prompt !== "string") {
      return json({ error: "prompt is required" }, 400);
    }

    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: prompt.slice(0, 1000),
        n: 1,
        size: "1024x1024",
        quality: "standard",
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return json({ error: data?.error?.message || "Image generation failed" }, res.status);
    }

    const imageUrl = data?.data?.[0]?.url;
    if (!imageUrl) return json({ error: "No image was returned." }, 502);

    return json({ imageUrl });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
