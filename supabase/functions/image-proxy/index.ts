import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const { imageUrl, plantName } = await req.json();
    if (!imageUrl) throw new Error("No image URL provided");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // 1. Download the image
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error("Failed to download image from source");
    const blob = await response.blob();

    // 2. Prepare filename
    const safeName = (plantName || "plant")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "_");
    const fileExt = imageUrl.split(".").pop()?.split("?")[0] || "jpg";
    const fileName = `perenual-imports/${safeName}_${Date.now()}.${fileExt}`;

    // 3. Upload to Storage
    const { error: uploadError } = await supabase.storage
      .from("plant-images")
      .upload(fileName, blob, { contentType: blob.type });

    if (uploadError) throw uploadError;

    // 4. Get the permanent Public URL
    const {
      data: { publicUrl },
    } = supabase.storage.from("plant-images").getPublicUrl(fileName);

    return new Response(JSON.stringify({ publicUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
