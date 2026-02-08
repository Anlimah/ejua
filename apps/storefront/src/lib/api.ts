/**
 * API client for the Ejua Marketplace Engine.
 *
 * In development: calls localhost:3001
 * In production: calls the API gateway or direct service URL
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

interface ApiOptions {
  method?: string;
  body?: unknown;
  token?: string;
  revalidate?: number;
}

class ApiError extends Error {
  status: number;
  errors: Array<{ code?: string; field?: string; message: string }>;

  constructor(status: number, errors: Array<{ code?: string; message: string }>) {
    super(errors[0]?.message || 'API Error');
    this.status = status;
    this.errors = errors;
  }
}

async function api<T = unknown>(endpoint: string, opts: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, token, revalidate } = opts;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Tenant-ID': process.env.NEXT_PUBLIC_TENANT_ID || '00000000-0000-0000-0000-000000000001',
  };

  if (token) headers['Authorization'] = `Bearer ${token}`;

  const fetchOpts: RequestInit & { next?: { revalidate: number } } = {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  };

  // Next.js ISR: revalidate cached data after N seconds
  if (revalidate !== undefined && method === 'GET') {
    fetchOpts.next = { revalidate };
  }

  const res = await fetch(`${API_BASE}${endpoint}`, fetchOpts);
  const json = await res.json();

  if (!res.ok) {
    throw new ApiError(res.status, json.errors || [{ message: json.message || 'Request failed' }]);
  }

  return json.data;
}

// ─── PRODUCTS ────────────────────────────────

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  sale_price: number | null;
  currency_code: string;
  image_url: string | null;
  is_active: boolean;
  is_featured: boolean;
  vendor_id: string;
  category_id: string;
  stock_quantity: number;
  installment_preview?: {
    monthly_amount: number;
    num_installments: number;
    down_payment: number;
  };
  variants?: ProductVariant[];
}

export interface ProductVariant {
  id: string;
  name: string;
  sku: string;
  price_override: number | null;
  stock_quantity: number;
  attributes: Record<string, string>;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  children?: Category[];
}

export const products = {
  list: (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return api<{ data: Product[]; pagination: unknown }>(`/products${query}`, { revalidate: 60 });
  },

  featured: () =>
    api<Product[]>('/products/featured', { revalidate: 300 }),

  getBySlug: (slug: string) =>
    api<Product>(`/p/${slug}`, { revalidate: 120 }),

  getById: (id: string) =>
    api<Product>(`/products/${id}`, { revalidate: 120 }),
};

export const categories = {
  tree: () =>
    api<Category[]>('/categories/tree', { revalidate: 600 }),

  list: () =>
    api<Category[]>('/categories', { revalidate: 600 }),
};

// ─── ORDERS ──────────────────────────────────

export interface OrderItem {
  product_id: string;
  variant_id?: string;
  quantity: number;
}

export interface Order {
  id: string;
  order_number: string;
  status: string;
  total_amount: number;
  currency_code: string;
  items: Array<{
    product_name: string;
    unit_price: number;
    quantity: number;
    total_price: number;
  }>;
  created_at: string;
  allowed_transitions?: string[];
}

export const orders = {
  create: (items: OrderItem[], shippingAddress: unknown, token: string) =>
    api<{ order: Order; items: unknown[] }>('/orders', {
      method: 'POST',
      body: { items, shipping_address: shippingAddress },
      token,
    }),

  checkoutPaystack: (orderId: string, email: string, channels: string[], token: string) =>
    api<{ authorization_url: string; reference: string }>(`/orders/${orderId}/checkout/paystack`, {
      method: 'POST',
      body: { email, channels },
      token,
    }),

  checkoutBnpl: (orderId: string, data: unknown, token: string) =>
    api<unknown>(`/orders/${orderId}/checkout/bnpl`, {
      method: 'POST',
      body: data,
      token,
    }),

  getByNumber: (orderNumber: string, token: string) =>
    api<Order>(`/orders/number/${orderNumber}`, { token }),

  myOrders: (token: string, params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return api<{ data: Order[]; pagination: unknown }>(`/my/orders${query}`, { token });
  },
};

// ─── AUTH ────────────────────────────────────

export interface AuthResponse {
  token: string;
  user: { id: string; email: string; phone: string; first_name: string; role: string };
}

export const auth = {
  register: (data: { phone: string; password: string; first_name: string; last_name?: string }) =>
    api<AuthResponse>('/auth/register', { method: 'POST', body: data }),

  login: (data: { phone: string; password: string }) =>
    api<AuthResponse>('/auth/login', { method: 'POST', body: data }),
};

// ─── VENDORS / STORES ────────────────────────

export interface Vendor {
  id: string;
  store_name: string;
  slug: string;
  description: string;
  logo_url: string | null;
  is_active: boolean;
}

export const vendors = {
  getBySlug: (slug: string) =>
    api<Vendor>(`/stores/${slug}`, { revalidate: 300 }),
};

export { api, ApiError };
