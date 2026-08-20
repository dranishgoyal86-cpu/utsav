import { RekognitionClient, CreateCollectionCommand } from "npm:@aws-sdk/client-rekognition@3.600.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { collectionId } = await req.json();

    if (!collectionId) {
      return new Response(
        JSON.stringify({ error: "collectionId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const client = new RekognitionClient({
      region: Deno.env.get("AWS_REGION") ?? "ap-south-1",
      credentials: {
        accessKeyId: Deno.env.get("AWS_ACCESS_KEY_ID")!,
        secretAccessKey: Deno.env.get("AWS_SECRET_ACCESS_KEY")!,
      },
    });

    try {
      await client.send(new CreateCollectionCommand({ CollectionId: collectionId }));
    } catch (err) {
      if (err.name !== "ResourceAlreadyExistsException") {
        throw err;
      }
      // Collection already exists — treat as success, same as original helpers.js behavior
    }

    return new Response(
      JSON.stringify({ success: true, collectionId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.log("create-collection error:", err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});