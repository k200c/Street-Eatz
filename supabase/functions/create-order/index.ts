import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OrderItem {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  selected_modifiers: unknown[];
}

interface CreateOrderRequest {
  items: OrderItem[];
  total: number;
  payment_method: "card" | "cash" | "split";
  customer_name?: string;
  customer_phone?: string;
  cash_tendered?: number;
  change_due?: number;
  special_notes?: string;
}

serve(async (req) => {
  // Handle CORS preflight
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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const orderData: CreateOrderRequest = await req.json();

    console.log("Creating authenticated order", {
      user_id: user.id,
      item_count: Array.isArray(orderData.items) ? orderData.items.length : 0,
      payment_method: orderData.payment_method,
    });

    // Validation: Check required fields
    if (!orderData.items || orderData.items.length === 0) {
      return new Response(JSON.stringify({ error: "Order must contain at least one item" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (orderData.items.length > 50) {
      return new Response(JSON.stringify({ error: "Order contains too many line items" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!orderData.payment_method) {
      return new Response(JSON.stringify({ error: "Payment method is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!Number.isFinite(orderData.total) || orderData.total <= 0 || orderData.total > 10_000) {
      return new Response(JSON.stringify({ error: "Invalid order total" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if ((orderData.customer_name?.length ?? 0) > 120 || (orderData.customer_phone?.length ?? 0) > 40) {
      return new Response(JSON.stringify({ error: "Customer details are too long" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if ((orderData.special_notes?.length ?? 0) > 1_000) {
      return new Response(JSON.stringify({ error: "Order notes are too long" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate each item and verify prices against database
    const productIds = orderData.items.map((item) => item.product_id);
    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("id, price, name, is_available")
      .in("id", productIds);

    if (productsError) {
      console.error("Error fetching products:", productsError);
      return new Response(JSON.stringify({ error: "Failed to validate products" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create a map of product prices for validation
    const productMap = new Map(products?.map((p) => [p.id, p]) || []);

    // Validate each item
    let calculatedTotal = 0;
    for (const item of orderData.items) {
      const product = productMap.get(item.product_id);

      if (!product) {
        return new Response(JSON.stringify({ error: `Product not found: ${item.product_id}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!product.is_available) {
        return new Response(JSON.stringify({ error: `Product is not available: ${product.name}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Validate price matches (allow for modifier adjustments)
      // Base price validation - unit_price should be >= product price
      if (item.unit_price < product.price) {
        console.warn(`Price mismatch for ${product.name}: submitted ${item.unit_price}, expected >= ${product.price}`);
        return new Response(JSON.stringify({ error: `Invalid price for ${product.name}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!Number.isInteger(item.quantity) || item.quantity <= 0 || item.quantity > 100) {
        return new Response(JSON.stringify({ error: `Invalid quantity for ${product.name}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!Number.isFinite(item.unit_price) || item.unit_price <= 0 || item.unit_price > Number(product.price) + 100) {
        return new Response(JSON.stringify({ error: `Invalid unit price for ${product.name}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!Array.isArray(item.selected_modifiers) || item.selected_modifiers.length > 50) {
        return new Response(JSON.stringify({ error: `Invalid modifiers for ${product.name}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      calculatedTotal += item.unit_price * item.quantity;
    }

    // Validate total matches (with small tolerance for floating point)
    if (Math.abs(calculatedTotal - orderData.total) > 0.01) {
      console.warn(`Total mismatch: calculated ${calculatedTotal}, submitted ${orderData.total}`);
      return new Response(JSON.stringify({ error: "Order total does not match item prices" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine payment_status based on payment method
    // Card payments need to be verified via Viva Wallet callback
    // Cash/collection payments are unpaid until staff confirms
    const paymentStatus = orderData.payment_method === "card" ? "pending" : "unpaid";

    // Create the order
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        user_id: user.id,
        status: "pending",
        payment_method: orderData.payment_method,
        payment_status: paymentStatus,
        total: orderData.total,
        customer_name: orderData.customer_name || null,
        customer_phone: orderData.customer_phone || null,
        cash_tendered: orderData.cash_tendered || null,
        change_due: orderData.change_due || null,
        special_notes: orderData.special_notes || null,
      })
      .select()
      .single();

    if (orderError) {
      console.error("Error creating order:", orderError);
      return new Response(JSON.stringify({ error: "Failed to create order" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create order items
    const orderItems = orderData.items.map((item) => ({
      order_id: order.id,
      product_id: item.product_id,
      product_name: productMap.get(item.product_id)?.name ?? "Unknown Item",
      quantity: item.quantity,
      unit_price: item.unit_price,
      selected_modifiers: item.selected_modifiers,
    }));

    const { error: itemsError } = await supabase.from("order_items").insert(orderItems);

    if (itemsError) {
      console.error("Error creating order items:", itemsError);
      // Attempt to clean up the order
      await supabase.from("orders").delete().eq("id", order.id);
      return new Response(JSON.stringify({ error: "Failed to create order items" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Order created successfully:", order.id, "display_id:", order.display_id);

    return new Response(
      JSON.stringify({
        success: true,
        order_id: order.id,
        display_id: order.display_id,
        created_at: order.created_at,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    console.error("Create order error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
