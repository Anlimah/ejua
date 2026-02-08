import { Suspense } from 'react';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import ProductCard from '@/components/product/ProductCard';
import { SlidersHorizontal } from 'lucide-react';

// In production, this page would use:
//   const data = await products.list(searchParams);
// Server component with ISR revalidation

const PRODUCTS = [
  { id: '1', name: 'Samsung Galaxy A15', slug: 'samsung-galaxy-a15', description: '', price: 259900, sale_price: null, currency_code: 'GHS', image_url: null, is_active: true, is_featured: true, vendor_id: 'v1', category_id: 'c1', stock_quantity: 50 },
  { id: '2', name: 'Kente Print Dress', slug: 'kente-print-dress', description: '', price: 45000, sale_price: 38000, currency_code: 'GHS', image_url: null, is_active: true, is_featured: true, vendor_id: 'v2', category_id: 'c2', stock_quantity: 20 },
  { id: '3', name: 'Nescafé Gold Jar 200g', slug: 'nescafe-gold-200g', description: '', price: 8500, sale_price: null, currency_code: 'GHS', image_url: null, is_active: true, is_featured: false, vendor_id: 'v3', category_id: 'c3', stock_quantity: 100 },
  { id: '4', name: 'JBL Tune 520BT', slug: 'jbl-tune-520bt', description: '', price: 52000, sale_price: 45000, currency_code: 'GHS', image_url: null, is_active: true, is_featured: true, vendor_id: 'v1', category_id: 'c1', stock_quantity: 35 },
  { id: '5', name: 'Shea Butter (500ml)', slug: 'shea-butter-500ml', description: '', price: 7500, sale_price: null, currency_code: 'GHS', image_url: null, is_active: true, is_featured: false, vendor_id: 'v4', category_id: 'c4', stock_quantity: 80 },
  { id: '6', name: 'Ankara Laptop Bag', slug: 'ankara-laptop-bag', description: '', price: 18000, sale_price: 15500, currency_code: 'GHS', image_url: null, is_active: true, is_featured: false, vendor_id: 'v2', category_id: 'c2', stock_quantity: 30 },
];

export default function ProductsPage() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
        {/* Page header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="section-heading">All Products</h1>
            <p className="mt-1 text-sm text-gray-500">{PRODUCTS.length} products</p>
          </div>

          <div className="flex items-center gap-3">
            <button className="btn-ghost flex items-center gap-2 rounded-xl border border-gray-200 !px-4 !py-2.5">
              <SlidersHorizontal className="h-4 w-4" />
              Filters
            </button>
            <select className="input !w-auto !py-2.5 !text-sm" defaultValue="newest">
              <option value="newest">Newest</option>
              <option value="price_low">Price: Low to High</option>
              <option value="price_high">Price: High to Low</option>
              <option value="name">Name A–Z</option>
            </select>
          </div>
        </div>

        {/* Product grid */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 lg:gap-6">
          {PRODUCTS.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}
