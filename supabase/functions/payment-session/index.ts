import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const receiptModifiers = (value: unknown): string[] => {
  if (!value || typeof value !== "object") return [];
  const shape = value as {
    modifiers?: Array<{ name?: string }>;
    removed_ingredients?: string[];
    removedIngredients?: Array<string | { name?: string }>;
    added_extras?: string[];
  };
  const result: string[] = [];
  for (const modifier of shape.modifiers ?? []) if (modifier?.name) result.push(String(modifier.name));
  for (const ingredient of shape.removed_ingredients ?? []) if (ingredient) result.push(`No ${ingredient}`);
  for (const ingredient of shape.removedIngredients ?? []) {
    const name = typeof ingredient === "string" ? ingredient : ingredient?.name;
    if (name) result.push(`No ${name}`);
  }
  for (const extra of shape.added_extras ?? []) if (extra) result.push(`Extra ${extra}`);
  return [...new Set(result)];
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ error: "Payment service is not configured" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => null) as {
      action?: "start" | "status";
      order_id?: string;
      order_code?: string;
      payment_type?: "online" | "terminal" | "POSCash" | "payment_link";
      customer_email?: string;
      amount_tendered?: number;
    } | null;
    if (!body?.action) return jsonResponse({ error: "action is required" }, 400);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    const isStaff = (roles ?? []).some((row) => row.role === "staff" || row.role === "admin");

    if (body.action === "status") {
      const orderCode = String(body.order_code ?? "").trim().slice(0, 200);
      if (!orderCode) return jsonResponse({ error: "order_code is required" }, 400);
      const { data: order } = await admin
        .from("orders")
        .select("id, user_id, payment_status")
        .eq("viva_order_code", orderCode)
        .maybeSingle();
      if (!order) return jsonResponse({ error: "Order not found" }, 404);
      if (!isStaff && order.user_id !== user.id) return jsonResponse({ error: "Forbidden" }, 403);

      const statusUrlValue = Deno.env.get("N8N_PAYMENT_STATUS_URL");
      if (!statusUrlValue) return jsonResponse({ success: true, status: order.payment_status ?? "pending" });
      const statusUrl = new URL(statusUrlValue);
      statusUrl.searchParams.set("orderCode", orderCode);
      const statusHeaders: Record<string, string> = {};
      const sharedSecret = Deno.env.get("N8N_WEBHOOK_SECRET");
      if (sharedSecret) statusHeaders.Authorization = `Bearer ${sharedSecret}`;
      const response = await fetch(statusUrl, { headers: statusHeaders, signal: AbortSignal.timeout(15_000) });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result || typeof result !== "object") {
        return jsonResponse({ error: "Payment status service unavailable" }, 502);
      }
      return jsonResponse(result as Record<string, unknown>);
    }

    const orderId = String(body.order_id ?? "").trim();
    const paymentType = body.payment_type;
    if (!orderId || !paymentType) return jsonResponse({ error: "order_id and payment_type are required" }, 400);
    if (!isStaff && paymentType !== "online") return jsonResponse({ error: "Forbidden" }, 403);

    const [{ data: order, error: orderError }, { data: settings }] = await Promise.all([
      admin.from("orders").select(`
        id, display_id, user_id, total, payment_method, payment_status,
        customer_name, customer_phone, special_notes, order_channel,
        fulfillment_type, scheduled_for, created_at,
        order_items (product_name, quantity, unit_price, selected_modifiers)
      `).eq("id", orderId).maybeSingle(),
      admin.from("app_settings").select("card_payment_provider").eq("id", 1).maybeSingle(),
    ]);
    if (orderError || !order) return jsonResponse({ error: "Order not found" }, 404);
    if (!isStaff && order.user_id !== user.id) return jsonResponse({ error: "Forbidden" }, 403);
    if (!(order.order_items ?? []).length) return jsonResponse({ error: "Order has no items" }, 409);
    if (["paid", "completed"].includes(String(order.payment_status ?? "").toLowerCase())) {
      return jsonResponse({ error: "Order is already paid" }, 409);
    }

    const total = Number(order.total);
    if (!Number.isFinite(total) || total <= 0) return jsonResponse({ error: "Invalid order total" }, 409);
    const email = String(body.customer_email ?? "").trim().slice(0, 254);
    // Email is optional (guest checkout asks for name + phone). If one is
    // given it must look like an email; Viva only receives it when present.
    if (paymentType === "online" && email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse({ error: "Please check the email address, or leave it blank" }, 400);
    }

    const amountTendered = Number(body.amount_tendered ?? 0);
    if (paymentType === "POSCash" && (!Number.isFinite(amountTendered) || amountTendered < total)) {
      return jsonResponse({ error: "Cash tendered is below the order total" }, 400);
    }

    const items = (order.order_items ?? []).map((item) => ({
      name: item.product_name ?? "Unknown Item",
      quantity: item.quantity ?? 1,
      price: Number(item.unit_price),
      unit_price: Number(item.unit_price),
      modifiers: receiptModifiers(item.selected_modifiers),
    }));
    const paymentProvider = settings?.card_payment_provider === "mypos" ? "mypos" : "viva";
    const payload = {
      order_id: order.id,
      display_id: order.display_id,
      total_amount: total,
      user_id: order.user_id,
      payment_method: paymentType === "POSCash" ? "cash" : paymentType === "payment_link" ? "resend_link" : "card",
      paymenttype: paymentType,
      payment_status: paymentType === "POSCash" ? "paid" : "pending",
      customer_name: order.customer_name ?? "",
      customer_email: email,
      customer_phone: order.customer_phone ?? "",
      items,
      timestamp: order.created_at,
      order_source: order.order_channel ?? (isStaff ? "staff" : "web"),
      special_notes: order.special_notes ?? "",
      fulfillment_type: order.fulfillment_type ?? "asap",
      scheduled_for: order.scheduled_for,
      payment_provider: paymentProvider,
      ...(paymentType === "POSCash" ? {
        amount_tendered: amountTendered,
        change_due: Math.round((amountTendered - total) * 100) / 100,
      } : {}),
    };

    const paymentUrl = Deno.env.get("N8N_PAYMENT_WEBHOOK_URL");
    if (!paymentUrl) return jsonResponse({ error: "Payment workflow is not configured" }, 503);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Idempotency-Key": paymentType === "payment_link"
        ? `payment:${order.id}:link:${crypto.randomUUID()}`
        : `payment:${order.id}:${paymentType}`,
    };
    const sharedSecret = Deno.env.get("N8N_WEBHOOK_SECRET");
    if (sharedSecret) headers["x-webhook-secret"] = sharedSecret;
    const response = await fetch(paymentUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });
    const responseText = (await response.text()).slice(0, 20_000);
    let result: Record<string, unknown> = {};
    try {
      result = responseText ? JSON.parse(responseText) : {};
    } catch {
      result = {};
    }
    if (!response.ok) {
      console.error("Payment workflow failure", { order_id: order.id, status: response.status });
      return jsonResponse({ error: "Payment workflow failed", upstream_status: response.status }, 502);
    }

    if (paymentType === "POSCash") {
      await admin.from("orders").update({
        payment_method: "cash",
        payment_status: "paid",
        cash_tendered: amountTendered,
        change_due: Math.round((amountTendered - total) * 100) / 100,
        updated_at: new Date().toISOString(),
      }).eq("id", order.id);
    }

    return jsonResponse({ success: true, ...result });
  } catch (error: unknown) {
    console.error("Payment session error", error instanceof Error ? error.message : error);
    return jsonResponse({ error: "Payment service failed" }, 500);
  }
});
