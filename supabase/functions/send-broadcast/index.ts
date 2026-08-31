import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const N8N_BROADCAST_URL = Deno.env.get("N8N_BROADCAST_WEBHOOK_URL");
    if (!N8N_BROADCAST_URL) {
      console.error("N8N_BROADCAST_WEBHOOK_URL secret not configured");
      return new Response(
        JSON.stringify({ error: "Broadcast webhook not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check staff/admin role
    const { data: hasStaffRole } = await supabase.rpc("has_role", {
      _user_id: user.id,
      _role: "staff"
    });
    const { data: hasAdminRole } = await supabase.rpc("has_role", {
      _user_id: user.id,
      _role: "admin"
    });

    if (!hasStaffRole && !hasAdminRole) {
      return new Response(
        JSON.stringify({ error: "Forbidden: Staff access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload = await req.json();

    // Validate required fields
    if (
      typeof payload.title !== "string" || !payload.title.trim() || payload.title.length > 160 ||
      typeof payload.message !== "string" || !payload.message.trim() || payload.message.length > 1_600
    ) {
      return new Response(
        JSON.stringify({ error: "Invalid payload: missing title or message" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Marketing sends are intentionally limited to a predictable Ireland
    // contact window. Twilio does not enforce recipient-local quiet hours.
    const dublinHour = Number(new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Dublin",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date()));
    if (!Number.isInteger(dublinHour) || dublinHour < 8 || dublinHour >= 21) {
      return new Response(
        JSON.stringify({ error: "Marketing broadcasts are allowed from 08:00 to 21:00 Europe/Dublin" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const title = payload.title.trim();
    const submittedMessage = payload.message.trim();
    const message = /reply\s+stop\b/i.test(submittedMessage)
      ? submittedMessage
      : `${submittedMessage}\nReply STOP to opt out.`;

    if (message.length > 1_600) {
      return new Response(
        JSON.stringify({ error: "Message is too long after the required opt-out footer" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Forwarding broadcast: ${title}`);

    // Forward to n8n webhook
    const forwardHeaders: Record<string, string> = { "Content-Type": "application/json" };
    const webhookSecret = Deno.env.get("N8N_WEBHOOK_SECRET");
    if (webhookSecret) forwardHeaders["x-webhook-secret"] = webhookSecret;

    const response = await fetch(N8N_BROADCAST_URL, {
      method: "POST",
      headers: forwardHeaders,
      body: JSON.stringify({
        title,
        message,
        image_url: payload.image_url || null,
        sent_at: new Date().toISOString(),
        consent_required: "marketing_sms",
        exclude_opted_out: true,
        timezone: "Europe/Dublin",
      }),
    });

    if (!response.ok) {
      console.error(`N8N broadcast webhook failed with status: ${response.status}`);
      return new Response(
        JSON.stringify({ success: false, error: "Webhook delivery failed" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let recipientsCount = 0;
    try {
      const result = await response.json();
      const reported = Number(result?.recipients_count ?? result?.accepted_recipients ?? 0);
      if (Number.isInteger(reported) && reported >= 0) recipientsCount = reported;
    } catch {
      recipientsCount = 0;
    }

    console.log("Broadcast sent successfully:", title);
    return new Response(
      JSON.stringify({ success: true, recipients_count: recipientsCount }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in send-broadcast:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
