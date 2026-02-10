import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface UpdatePostPayload {
  post_id: string;
  status?: string;
  generated_caption?: string;
  media_urls?: string[] | string;
}

/** Normalize media_urls from array, CSV string, or JSON-stringified array into string[] */
function parseMediaUrls(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    console.log("media_urls format: array");
    return raw.map((u: unknown) => String(u).trim()).filter(Boolean);
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.startsWith("[")) {
      console.log("media_urls format: json-string");
      const parsed = JSON.parse(trimmed);
      if (!Array.isArray(parsed)) {
        throw new Error("media_urls JSON string did not parse to an array");
      }
      return parsed.map((u: unknown) => String(u).trim()).filter(Boolean);
    }
    console.log("media_urls format: csv");
    return trimmed.split(",").map((u) => u.trim()).filter(Boolean);
  }
  throw new Error("media_urls must be an array or string");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload: UpdatePostPayload = await req.json();
    console.log("Incoming payload keys:", Object.keys(payload), "post_id:", payload.post_id);

    if (!payload.post_id || typeof payload.post_id !== "string" || !payload.post_id.trim()) {
      return new Response(
        JSON.stringify({ error: "Missing required field: post_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const updateData: Record<string, string | string[]> = {};

    if (payload.status !== undefined) {
      updateData.status = payload.status;
    }
    if (payload.generated_caption !== undefined) {
      updateData.generated_caption = payload.generated_caption;
    }

    // Parse and add media_urls if provided
    if (payload.media_urls !== undefined) {
      try {
        const parsed = parseMediaUrls(payload.media_urls);
        console.log(`media_urls parsed: ${parsed.length} url(s)`);
        updateData.media_urls = parsed;
      } catch (e) {
        console.error("media_urls parse error:", e.message);
        return new Response(
          JSON.stringify({ error: `Invalid media_urls: ${e.message}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (Object.keys(updateData).length === 0) {
      return new Response(
        JSON.stringify({ error: "No fields to update. Provide status, generated_caption, or media_urls." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Updating post ${payload.post_id} with fields:`, Object.keys(updateData));

    const { data, error } = await supabase
      .from("social_media_posts")
      .update(updateData)
      .eq("id", payload.post_id)
      .select()
      .single();

    if (error) {
      console.error("Database update error:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Post updated successfully:", data.id);
    return new Response(
      JSON.stringify({ success: true, post: data }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in update-social-post:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
