// create-voice-order — FoodOS Voice Ordering Edge Function
// ─────────────────────────────────────────────────────────────
// VERSION 2 — fixes:
//   • selected_modifiers written as {modifiers:[],removedIngredients:[]} matching app shape
//   • Modifier prices fetched from DB (modifiers table) — not trusted from payload
//   • removed_ingredients stored in removedIngredients — no longer silently dropped
//   • unit_price = base_price + sum(modifier.price_adjustment) matching app convention
//   • is_visible filter added to product validation
// ─────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function secretsMatch(received: string, expected: string): boolean {
  if (received.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < received.length; index++) {
    difference |= received.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

// ── Types ─────────────────────────────────────────────────────

interface IncomingAddon {
  name: string;
  quantity?: number;
}

interface IncomingItem {
  product_name: string;
  spoken_name?: string;
  quantity: number;
  // n8n Add-Ons node outputs these field names:
  addons?: IncomingAddon[]; // paid modifier add-ons (e.g. "Bacon", "Cheese")
  removed_ingredients?: { name: string }[]; // ingredients to remove
  notes?: string;
}

interface VoiceOrderRequest {
  customer_name: string;
  customer_phone: string;
  payment_method?: string;
  items: IncomingItem[];
  special_notes?: string;
  call_id?: string;
  fulfillment_type?: string;
  scheduled_for?: string;
  pickup_time?: string;
}

// ── Helpers ───────────────────────────────────────────────────

function normalizePhone(phone: string): string {
  let cleaned = String(phone || "").replace(/[^0-9+]/g, "");
  if (cleaned.startsWith("00353")) cleaned = "+353" + cleaned.slice(5);
  else if (/^8\d{8}$/.test(cleaned)) cleaned = "+353" + cleaned;
  else if (/^08\d{8}$/.test(cleaned)) cleaned = "+353" + cleaned.slice(1);
  else if (/^3538\d{8}$/.test(cleaned)) cleaned = "+" + cleaned;
  else if (!cleaned.startsWith("+")) cleaned = "+353" + cleaned;
  return cleaned;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const PAYMENT_ALIASES: Record<string, "cash" | "card" | "split"> = {
  cash: "cash",
  notes: "cash",
  coins: "cash",
  card: "card",
  debit: "card",
  credit: "card",
  contactless: "card",
  tap: "card",
  split: "split",
};

// ── Main handler ──────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const expectedSecret = Deno.env.get("VOICE_ORDER_WEBHOOK_SECRET") ?? Deno.env.get("N8N_WEBHOOK_SECRET");
    const receivedSecret = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (!expectedSecret) return jsonResponse({ error: "Voice ordering is not configured" }, 503);
    if (!secretsMatch(receivedSecret, expectedSecret)) return jsonResponse({ error: "Unauthorized" }, 401);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let body: VoiceOrderRequest;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const callId = String(body.call_id || "").trim();
    if (callId.length < 8 || callId.length > 200) {
      return jsonResponse({ error: "A valid call_id is required" }, 400);
    }

    const { data: existingOrder } = await supabase
      .from("orders")
      .select("id, display_id, created_at, total, customer_name, customer_phone, fulfillment_type, scheduled_for, kitchen_release_at")
      .eq("voice_call_id", callId)
      .maybeSingle();
    if (existingOrder) {
      return jsonResponse({
        ok: true,
        duplicate: true,
        should_dispatch: false,
        order_id: existingOrder.id,
        display_id: existingOrder.display_id,
        customer_name: existingOrder.customer_name,
        customer_phone: existingOrder.customer_phone,
        created_at: existingOrder.created_at,
        total: Number(existingOrder.total),
        fulfillment_type: existingOrder.fulfillment_type,
        scheduled_for: existingOrder.scheduled_for,
        kitchen_release_at: existingOrder.kitchen_release_at,
        source: "voice",
      });
    }

    console.log("[voice-order] Validated request", { call_id: callId, item_count: body.items?.length ?? 0 });

    // ── Validate top-level ─────────────────────────────────────

    const customerName = (body.customer_name || "").trim();
    if (!customerName || customerName.length > 120) {
      return jsonResponse({ error: "A valid customer_name is required" }, 400);
    }

    const customerPhoneRaw = String(body.customer_phone || "").trim();
    if (!customerPhoneRaw) return jsonResponse({ error: "customer_phone is required" }, 400);
    const customerPhone = normalizePhone(customerPhoneRaw);
    if (!/^\+353\d{8,10}$/.test(customerPhone)) {
      return jsonResponse({ error: "A valid Irish customer_phone is required" }, 400);
    }

    const pmRaw = (body.payment_method || "cash").trim().toLowerCase();
    const paymentMethod: "cash" | "card" | "split" = PAYMENT_ALIASES[pmRaw] ?? "cash";
    if (paymentMethod !== "cash") {
      return jsonResponse({ error: "Voice orders currently support pay-on-collection only" }, 400);
    }

    if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 50) {
      return jsonResponse({ error: "items must be a non-empty array" }, 400);
    }
    for (const item of body.items) {
      if (!item || typeof item !== "object" || typeof item.product_name !== "string") {
        return jsonResponse({ error: "Every item requires a product_name" }, 400);
      }
      item.product_name = item.product_name.trim();
      if (!item.product_name || item.product_name.length > 160) {
        return jsonResponse({ error: "Every item requires a valid product_name" }, 400);
      }
      if (item.addons !== undefined && (!Array.isArray(item.addons) || item.addons.length > 30)) {
        return jsonResponse({ error: `Invalid add-ons for '${item.product_name}'` }, 400);
      }
      if (
        item.removed_ingredients !== undefined &&
        (!Array.isArray(item.removed_ingredients) || item.removed_ingredients.length > 30)
      ) {
        return jsonResponse({ error: `Invalid removed ingredients for '${item.product_name}'` }, 400);
      }
    }

    const requestedFulfillment = String(body.fulfillment_type || "").trim().toLowerCase();
    if (requestedFulfillment && requestedFulfillment !== "asap" && requestedFulfillment !== "scheduled") {
      return jsonResponse({ error: "fulfillment_type must be 'asap' or 'scheduled'" }, 400);
    }

    const requestedCollectionTime = String(body.scheduled_for || body.pickup_time || "").trim();
    const fulfillmentType = requestedCollectionTime || requestedFulfillment === "scheduled" ? "scheduled" : "asap";
    let scheduledFor: string | null = null;
    if (fulfillmentType === "scheduled") {
      if (!requestedCollectionTime) {
        return jsonResponse({ error: "scheduled_for is required for a scheduled voice order" }, 400);
      }
      if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(requestedCollectionTime)) {
        return jsonResponse({ error: "scheduled_for must include an explicit timezone" }, 400);
      }
      const scheduledInstant = new Date(requestedCollectionTime);
      if (Number.isNaN(scheduledInstant.getTime())) {
        return jsonResponse({ error: "scheduled_for must be a valid ISO date and time" }, 400);
      }
      scheduledFor = scheduledInstant.toISOString();
    }

    // ── Fetch all products needed ──────────────────────────────

    const requestedProductNames = new Set(body.items.map((item) => item.product_name.toLowerCase()));
    const { data: products, error: prodErr } = await supabase
      .from("products")
      .select("id, name, price, is_available, is_sold_out, is_visible")
      .eq("is_visible", true);

    if (prodErr) {
      console.error("[voice-order] Products DB error:", prodErr);
      return jsonResponse({ error: "Database error fetching products" }, 500);
    }

    const productMap = new Map<string, { id: string; name: string; price: number }>();
    for (const p of products ?? []) {
      if (!requestedProductNames.has(p.name.toLowerCase())) continue;
      if (p.is_available === false) {
        return jsonResponse({ error: `'${p.name}' is currently unavailable` }, 409);
      }
      if (p.is_sold_out === true) {
        return jsonResponse({ error: `'${p.name}' is sold out` }, 409);
      }
      productMap.set(p.name.toLowerCase(), {
        id: p.id,
        name: p.name,
        price: Number(p.price),
      });
    }

    // Check all items resolved
    for (const item of body.items) {
      if (!productMap.has(item.product_name.toLowerCase())) {
        return jsonResponse({ error: `Product not found: '${item.product_name}'` }, 404);
      }
    }

    // ── Fetch all modifiers (for add-on pricing) ───────────────
    // We fetch all modifiers once and build a lookup map.
    // Prices are authoritative from the DB — never trusted from the payload.

    const productIds = [...productMap.values()].map((product) => product.id);
    const [
      { data: allModifiers, error: modErr },
      { data: productGroups, error: productGroupsError },
      { data: productIngredients, error: productIngredientsError },
    ] = await Promise.all([
      supabase.from("modifiers").select("id, name, price_adjustment, group_id"),
      supabase.from("product_modifiers").select("product_id, group_id").in("product_id", productIds),
      supabase
        .from("product_ingredients")
        .select("product_id, is_removable, ingredients(name)")
        .in("product_id", productIds),
    ]);

    if (modErr || productGroupsError || productIngredientsError) {
      console.error("[voice-order] Product option DB error", {
        modifiers: modErr?.message,
        groups: productGroupsError?.message,
        ingredients: productIngredientsError?.message,
      });
      return jsonResponse({ error: "Database error fetching product options" }, 500);
    }

    const allowedGroupsByProduct = new Map<string, Set<string>>();
    for (const row of productGroups ?? []) {
      if (!row.product_id || !row.group_id) continue;
      const groups = allowedGroupsByProduct.get(row.product_id) ?? new Set<string>();
      groups.add(row.group_id);
      allowedGroupsByProduct.set(row.product_id, groups);
    }

    const removableIngredientsByProduct = new Map<string, Map<string, string>>();
    for (const row of productIngredients ?? []) {
      const ingredient = Array.isArray(row.ingredients) ? row.ingredients[0] : row.ingredients;
      const ingredientName = ingredient && typeof ingredient === "object" && "name" in ingredient
        ? String(ingredient.name).trim()
        : "";
      if (!row.product_id || !row.is_removable || !ingredientName) continue;
      const ingredients = removableIngredientsByProduct.get(row.product_id) ?? new Map<string, string>();
      ingredients.set(ingredientName.toLowerCase(), ingredientName);
      removableIngredientsByProduct.set(row.product_id, ingredients);
    }

    // ── Build order items ──────────────────────────────────────

    type ReceiptModifier = { name: string; price_adjustment: number };
    type ReceiptLine = {
      product_name: string;
      quantity: number;
      base_price: number;
      unit_price: number;
      line_total: number;
      modifiers: ReceiptModifier[];
      removed_ingredients: string[];
      notes: string;
    };

    type DbOrderItem = {
      product_id: string;
      product_name: string;
      quantity: number;
      unit_price: number;
      selected_modifiers: {
        modifiers: ReceiptModifier[];
        removedIngredients: { name: string }[];
      };
    };

    const receiptLines: ReceiptLine[] = [];
    const dbOrderItems: DbOrderItem[] = [];

    for (const item of body.items) {
      const product = productMap.get(item.product_name.toLowerCase())!;
      const qty = Math.floor(Number(item.quantity));
      if (!Number.isInteger(qty) || qty < 1 || qty > 20) {
        return jsonResponse({ error: `Invalid quantity for '${product.name}'` }, 400);
      }

      // ── Resolve add-on modifier prices from DB ─────────────
      const resolvedModifiers: ReceiptModifier[] = [];
      const allowedGroupIds = allowedGroupsByProduct.get(product.id) ?? new Set<string>();
      const allowedModifiers = (allModifiers ?? []).filter((modifier) =>
        modifier.group_id && allowedGroupIds.has(modifier.group_id)
      );

      for (const addon of item.addons ?? []) {
        const addonName = (addon.name || "").trim();
        if (!addonName) continue;

        const key = addonName.toLowerCase();
        const match = allowedModifiers.find((modifier) => modifier.name.toLowerCase().trim() === key);
        if (!match) {
          return jsonResponse({ error: `'${addonName}' is not an available add-on for '${product.name}'` }, 409);
        }
        const addonQuantity = Math.floor(Number(addon.quantity ?? 1));
        if (!Number.isInteger(addonQuantity) || addonQuantity < 1 || addonQuantity > 10) {
          return jsonResponse({ error: `Invalid add-on quantity for '${addonName}'` }, 400);
        }
        resolvedModifiers.push({
          name: addonQuantity > 1 ? `${addonQuantity}× ${match.name}` : match.name,
          price_adjustment: round2(Number(match.price_adjustment) * addonQuantity),
        });
      }

      // ── Build removed_ingredients list ─────────────────────
      // The app schema stores: removedIngredients: [{name: "..."}]
      const removableIngredients = removableIngredientsByProduct.get(product.id) ?? new Map<string, string>();
      const removedIngredients: { name: string }[] = [];
      for (const requested of item.removed_ingredients ?? []) {
        const requestedName = String(requested?.name ?? "").trim();
        if (!requestedName) continue;
        const canonicalName = removableIngredients.get(requestedName.toLowerCase());
        if (!canonicalName) {
          return jsonResponse({ error: `'${requestedName}' cannot be removed from '${product.name}'` }, 409);
        }
        removedIngredients.push({ name: canonicalName });
      }

      // ── Calculate unit_price (matches app convention) ──────
      // App stores: unit_price = base_price + sum(modifier price_adjustments)
      const modifierPriceSum = resolvedModifiers.reduce((sum, m) => sum + m.price_adjustment, 0);
      const unitPrice = round2(product.price + modifierPriceSum);
      const lineTotal = round2(unitPrice * qty);

      // ── Build canonical selected_modifiers shape ────────────
      // MUST match the app's shape exactly:
      // { modifiers: [{name, price_adjustment}], removedIngredients: [{name}] }
      const selectedModifiers = {
        modifiers: resolvedModifiers,
        removedIngredients: removedIngredients,
      };

      // ── Build notes for this line ──────────────────────────
      const noteParts: string[] = [];
      if ((item.notes?.length ?? 0) > 500) return jsonResponse({ error: "Item notes are too long" }, 400);
      if (item.notes) noteParts.push(item.notes.trim());
      const lineNotes = noteParts.join("; ");

      dbOrderItems.push({
        product_id: product.id,
        product_name: product.name,
        quantity: qty,
        unit_price: unitPrice,
        selected_modifiers: selectedModifiers,
      });

      receiptLines.push({
        product_name: product.name,
        quantity: qty,
        base_price: product.price,
        unit_price: unitPrice,
        line_total: lineTotal,
        modifiers: resolvedModifiers,
        removed_ingredients: removedIngredients.map((r) => r.name),
        notes: lineNotes,
      });
    }

    // ── Calculate order total ──────────────────────────────────
    const orderTotal = round2(receiptLines.reduce((sum, l) => sum + l.line_total, 0));

    // ── Build special_notes string ─────────────────────────────
    const notesParts: string[] = [];
    if ((body.special_notes?.length ?? 0) > 1_000) {
      return jsonResponse({ error: "special_notes is too long" }, 400);
    }
    if (body.special_notes?.trim()) notesParts.push(body.special_notes.trim());
    const specialNotes = notesParts.length > 0 ? notesParts.join(" | ") : null;

    // ── Insert order ───────────────────────────────────────────
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        status: "pending",
        payment_method: paymentMethod,
        payment_status: "unpaid", // always unpaid — pay on collection
        total: orderTotal,
        customer_name: customerName,
        customer_phone: customerPhone,
        special_notes: specialNotes,
        order_channel: "voice",
        voice_call_id: callId,
        fulfillment_type: fulfillmentType,
        scheduled_for: scheduledFor,
      })
      .select("id, display_id, created_at, fulfillment_type, scheduled_for, kitchen_release_at")
      .single();

    if (orderError) {
      if (orderError.code === "23505") {
        const { data: replayedOrder } = await supabase
          .from("orders")
          .select("id, display_id, created_at, total, customer_name, customer_phone, fulfillment_type, scheduled_for, kitchen_release_at")
          .eq("voice_call_id", callId)
          .maybeSingle();
        if (replayedOrder) {
          return jsonResponse({
            ok: true,
            duplicate: true,
            should_dispatch: false,
            order_id: replayedOrder.id,
            display_id: replayedOrder.display_id,
            customer_name: replayedOrder.customer_name,
            customer_phone: replayedOrder.customer_phone,
            created_at: replayedOrder.created_at,
            total: Number(replayedOrder.total),
            fulfillment_type: replayedOrder.fulfillment_type,
            scheduled_for: replayedOrder.scheduled_for,
            kitchen_release_at: replayedOrder.kitchen_release_at,
            source: "voice",
          });
        }
      }
      console.error("[voice-order] Order insert error:", orderError);
      return jsonResponse({ error: "Failed to create order" }, 500);
    }

    // ── Insert order items ─────────────────────────────────────
    const itemsToInsert = dbOrderItems.map((item) => ({
      order_id: order.id,
      ...item,
    }));

    const { error: itemsError } = await supabase.from("order_items").insert(itemsToInsert);

    if (itemsError) {
      console.error("[voice-order] Order items insert error:", itemsError);
      // Roll back the order
      await supabase.from("orders").delete().eq("id", order.id);
      return jsonResponse({ error: "Failed to create order items" }, 500);
    }

    console.log(
      `[voice-order] ✅ Created: #${order.display_id} (${order.id})  total: €${orderTotal}  customer: ${customerName}`,
    );

    return jsonResponse({
      ok: true,
      duplicate: false,
      should_dispatch: fulfillmentType === "asap",
      order_id: order.id,
      display_id: order.display_id,
      customer_name: customerName,
      customer_phone: customerPhone,
      created_at: order.created_at,
      total: orderTotal,
      fulfillment_type: order.fulfillment_type,
      scheduled_for: order.scheduled_for,
      kitchen_release_at: order.kitchen_release_at,
      receipt_lines: receiptLines,
      source: "voice",
    });
  } catch (error: unknown) {
    console.error("[voice-order] Unexpected error:", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
