import { RekognitionClient, SearchFacesByImageCommand } from "npm:@aws-sdk/client-rekognition@3.600.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { selfieUrl, collectionId } = await req.json();

    if (!selfieUrl || !collectionId) {
      return new Response(
        JSON.stringify({ error: "selfieUrl and collectionId are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const imageResponse = await fetch(selfieUrl);
    const arrayBuffer = await imageResponse.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    const client = new RekognitionClient({
      region: Deno.env.get("AWS_REGION") ?? "ap-south-1",
      credentials: {
        accessKeyId: Deno.env.get("AWS_ACCESS_KEY_ID")!,
        secretAccessKey: Deno.env.get("AWS_SECRET_ACCESS_KEY")!,
      },
    });

    const result = await client.send(new SearchFacesByImageCommand({
      CollectionId: collectionId,
      Image: { Bytes: bytes },
      MaxFaces: 100,
      FaceMatchThreshold: 80,
    }));

    const matches = result.FaceMatches ?? [];
    const matchedIds = matches.map((m) => m.Face?.ExternalImageId).filter(Boolean);

    return new Response(
      JSON.stringify({ matchedIds }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.log("search-face error:", err.message);
    return new Response(
      JSON.stringify({ error: err.message, matchedIds: [] }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});