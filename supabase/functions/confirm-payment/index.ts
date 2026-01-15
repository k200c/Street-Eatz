import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PaymentConfirmPayload {
  order_id?: string;          // UUID - used for initialization phase
  viva_order_code: string;    // Always required
  viva_transaction_id?: string;
  payment_status: "pending" | "paid" | "completed" | "failed" | "refunded";
  status?: "confirmed" | "preparing" | "ready" | "completed" | "cancelled";
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Only accept POST
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // Verify shared secret from n8n
    const authHeader = req.headers.get("Authorization");
    const expectedSecret = Deno.env.get("N8N_WEBHOOK_SECRET");
    
    if (!expectedSecret) {
      console.error("N8N_WEBHOOK_SECRET not configured");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!authHeader || authHeader !== `Bearer ${expectedSecret}`) {
      console.error("Unauthorized: Invalid or missing authorization");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse payload
    const payload: PaymentConfirmPayload = await req.json();
    console.log("📥 Received payload:", JSON.stringify(payload, null, 2));

    // Validate required fields
    if (!payload.viva_order_code || !payload.payment_status) {
      console.error("Missing required fields");
      return new Response(
        JSON.stringify({ error: "Missing required fields: viva_order_code, payment_status" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine operation mode
    const isInitialization = !!payload.order_id;
    const identifier = payload.order_id || payload.viva_order_code;
    console.log(`📌 Mode: ${isInitialization ? 'INITIALIZATION (by order_id)' : 'FINALIZATION (by viva_order_code)'}`);
    console.log(`📌 Identifier: ${identifier}`);

    // Initialize Supabase with SERVICE ROLE KEY to bypass RLS
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Build update object
    const updateData: Record<string, unknown> = {
      payment_status: payload.payment_status,
      updated_at: new Date().toISOString(),
    };

    // Always store viva_order_code (important for initialization phase)
    if (payload.viva_order_code) {
      updateData.viva_order_code = payload.viva_order_code;
    }

    if (payload.viva_transaction_id) {
      updateData.viva_transaction_id = payload.viva_transaction_id;
    }

    if (payload.status) {
      updateData.status = payload.status;
    }

    // Normalize 'paid' to 'completed' for consistency
    if (payload.payment_status === "paid") {
      updateData.payment_status = "completed";
    }

    // If payment completed/paid and no status override, set status to confirmed (triggers KDS)
    if ((payload.payment_status === "completed" || payload.payment_status === "paid") && !payload.status) {
      updateData.status = "confirmed";
      console.log("🍳 Auto-setting order status to 'confirmed' for kitchen display");
    }

    console.log("📝 Update data:", JSON.stringify(updateData, null, 2));

    // Build query based on identifier type
    let query = supabaseAdmin
      .from("orders")
      .update(updateData);

    if (isInitialization) {
      // Initialization phase: filter by order_id (UUID)
      query = query.eq("id", payload.order_id);
    } else {
      // Finalization phase: filter by viva_order_code
      query = query.eq("viva_order_code", payload.viva_order_code);
    }

    // Execute update WITHOUT .single() to avoid PGRST116 error
    const { data, error } = await query.select();

    if (error) {
      console.error("❌ Database update error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to update order", details: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if any rows were updated
    if (!data || data.length === 0) {
      console.error(`❌ Order not found for identifier: ${identifier}`);
      return new Response(
        JSON.stringify({ 
          error: `Order not found for identifier: ${identifier}`,
          search_field: isInitialization ? "id" : "viva_order_code",
          search_value: identifier
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const order = data[0];
    console.log(`✅ Successfully updated order ${order.id} (display: #${order.display_id})`);
    console.log(`   └─ payment_status: ${updateData.payment_status}`);
    console.log(`   └─ order status: ${updateData.status || order.status}`);
    console.log(`   └─ viva_order_code: ${order.viva_order_code}`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        order_id: order.id,
        display_id: order.display_id,
        payment_status: updateData.payment_status,
        status: updateData.status || order.status,
        viva_order_code: order.viva_order_code
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("❌ Error in confirm-payment:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
