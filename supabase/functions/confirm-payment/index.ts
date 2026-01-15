import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PaymentConfirmPayload {
  viva_order_code: string;
  viva_transaction_id?: string;
  payment_status: "completed" | "failed" | "refunded";
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

    // Validate required fields
    if (!payload.viva_order_code || !payload.payment_status) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: viva_order_code, payment_status" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing payment confirmation for order code: ${payload.viva_order_code}`);

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

    if (payload.viva_transaction_id) {
      updateData.viva_transaction_id = payload.viva_transaction_id;
    }

    if (payload.status) {
      updateData.status = payload.status;
    }

    // If payment completed and no status override, set status to confirmed
    if (payload.payment_status === "completed" && !payload.status) {
      updateData.status = "confirmed";
    }

    // Update the order
    const { data, error } = await supabaseAdmin
      .from("orders")
      .update(updateData)
      .eq("viva_order_code", payload.viva_order_code)
      .select()
      .single();

    if (error) {
      console.error("Database update error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to update order", details: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!data) {
      console.error("No order found with viva_order_code:", payload.viva_order_code);
      return new Response(
        JSON.stringify({ error: "Order not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Successfully updated order ${data.id} - payment: ${payload.payment_status}, status: ${updateData.status}`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        order_id: data.id,
        display_id: data.display_id,
        payment_status: payload.payment_status,
        status: updateData.status
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in confirm-payment:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
