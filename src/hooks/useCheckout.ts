import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCartStore } from "@/stores/cartStore";
import { toast } from "sonner";
import { getOrderSource } from "@/lib/orderSource";
import { reportCheckoutFailure } from "@/lib/checkoutAlerts";

interface CheckoutData {
  paymentMethod: "card" | "cash";
  amountTendered?: number;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  specialNotes?: string;
  fulfillmentType?: "asap" | "scheduled";
  scheduledFor?: string | null;
}

interface OrderResult {
  orderId: string;
  orderNumber: number;
  displayId: number;
  createdAt: string;
}

// Kitchen webhook is now routed through authenticated Edge Function

export function useCheckout() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingToKitchen, setIsSendingToKitchen] = useState(false);
  const { items, getTotal, clearCart } = useCartStore();

  /**
   * Submit order via DIRECT Supabase insert (bypasses Edge Function)
   * For card payments: cart stays until PaymentSuccess confirms via ?s= param
   * For cash payments: caller must explicitly call clearCart after sendToKitchen succeeds
   */
  const submitOrder = async (data: CheckoutData, shouldClearCart = false): Promise<OrderResult | null> => {
    if (items.length === 0) {
      toast.error("Cart is empty");
      return null;
    }

    setIsSubmitting(true);
    const total = getTotal();

    try {
      // Verify session before attempting insert (prevents 403 RLS errors)
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.user) {
        console.error("Session verification failed:", sessionError);
        void reportCheckoutFailure(supabase, "guest_session", sessionError?.message || "No session at order time");
        toast.error("Session expired. Please log in again.");
        return null;
      }

      // Calculate change due for cash payments
      const changeDue = data.paymentMethod === "cash" && data.amountTendered 
        ? data.amountTendered - total 
        : null;

      // Determine payment status based on method
      const paymentStatus = data.paymentMethod === "card" ? "pending" : "unpaid";
      const orderSource = getOrderSource();

      // Step 1: Insert order directly (BYPASS Edge Function)
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          user_id: session.user.id, // Required for RLS policy
          status: "pending",
          payment_method: data.paymentMethod,
          payment_status: paymentStatus,
          total,
          customer_name: data.customerName || null,
          customer_phone: data.customerPhone || null,
          special_notes: data.specialNotes || null,
          cash_tendered: data.paymentMethod === "cash" ? data.amountTendered : null,
          change_due: changeDue,
          order_channel: orderSource.channel,
          fulfillment_type: data.fulfillmentType ?? "asap",
          scheduled_for: data.scheduledFor ?? null,
        })
        .select("id, display_id, created_at")
        .single();

      if (orderError) {
        console.error("Order insert error:", orderError);
        // Handle 403/RLS errors specifically
        if (orderError.code === '42501' || orderError.message?.includes('row-level security')) {
          toast.error("Session expired. Please log in again.");
        } else {
          toast.error("Failed to create order. Please try again.");
        }
        throw orderError;
      }

      // Step 2: Build and insert order items
      const orderItems = items.map((item) => {
        // Separate regular modifiers from "Extra X" items
        const regularModifiers = item.selectedModifiers.filter(
          (m) => !m.name.startsWith("Extra ")
        );
        const addedExtras = item.selectedModifiers
          .filter((m) => m.name.startsWith("Extra "))
          .map((m) => m.name.replace("Extra ", ""));
        const removedIngredients = item.removedIngredients.map((i) => i.name);

        return {
          order_id: order.id,
          product_id: item.product.id,
          product_name: item.product.name,
          quantity: item.quantity,
          unit_price: item.totalPrice / item.quantity,
          selected_modifiers: {
            modifiers: regularModifiers.map((m) => ({
              name: m.name,
              price_adjustment: m.price_adjustment,
            })),
            removed_ingredients: removedIngredients,
            added_extras: addedExtras,
          },
        };
      });

      const { error: itemsError } = await supabase
        .from("order_items")
        .insert(orderItems);

      if (itemsError) {
        console.error("Order items insert error:", itemsError);
        // Cleanup: delete the order if items failed
        await supabase.from("orders").delete().eq("id", order.id);
        throw itemsError;
      }

      console.log("✅ Order created directly via Supabase:", order.id);

      // Only clear cart if explicitly requested (cash payments after kitchen confirmation)
      if (shouldClearCart) {
        clearCart();
      }

      return {
        orderId: order.id,
        orderNumber: order.display_id,
        displayId: order.display_id,
        createdAt: order.created_at,
      };
    } catch (error) {
      console.error("Checkout error:", error);
      const detail = error && typeof error === "object" && "message" in error ? String((error as { message: unknown }).message) : error;
      void reportCheckoutFailure(supabase, "order_create", detail);
      toast.error("Failed to place order. Please try again.");
      return null;
    } finally {
      setIsSubmitting(false);
    }
  };

  /** Ask the authenticated canonical dispatcher to release a saved order. */
  const sendToKitchen = async (
    orderResult: { orderId: string; orderNumber: number; createdAt: string },
  ): Promise<boolean> => {
    setIsSendingToKitchen(true);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('send-to-kitchen', {
        body: { order_id: orderResult.orderId },
      });

      if (fnError || !data?.success) {
        console.error("❌ Kitchen edge function error:", fnError);
        toast.error("Order saved, but kitchen handoff needs attention. Keep this screen open.");
        return false;
      }

      if (data.status === "queued" || data.status === "in_progress") {
        toast.success("Order saved and safely queued for the kitchen.");
      } else {
        toast.success("Order sent to Kitchen! 👨‍🍳");
      }
      return true;
    } catch (error) {
      console.error("❌ Kitchen error:", error);
      toast.error("Order saved, but kitchen handoff needs attention. Keep this screen open.");
      return false;
    } finally {
      setIsSendingToKitchen(false);
    }
  };

  return {
    submitOrder,
    sendToKitchen,
    clearCart,
    isSubmitting,
    isSendingToKitchen,
    total: getTotal(),
    itemCount: items.length,
    items,
  };
}
