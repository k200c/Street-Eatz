import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStaffCartStore } from "@/stores/staffCartStore";
import { toast } from "sonner";

interface StaffCheckoutData {
  paymentMethod: "card" | "cash";
  amountTendered?: number;
  customerName?: string;
  customerPhone?: string;
}

interface StaffOrderResult {
  orderId: string;
  displayId: number;
  createdAt: string;
}

// Kitchen webhook is now routed through authenticated Edge Function

export function useStaffCheckout() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingToKitchen, setIsSendingToKitchen] = useState(false);
  const { items, getTotal, clearCart } = useStaffCartStore();

  /**
   * Submit a staff POS order via DIRECT Supabase insert (bypasses Edge Function)
   */
  const submitOrder = async (data: StaffCheckoutData): Promise<StaffOrderResult | null> => {
    if (items.length === 0) {
      toast.error("Cart is empty");
      return null;
    }

    setIsSubmitting(true);
    const total = getTotal();

    try {
      // Calculate change due for cash payments
      const changeDue = data.paymentMethod === "cash" && data.amountTendered 
        ? data.amountTendered - total 
        : null;

      // Determine payment status based on method
      const paymentStatus = data.paymentMethod === "cash" ? "paid" : "pending";

      // Step 1: Insert order directly (BYPASS Edge Function)
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          status: "pending",
          payment_method: data.paymentMethod,
          payment_status: paymentStatus,
          total,
          customer_name: data.customerName || null,
          customer_phone: data.customerPhone || null,
          cash_tendered: data.paymentMethod === "cash" ? data.amountTendered : null,
          change_due: changeDue,
        })
        .select("id, display_id, created_at")
        .single();

      if (orderError) {
        console.error("Order insert error:", orderError);
        throw orderError;
      }

      // Step 2: Build and insert order items
      const orderItems = items.map((item) => ({
        order_id: order.id,
        product_id: item.product.id,
        product_name: item.product.name,
        quantity: item.quantity,
        unit_price: item.totalPrice / item.quantity,
        selected_modifiers: {
          modifiers: item.selectedModifiers.map((m) => ({
            name: m.name,
            price_adjustment: m.price_adjustment,
          })),
          removed_ingredients: item.removedIngredients.map((i) => i.name),
        },
      }));

      const { error: itemsError } = await supabase
        .from("order_items")
        .insert(orderItems);

      if (itemsError) {
        console.error("Order items insert error:", itemsError);
        // Cleanup: delete the order if items failed
        await supabase.from("orders").delete().eq("id", order.id);
        throw itemsError;
      }

      console.log("✅ Staff order created directly via Supabase:", order.id);

      return {
        orderId: order.id,
        displayId: order.display_id,
        createdAt: order.created_at,
      };
    } catch (error) {
      console.error("Staff checkout error:", error);
      toast.error("Failed to place order. Please try again.");
      return null;
    } finally {
      setIsSubmitting(false);
    }
  };

  /** Release the saved order through the database-canonical kitchen dispatcher. */
  const sendToKitchen = async (orderResult: StaffOrderResult): Promise<boolean> => {
    setIsSendingToKitchen(true);

    try {
      const { error: fnError } = await supabase.functions.invoke('send-to-kitchen', {
        body: { order_id: orderResult.orderId },
      });

      if (fnError) {
        console.error("❌ Staff POS: Kitchen edge function error:", fnError);
        return false;
      }

      return true;
    } catch (error) {
      console.error("❌ Staff POS: Kitchen error:", error);
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
