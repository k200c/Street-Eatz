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

type ModifierShape = {
  modifiers?: Array<{ name?: string; price_adjustment?: number }>;
  removed_ingredients?: string[];
  removedIngredients?: Array<string | { name?: string }>;
  added_extras?: string[];
};

const receiptModifiers = (value: unknown): string[] => {
  if (!value || typeof value !== "object") return [];
  const shape = value as ModifierShape;
  const result: string[] = [];

  for (const modifier of shape.modifiers ?? []) {
    if (modifier?.name) result.push(String(modifier.name));
  }
  for (const ingredient of shape.removed_ingredients ?? []) {
    if (ingredient) result.push(`No ${ingredient}`);
  }
  for (const ingredient of shape.removedIngredients ?? []) {
    const name = typeof ingredient === "string" ? ingredient : ingredient?.name;
    if (name) result.push(`No ${name}`);
  }
  for (const extra of shape.added_extras ?? []) {
    if (extra) result.push(`Extra ${extra}`);
  }

  return [...new Set(result)];
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  let dispatchId: string | null = null;

  try {
    const n8nUrl = Deno.env.get("N8N_ORDER_WEBHOOK_URL");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!n8nUrl || !supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ error: "Kitchen dispatch is not configured" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401);

    const bearerToken = authHeader.replace(/^Bearer\s+/i, "");
    const isServiceCaller = bearerToken === serviceRoleKey;
    let callerUserId: string | null = null;

    if (!isServiceCaller) {
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: userError } = await userClient.auth.getUser();
      if (userError || !user) return jsonResponse({ error: "Unauthorized" }, 401);
      callerUserId = user.id;
    }

    const input = await req.json().catch(() => null) as { order_id?: string } | null;
    if (!input?.order_id) return jsonResponse({ error: "order_id is required" }, 400);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const [{ data: order, error: orderError }, { data: settings }] = await Promise.all([
      admin.from("orders").select(`
        id, display_id, user_id, total, payment_method, payment_status,
        customer_name, customer_phone, special_notes, order_channel,
        fulfillment_type, scheduled_for, kitchen_release_at, released_to_kitchen_at, created_at,
        order_items (product_name, quantity, unit_price, selected_modifiers)
      `).eq("id", input.order_id).maybeSingle(),
      admin.from("app_settings").select("current_wait_time").eq("id", 1).maybeSingle(),
    ]);

    if (orderError || !order) return jsonResponse({ error: "Order not found" }, 404);

    const { data: roleRows } = isServiceCaller
      ? { data: [] as Array<{ role: string }> }
      : await admin.from("user_roles").select("role").eq("user_id", callerUserId);
    const isStaff = (roleRows ?? []).some((row) => row.role === "staff" || row.role === "admin");
    if (!isServiceCaller && !isStaff && order.user_id !== callerUserId) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    if (!(order.order_items ?? []).length) {
      return jsonResponse({ error: "Order has no items and cannot be sent to the kitchen" }, 409);
    }

    if (
      order.payment_method === "card" &&
      !["paid", "completed"].includes(String(order.payment_status ?? "").toLowerCase())
    ) {
      return jsonResponse({ error: "Card payment is not confirmed" }, 409);
    }

    if (
      order.fulfillment_type === "scheduled" &&
      !order.released_to_kitchen_at &&
      (!order.kitchen_release_at || Date.parse(order.kitchen_release_at) > Date.now())
    ) {
      return jsonResponse({ error: "Scheduled order is not due for kitchen release yet" }, 409);
    }

    const paymentType = order.order_channel === "staff"
      ? order.payment_method === "cash" ? "POSCash" : "terminal"
      : order.payment_method === "cash" ? "collection" : "online";

    const canonicalPayload = {
      order_id: order.id,
      display_id: order.display_id,
      total_amount: Number(order.total),
      user_id: order.user_id,
      payment_method: order.payment_method,
      paymenttype: paymentType,
      payment_status: order.payment_status,
      customer_name: order.customer_name ?? "",
      customer_phone: order.customer_phone ?? "",
      customer_email: "",
      items: (order.order_items ?? []).map((item) => ({
        name: item.product_name ?? "Unknown Item",
        quantity: item.quantity ?? 1,
        price: Number(item.unit_price),
        modifiers: receiptModifiers(item.selected_modifiers),
      })),
      timestamp: order.created_at,
      order_source: order.order_channel ?? "web",
      special_notes: order.special_notes ?? "",
      fulfillment_type: order.fulfillment_type ?? "asap",
      scheduled_for: order.scheduled_for,
      store_meta: { wait_time: settings?.current_wait_time ?? null },
    };

    const { data: existing } = await admin
      .from("kitchen_dispatches")
      .select("id, status, attempts, updated_at")
      .eq("order_id", order.id)
      .maybeSingle();

    if (existing?.status === "sent") {
      return jsonResponse({ success: true, status: "already_sent", dispatch_id: existing.id });
    }
    if (existing?.status === "sending" && Date.now() - Date.parse(existing.updated_at) < 120_000) {
      return jsonResponse({ success: true, status: "in_progress", dispatch_id: existing.id }, 202);
    }

    if (!existing) {
      const { data: inserted, error: insertError } = await admin
        .from("kitchen_dispatches")
        .insert({ order_id: order.id, status: "sending", payload: canonicalPayload, attempts: 1 })
        .select("id, attempts")
        .single();

      if (insertError) {
        const { data: raced } = await admin
          .from("kitchen_dispatches")
          .select("id, status")
          .eq("order_id", order.id)
          .maybeSingle();
        return jsonResponse({ success: true, status: raced?.status ?? "in_progress", dispatch_id: raced?.id }, 202);
      }
      dispatchId = inserted.id;
    } else {
      const { data: claimed } = await admin
        .from("kitchen_dispatches")
        .update({
          status: "sending",
          payload: canonicalPayload,
          attempts: Math.min((existing.attempts ?? 0) + 1, 100),
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .eq("updated_at", existing.updated_at)
        .in("status", ["pending", "failed", "sending"])
        .select("id")
        .maybeSingle();

      if (!claimed) return jsonResponse({ success: true, status: "in_progress", dispatch_id: existing.id }, 202);
      dispatchId = claimed.id;
    }

    if (order.fulfillment_type === "scheduled" && !order.released_to_kitchen_at) {
      await admin.from("orders").update({
        released_to_kitchen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", order.id).is("released_to_kitchen_at", null);
    }

    const response = await fetch(n8nUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": order.id },
      body: JSON.stringify(canonicalPayload),
    });

    if (response.ok) {
      await admin.from("kitchen_dispatches").update({
        status: "sent",
        sent_at: new Date().toISOString(),
        next_attempt_at: null,
        last_error: null,
        updated_at: new Date().toISOString(),
      }).eq("id", dispatchId);
      return jsonResponse({ success: true, status: "sent", dispatch_id: dispatchId });
    }

    const errorBody = (await response.text()).slice(0, 500);
    const retryAt = new Date(Date.now() + 2 * 60_000).toISOString();
    await admin.from("kitchen_dispatches").update({
      status: "failed",
      last_error: `HTTP ${response.status}: ${errorBody}`,
      next_attempt_at: retryAt,
      updated_at: new Date().toISOString(),
    }).eq("id", dispatchId);

    return jsonResponse({ success: true, status: "queued", dispatch_id: dispatchId, retry_at: retryAt }, 202);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unexpected kitchen dispatch error";
    console.error("Kitchen dispatch error:", message);
    return jsonResponse({ error: "Kitchen dispatch failed", dispatch_id: dispatchId }, 500);
  }
});
