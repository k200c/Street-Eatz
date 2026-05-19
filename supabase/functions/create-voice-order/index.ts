// create-voice-order — Street Eatz Voice Ordering Edge Function
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

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let body: VoiceOrderRequest;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    console.log("[voice-order] Received:", JSON.stringify(body));

    // ── Validate top-level ─────────────────────────────────────

    const customerName = (body.customer_name || "").trim();
    if (!customerName) return jsonResponse({ error: "customer_name is required" }, 400);

    const customerPhoneRaw = String(body.customer_phone || "").trim();
    if (!customerPhoneRaw) return jsonResponse({ error: "customer_phone is required" }, 400);
    const customerPhone = normalizePhone(customerPhoneRaw);

    const pmRaw = (body.payment_method || "cash").trim().toLowerCase();
    const paymentMethod: "cash" | "card" | "split" = PAYMENT_ALIASES[pmRaw] ?? "cash";

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return jsonResponse({ error: "items must be a non-empty array" }, 400);
    }

    // ── Fetch all products needed ──────────────────────────────

    const productNames = [...new Set(body.items.map((i) => i.product_name))];
    const { data: products, error: prodErr } = await supabase
      .from("products")
      .select("id, name, price, is_available, is_sold_out, is_visible")
      .in("name", productNames);

    if (prodErr) {
      console.error("[voice-order] Products DB error:", prodErr);
      return jsonResponse({ error: "Database error fetching products" }, 500);
    }

    const productMap = new Map<string, { id: string; name: string; price: number }>();
    for (const p of products ?? []) {
      if (p.is_available === false) {
        return jsonResponse({ error: `'${p.name}' is currently unavailable` }, 409);
      }
      if (p.is_sold_out === true) {
        return jsonResponse({ error: `'${p.name}' is sold out` }, 409);
      }
      if (p.is_visible === false) {
        return jsonResponse({ error: `Product not found: '${p.name}'` }, 404);
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

    const { data: allModifiers, error: modErr } = await supabase
      .from("modifiers")
      .select("id, name, price_adjustment, group_id");

    if (modErr) {
      console.error("[voice-order] Modifiers DB error:", modErr);
      return jsonResponse({ error: "Database error fetching modifiers" }, 500);
    }

    // Build case-insensitive modifier lookup
    const modifierMap = new Map<string, { name: string; price_adjustment: number }>();
    for (const m of allModifiers ?? []) {
      modifierMap.set(m.name.toLowerCase().trim(), {
        name: m.name,
        price_adjustment: Number(m.price_adjustment),
      });
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
      const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));

      // ── Resolve add-on modifier prices from DB ─────────────
      const resolvedModifiers: ReceiptModifier[] = [];
      const unresolvableAddons: string[] = [];

      for (const addon of item.addons ?? []) {
        const addonName = (addon.name || "").trim();
        if (!addonName) continue;

        const key = addonName.toLowerCase();
        const match = modifierMap.get(key);

        if (match) {
          // Exact match in modifiers table
          resolvedModifiers.push({
            name: match.name,
            price_adjustment: match.price_adjustment,
          });
        } else {
          // Try partial / fuzzy match
          let found: { name: string; price_adjustment: number } | null = null;
          for (const [mk, mv] of modifierMap) {
            if (mk.includes(key) || key.includes(mk)) {
              found = mv;
              break;
            }
          }
          if (found) {
            resolvedModifiers.push(found);
          } else {
            // Not in modifiers table — add as kitchen note, don't fail order
            console.warn(`[voice-order] Add-on '${addonName}' not found in modifiers table — adding as note`);
            unresolvableAddons.push(addonName);
          }
        }
      }

      // ── Build removed_ingredients list ─────────────────────
      // The app schema stores: removedIngredients: [{name: "..."}]
      const removedIngredients: { name: string }[] = (item.removed_ingredients ?? [])
        .filter((r) => r && r.name)
        .map((r) => ({ name: String(r.name).trim() }));

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
      if (item.notes) noteParts.push(item.notes.trim());
      if (unresolvableAddons.length) {
        noteParts.push("Extra: " + unresolvableAddons.join(", "));
      }
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
    if (body.special_notes?.trim()) notesParts.push(body.special_notes.trim());
    if (body.call_id) notesParts.push(`[call_id: ${body.call_id}]`);
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
      })
      .select("id, display_id, created_at")
      .single();

    if (orderError) {
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
      order_id: order.id,
      display_id: order.display_id,
      customer_name: customerName,
      customer_phone: customerPhone,
      created_at: order.created_at,
      total: orderTotal,
      receipt_lines: receiptLines,
      source: "voice",
    });
  } catch (error: unknown) {
    console.error("[voice-order] Unexpected error:", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
