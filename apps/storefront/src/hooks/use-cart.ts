'use client';

import { create } from 'zustand';

export interface CartItem {
  productId: string;
  variantId?: string;
  name: string;
  price: number;         // Unit price in smallest unit
  imageUrl: string | null;
  quantity: number;
  currencyCode: string;
  vendorId: string;
  slug: string;
}

interface CartState {
  items: CartItem[];
  addItem: (item: Omit<CartItem, 'quantity'>, quantity?: number) => void;
  removeItem: (productId: string, variantId?: string) => void;
  updateQuantity: (productId: string, variantId: string | undefined, quantity: number) => void;
  clearCart: () => void;
  getTotal: () => number;
  getItemCount: () => number;
  getCurrency: () => string;
}

export const useCart = create<CartState>((set, get) => ({
  items: [],

  addItem: (item, quantity = 1) => {
    set((state) => {
      const existing = state.items.find(
        (i) => i.productId === item.productId && i.variantId === item.variantId
      );

      if (existing) {
        return {
          items: state.items.map((i) =>
            i.productId === item.productId && i.variantId === item.variantId
              ? { ...i, quantity: i.quantity + quantity }
              : i
          ),
        };
      }

      return { items: [...state.items, { ...item, quantity }] };
    });
  },

  removeItem: (productId, variantId) => {
    set((state) => ({
      items: state.items.filter(
        (i) => !(i.productId === productId && i.variantId === variantId)
      ),
    }));
  },

  updateQuantity: (productId, variantId, quantity) => {
    if (quantity <= 0) {
      get().removeItem(productId, variantId);
      return;
    }

    set((state) => ({
      items: state.items.map((i) =>
        i.productId === productId && i.variantId === variantId
          ? { ...i, quantity }
          : i
      ),
    }));
  },

  clearCart: () => set({ items: [] }),

  getTotal: () => get().items.reduce((sum, i) => sum + i.price * i.quantity, 0),

  getItemCount: () => get().items.reduce((sum, i) => sum + i.quantity, 0),

  getCurrency: () => get().items[0]?.currencyCode || 'GHS',
}));
