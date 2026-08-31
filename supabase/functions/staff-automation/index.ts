import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Action = "crm_message" | "community_vote" | "social_generate" | "social_publish";

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const text = (value: unknown, maxLength: number) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

const upstreamUrl = (action: Action): string | null => {
  const keys: Record<Action, string> = {
    crm_message: "N8N_CRM_MESSAGE_URL",
    community_vote: "N8N_VOTING_WEBHOOK_URL",
    social_generate: "N8N_SOCIAL_GENERATE_URL",
    social_publish: "N8N_SOCIAL_PUBLISH_URL",
  };
  return Deno.env.get(keys[action]) ?? null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ error: "Staff automation is not configured" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    if (!(roles ?? []).some((row) => row.role === "staff" || row.role === "admin")) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const body = await req.json().catch(() => null) as {
      action?: Action;
      payload?: Record<string, unknown>;
    } | null;
    const action = body?.action;
    const payload = body?.payload ?? {};
    if (!action || !["crm_message", "community_vote", "social_generate", "social_publish"].includes(action)) {
      return jsonResponse({ error: "Unsupported automation action" }, 400);
    }

    const url = upstreamUrl(action);
    if (!url) return jsonResponse({ error: `${action} is not configured` }, 503);

    let canonicalPayload: Record<string, unknown>;
    let idempotencyKey = `${action}:${crypto.randomUUID()}`;

    if (action === "crm_message") {
      const phone = text(payload.phone, 40);
      if (!/^\+?[0-9 ()-]{7,40}$/.test(phone)) {
        return jsonResponse({ error: "A valid customer phone is required" }, 400);
      }
      canonicalPayload = {
        type: "personalized_message",
        phone,
        name: text(payload.name, 120) || "Valued Customer",
        requested_by: user.id,
      };
    } else if (action === "community_vote") {
      const options = Array.isArray(payload.options)
        ? payload.options.map((option) => text(option, 120)).filter(Boolean).slice(0, 10)
        : [];
      const title = text(payload.title, 160);
      const message = text(payload.message, 1_000);
      if (!title || !message || options.length < 2) {
        return jsonResponse({ error: "Vote title, message and at least two options are required" }, 400);
      }
      canonicalPayload = {
        title,
        message,
        options,
        send_sms: true,
        send_email: true,
        audience: "demo",
        vote_link: "",
        requested_by: user.id,
      };
    } else {
      const postId = text(payload.post_id, 80);
      if (!postId) return jsonResponse({ error: "post_id is required" }, 400);

      const { data: post, error: postError } = await admin
        .from("social_media_posts")
        .select("id, content_idea, idea, brief, generated_caption, media_urls, post_type, ai_preference, visual_prompt, status")
        .eq("id", postId)
        .maybeSingle();
      if (postError || !post) return jsonResponse({ error: "Post not found" }, 404);

      idempotencyKey = `${action}:${post.id}`;
      const referenceImageUrls = Array.isArray(payload.reference_image_urls)
        ? payload.reference_image_urls
            .map((value) => text(value, 2_000))
            .filter((value) => value.startsWith("https://"))
            .slice(0, 10)
        : [];
      canonicalPayload = action === "social_generate"
        ? {
            post_id: post.id,
            idea: post.idea ?? post.content_idea ?? "",
            brief: post.brief ?? "",
            post_type: post.post_type,
            ai_preference: post.ai_preference,
            media_urls: post.media_urls ?? [],
            visual_prompt: post.visual_prompt,
            reference_image_urls: referenceImageUrls,
          }
        : {
            post_id: post.id,
            content_idea: post.content_idea,
            generated_caption: post.generated_caption,
            media_urls: post.media_urls ?? [],
            post_type: post.post_type,
          };
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    };
    const webhookSecret = Deno.env.get("N8N_WEBHOOK_SECRET");
    if (webhookSecret) headers["x-webhook-secret"] = webhookSecret;

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(canonicalPayload),
      signal: AbortSignal.timeout(20_000),
    });
    const responseText = (await response.text()).slice(0, 20_000);
    if (!response.ok) {
      console.error("Staff automation upstream failure", { action, status: response.status });
      return jsonResponse({ error: "Automation service failed", upstream_status: response.status }, 502);
    }

    if (action === "social_publish") {
      await admin.from("social_media_posts").update({ status: "published" }).eq("id", canonicalPayload.post_id);
    }

    let result: unknown = {};
    try {
      result = responseText ? JSON.parse(responseText) : {};
    } catch {
      result = { acknowledged: true };
    }

    return jsonResponse({ success: true, result });
  } catch (error: unknown) {
    console.error("Staff automation error", error instanceof Error ? error.message : error);
    return jsonResponse({ error: "Staff automation failed" }, 500);
  }
});
