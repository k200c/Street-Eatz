import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_REVIEW_LINK = "https://g.page/r/streeteatz/review";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(
      JSON.stringify({ ok: false, error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // Auth: validate N8N_WEBHOOK_SECRET
    const authHeader = req.headers.get("Authorization");
    const expectedSecret = Deno.env.get("N8N_WEBHOOK_SECRET");

    if (!expectedSecret) {
      console.error("N8N_WEBHOOK_SECRET not configured");
      return new Response(
        JSON.stringify({ ok: false, error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!authHeader || authHeader !== `Bearer ${expectedSecret}`) {
      return new Response(
        JSON.stringify({ ok: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Query eligible orders: completed, not yet sent, completed > 60 min ago, has phone
    const { data, error } = await supabaseAdmin
      .from("orders")
      .select("id, customer_name, customer_phone, completed_at")
      .eq("status", "completed")
      .eq("review_sms_sent", false)
      .not("completed_at", "is", null)
      .lte("completed_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
      .not("customer_phone", "is", null)
      .neq("customer_phone", "")
      .order("completed_at", { ascending: true })
      .limit(100);

    if (error) {
      console.error("❌ Query error:", error);
      return new Response(
        JSON.stringify({ ok: false, error: "Database query failed", details: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const reviewLink = Deno.env.get("GOOGLE_REVIEW_LINK") || DEFAULT_REVIEW_LINK;

    const orders = (data || []).map((o) => ({
      order_id: o.id,
      customer_name: o.customer_name,
      customer_phone: o.customer_phone,
      completed_at: o.completed_at,
      review_link: reviewLink,
    }));

    console.log(`✅ Found ${orders.length} orders pending review SMS`);

    return new Response(
      JSON.stringify({ ok: true, count: orders.length, orders }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("❌ Unexpected error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
