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

    const body = await req.json();
    const orderId = typeof body.order_id === "string" ? body.order_id.trim() : "";
    const reviewSmsSid = typeof body.review_sms_sid === "string" ? body.review_sms_sid.trim() : null;

    if (!orderId) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing required field: order_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Check current state
    const { data: order, error: fetchError } = await supabaseAdmin
      .from("orders")
      .select("id, review_sms_sent")
      .eq("id", orderId)
      .single();

    if (fetchError || !order) {
      const notFound = fetchError?.code === "PGRST116";
      return new Response(
        JSON.stringify({ ok: false, error: notFound ? "Order not found" : "Database error", details: fetchError?.message }),
        { status: notFound ? 404 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Already marked — idempotent success
    if (order.review_sms_sent === true) {
      console.log(`ℹ️ Order ${orderId} already marked as review SMS sent`);
      return new Response(
        JSON.stringify({ ok: true, order_id: orderId, already_marked: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update — only if still false (race-condition guard)
    const updateData: Record<string, unknown> = {
      review_sms_sent: true,
      review_sms_sent_at: new Date().toISOString(),
    };
    if (reviewSmsSid) {
      updateData.review_sms_sid = reviewSmsSid;
    }

    const { error: updateError } = await supabaseAdmin
      .from("orders")
      .update(updateData)
      .eq("id", orderId)
      .eq("review_sms_sent", false); // Only update if still false

    if (updateError) {
      console.error("❌ Update error:", updateError);
      return new Response(
        JSON.stringify({ ok: false, error: "Failed to update order", details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`✅ Marked order ${orderId} as review SMS sent`);
    return new Response(
      JSON.stringify({ ok: true, order_id: orderId, marked_sent: true }),
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
