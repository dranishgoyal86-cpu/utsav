import { RekognitionClient, IndexFacesCommand } from "npm:@aws-sdk/client-rekognition@3.600.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { imageUrl, collectionId, photoId } = await req.json();

    if (!imageUrl || !collectionId || !photoId) {
      return new Response(
        JSON.stringify({ error: "imageUrl, collectionId and photoId are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the image server-side and convert to bytes
    const imageResponse = await fetch(imageUrl);
    const arrayBuffer = await imageResponse.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    const client = new RekognitionClient({
      region: Deno.env.get("AWS_REGION") ?? "ap-south-1",
      credentials: {
        accessKeyId: Deno.env.get("AWS_ACCESS_KEY_ID")!,
        secretAccessKey: Deno.env.get("AWS_SECRET_ACCESS_KEY")!,
      },
    });

    const result = await client.send(new IndexFacesCommand({
      CollectionId: collectionId,
      Image: { Bytes: bytes },
      ExternalImageId: photoId,
      DetectionAttributes: [],
    }));

    const faceId = result.FaceRecords?.[0]?.Face?.FaceId ?? null;

    return new Response(
      JSON.stringify({ faceId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.log("index-face error:", err.message);
    return new Response(
      JSON.stringify({ error: err.message, faceId: null }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});