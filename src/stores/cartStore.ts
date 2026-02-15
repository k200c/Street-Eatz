import { create } from 'zustand';
import { CartItem, Product, SelectedModifier, RemovedIngredient } from '@/types/database';
import { getModifierTotal } from '@/lib/pricingRules';
import { supabase } from '@/integrations/supabase/client';

// Generate a unique guest session ID
const getGuestSessionId = (): string => {
  const key = 'street-eats-guest-session';
  let sessionId = localStorage.getItem(key);
  if (!sessionId) {
    sessionId = `guest_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    localStorage.setItem(key, sessionId);
  }
  return sessionId;
};

interface CartStore {
  items: CartItem[];
  userId: string | null;
  isLoading: boolean;
  addItem: (product: Product, quantity: number, modifiers: SelectedModifier[], removedIngredients: RemovedIngredient[]) => Promise<void>;
  updateItem: (index: number, product: Product, quantity: number, modifiers: SelectedModifier[], removedIngredients: RemovedIngredient[]) => Promise<void>;
  removeItem: (index: number) => Promise<void>;
  updateQuantity: (index: number, quantity: number) => Promise<void>;
  clearCart: () => Promise<void>;
  getTotal: () => number;
  getItemCount: () => number;
  syncWithUser: (userId: string | null) => Promise<void>;
  loadCartFromSupabase: (userId: string) => Promise<void>;
  mergeGuestCartToUser: (userId: string) => Promise<void>;
}

// Helper to get guest cart storage key
const getGuestCartKey = () => `street-eats-cart-${getGuestSessionId()}`;

// Helper to load guest cart from localStorage
const loadGuestCart = (): CartItem[] => {
  try {
    const stored = localStorage.getItem(getGuestCartKey());
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load guest cart:', e);
  }
  return [];
};

// Helper to save guest cart to localStorage
const saveGuestCart = (items: CartItem[]) => {
  try {
    localStorage.setItem(getGuestCartKey(), JSON.stringify(items));
  } catch (e) {
    console.error('Failed to save guest cart:', e);
  }
};

// Helper to clear guest cart from localStorage
const clearGuestCart = () => {
  try {
    localStorage.removeItem(getGuestCartKey());
  } catch (e) {
    console.error('Failed to clear guest cart:', e);
  }
};

export const useCartStore = create<CartStore>()((set, get) => ({
  items: [],
  userId: null,
  isLoading: false,

  syncWithUser: async (userId: string | null) => {
    const currentUserId = get().userId;
    
    // If same user, no need to sync
    if (currentUserId === userId) return;
    
    set({ userId, isLoading: true });
    
    if (userId) {
      // User logged in - merge guest cart and load from Supabase
      await get().mergeGuestCartToUser(userId);
      await get().loadCartFromSupabase(userId);
    } else {
      // User logged out - load guest cart from localStorage
      const guestItems = loadGuestCart();
      set({ items: guestItems, isLoading: false });
    }
  },

  loadCartFromSupabase: async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('cart_items')
        .select(`
          id,
          product_id,
          quantity,
          selected_modifiers,
          removed_ingredients,
          products (
            id,
            name,
            description,
            price,
            category,
            image_url,
            is_available,
            is_featured,
            stock_count
          )
        `)
        .eq('user_id', userId);

      if (error) {
        console.error('Failed to load cart from Supabase:', error);
        set({ isLoading: false });
        return;
      }

      const items: CartItem[] = (data || []).map((item: any) => {
        const modifiers = (item.selected_modifiers || []) as SelectedModifier[];
        const modifiersTotal = modifiers.reduce((sum, m) => sum + getModifierTotal(m), 0);
        
        return {
          product: item.products as Product,
          quantity: item.quantity,
          selectedModifiers: modifiers,
          removedIngredients: (item.removed_ingredients || []) as RemovedIngredient[],
          totalPrice: (item.products.price + modifiersTotal) * item.quantity,
          dbId: item.id, // Store the database ID for updates/deletes
        };
      });

      set({ items, isLoading: false });
    } catch (e) {
      console.error('Failed to load cart:', e);
      set({ isLoading: false });
    }
  },

  mergeGuestCartToUser: async (userId: string) => {
    const guestItems = loadGuestCart();
    
    if (guestItems.length === 0) return;

    try {
      // Insert guest items into Supabase for the user
      for (const item of guestItems) {
        await supabase.from('cart_items').insert({
          user_id: userId,
          product_id: item.product.id,
          quantity: item.quantity,
          selected_modifiers: item.selectedModifiers as any,
          removed_ingredients: item.removedIngredients as any,
        } as any);
      }

      // Clear guest cart after successful merge
      clearGuestCart();
    } catch (e) {
      console.error('Failed to merge guest cart:', e);
    }
  },

  addItem: async (product, quantity, modifiers, removedIngredients) => {
    const { userId } = get();
    const modifiersTotal = modifiers.reduce((sum, m) => sum + getModifierTotal(m), 0);
    const totalPrice = (product.price + modifiersTotal) * quantity;

    const newItem: CartItem = {
      product,
      quantity,
      selectedModifiers: modifiers,
      removedIngredients,
      totalPrice,
    };

    if (userId) {
      // Save to Supabase for authenticated users
      try {
        const { data, error } = await supabase
          .from('cart_items')
          .insert({
            user_id: userId,
            product_id: product.id,
            quantity,
            selected_modifiers: modifiers as any,
            removed_ingredients: removedIngredients as any,
          } as any)
          .select()
          .single();

        if (error) {
          console.error('Failed to add item to cart:', error);
          return;
        }

        newItem.dbId = data.id;
        set((state) => ({ items: [...state.items, newItem] }));
      } catch (e) {
        console.error('Failed to add item:', e);
      }
    } else {
      // Save to localStorage for guest users
      set((state) => {
        const newItems = [...state.items, newItem];
        saveGuestCart(newItems);
        return { items: newItems };
      });
    }
  },

  updateItem: async (index, product, quantity, modifiers, removedIngredients) => {
    const { userId, items } = get();
    const existingItem = items[index];
    
    if (!existingItem) return;

    const modifiersTotal = modifiers.reduce((sum, m) => sum + getModifierTotal(m), 0);
    const totalPrice = (product.price + modifiersTotal) * quantity;

    const updatedItem: CartItem = {
      product,
      quantity,
      selectedModifiers: modifiers,
      removedIngredients,
      totalPrice,
      dbId: existingItem.dbId,
    };

    if (userId && existingItem.dbId) {
      // Update in Supabase for authenticated users
      try {
        const { error } = await supabase
          .from('cart_items')
          .update({
            product_id: product.id,
            quantity,
            selected_modifiers: modifiers as any,
            removed_ingredients: removedIngredients as any,
          })
          .eq('id', existingItem.dbId);

        if (error) {
          console.error('Failed to update cart item:', error);
          return;
        }
      } catch (e) {
        console.error('Failed to update item:', e);
        return;
      }
    }

    set((state) => {
      const newItems = state.items.map((item, i) => i === index ? updatedItem : item);
      if (!userId) {
        saveGuestCart(newItems);
      }
      return { items: newItems };
    });
  },

  removeItem: async (index) => {
    const { userId, items } = get();
    const item = items[index];

    if (!item) return;

    if (userId && item.dbId) {
      // Remove from Supabase for authenticated users
      try {
        const { error } = await supabase
          .from('cart_items')
          .delete()
          .eq('id', item.dbId);

        if (error) {
          console.error('Failed to remove item from cart:', error);
          return;
        }
      } catch (e) {
        console.error('Failed to remove item:', e);
        return;
      }
    }

    set((state) => {
      const newItems = state.items.filter((_, i) => i !== index);
      if (!userId) {
        saveGuestCart(newItems);
      }
      return { items: newItems };
    });
  },

  updateQuantity: async (index, quantity) => {
    const { userId, items } = get();
    const item = items[index];

    if (!item) return;

    if (userId && item.dbId) {
      // Update in Supabase for authenticated users
      try {
        const { error } = await supabase
          .from('cart_items')
          .update({ quantity })
          .eq('id', item.dbId);

        if (error) {
          console.error('Failed to update item quantity:', error);
          return;
        }
      } catch (e) {
        console.error('Failed to update quantity:', e);
        return;
      }
    }

    set((state) => {
      const newItems = state.items.map((item, i) => {
        if (i !== index) return item;
        const modifiersTotal = item.selectedModifiers.reduce(
          (sum, m) => sum + getModifierTotal(m),
          0
        );
        return {
          ...item,
          quantity,
          totalPrice: (item.product.price + modifiersTotal) * quantity,
        };
      });
      if (!userId) {
        saveGuestCart(newItems);
      }
      return { items: newItems };
    });
  },

  clearCart: async () => {
    const { userId } = get();

    if (userId) {
      // Clear from Supabase for authenticated users
      try {
        const { error } = await supabase
          .from('cart_items')
          .delete()
          .eq('user_id', userId);

        if (error) {
          console.error('Failed to clear cart:', error);
        }
      } catch (e) {
        console.error('Failed to clear cart:', e);
      }
    } else {
      // Clear guest cart from localStorage
      clearGuestCart();
    }

    set({ items: [] });
  },

  getTotal: () => {
    return get().items.reduce((sum, item) => sum + item.totalPrice, 0);
  },

  getItemCount: () => {
    return get().items.reduce((sum, item) => sum + item.quantity, 0);
  },
}));
