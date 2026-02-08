import Link from 'next/link';
import { ArrowRight, Zap, ShieldCheck, Truck, CreditCard } from 'lucide-react';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import ProductCard from '@/components/product/ProductCard';

// In production, this would call: products.featured()
// For now, we use placeholder data that matches the API shape
const FEATURED_PRODUCTS = [
  {
    id: '1', name: 'Samsung Galaxy A15', slug: 'samsung-galaxy-a15',
    description: '6.5" Display, 128GB, 4GB RAM', price: 259900, sale_price: null,
    currency_code: 'GHS', image_url: null, is_active: true, is_featured: true,
    vendor_id: 'v1', category_id: 'c1', stock_quantity: 50,
  },
  {
    id: '2', name: 'Kente Print Dress', slug: 'kente-print-dress',
    description: 'Authentic Ghanaian Kente fabric, handcrafted', price: 45000, sale_price: 38000,
    currency_code: 'GHS', image_url: null, is_active: true, is_featured: true,
    vendor_id: 'v2', category_id: 'c2', stock_quantity: 20,
  },
  {
    id: '3', name: 'Nescafé Gold Jar 200g', slug: 'nescafe-gold-200g',
    description: 'Premium instant coffee', price: 8500, sale_price: null,
    currency_code: 'GHS', image_url: null, is_active: true, is_featured: true,
    vendor_id: 'v3', category_id: 'c3', stock_quantity: 100,
  },
  {
    id: '4', name: 'JBL Tune 520BT Headphones', slug: 'jbl-tune-520bt',
    description: 'Wireless Bluetooth, 57h battery', price: 52000, sale_price: 45000,
    currency_code: 'GHS', image_url: null, is_active: true, is_featured: true,
    vendor_id: 'v1', category_id: 'c1', stock_quantity: 35,
  },
];

export default function HomePage() {
  return (
    <>
      <Header />

      <main>
        {/* ─── HERO ──────────────────────────── */}
        <section className="relative overflow-hidden bg-navy-900 text-white">
          {/* Gradient accent */}
          <div className="absolute -right-40 -top-40 h-[500px] w-[500px] rounded-full bg-ejua-500/20 blur-3xl" />
          <div className="absolute -bottom-20 -left-20 h-[300px] w-[300px] rounded-full bg-ejua-500/10 blur-3xl" />

          <div className="relative mx-auto max-w-7xl px-4 py-20 lg:px-8 lg:py-28">
            <div className="max-w-2xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium backdrop-blur-sm">
                <Zap className="h-4 w-4 text-gold-400" />
                Pay in installments with Mobile Money
              </div>

              <h1 className="font-display text-4xl font-bold leading-tight tracking-tight md:text-6xl">
                Shop Smart,<br />
                <span className="text-ejua-400">Pay Easy</span>
              </h1>

              <p className="mt-5 max-w-lg text-lg text-gray-300">
                Ghana&apos;s marketplace where you can buy what you need today and spread the cost.
                Pay with MTN MoMo, Vodafone Cash, or card.
              </p>

              <div className="mt-8 flex flex-wrap gap-4">
                <Link href="/products" className="btn-primary !bg-ejua-500 !px-8 !py-4 !text-base hover:!bg-ejua-400">
                  Start Shopping <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
                <Link href="/products?featured=true" className="btn-secondary !border-white/30 !text-white hover:!bg-white/10 hover:!text-white !px-8 !py-4 !text-base">
                  View Featured
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ─── TRUST BAR ─────────────────────── */}
        <section className="border-b border-gray-100 bg-gray-50/50">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-8 px-4 py-5 text-sm text-navy-700 lg:gap-16 lg:px-8">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-500" />
              <span className="font-medium">Buyer Protection</span>
            </div>
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-ejua-500" />
              <span className="font-medium">MoMo & Card Payments</span>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-gold-500" />
              <span className="font-medium">Buy Now, Pay Later</span>
            </div>
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-blue-500" />
              <span className="font-medium">Nationwide Delivery</span>
            </div>
          </div>
        </section>

        {/* ─── FEATURED PRODUCTS ─────────────── */}
        <section className="mx-auto max-w-7xl px-4 py-16 lg:px-8">
          <div className="mb-8 flex items-end justify-between">
            <div>
              <p className="text-sm font-semibold text-ejua-500 uppercase tracking-wider">Handpicked</p>
              <h2 className="section-heading mt-1">Featured Products</h2>
            </div>
            <Link href="/products?featured=true" className="btn-ghost text-ejua-600 hover:!text-ejua-700">
              View all <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 lg:gap-6">
            {FEATURED_PRODUCTS.map((product, i) => (
              <ProductCard key={product.id} product={product} priority={i < 2} />
            ))}
          </div>
        </section>

        {/* ─── HOW INSTALLMENTS WORK ─────────── */}
        <section className="bg-gradient-to-br from-navy-900 via-navy-900 to-ejua-950 text-white">
          <div className="mx-auto max-w-7xl px-4 py-20 lg:px-8">
            <div className="text-center">
              <span className="installment-badge mb-4 !bg-white/10 !text-white">
                <Zap className="h-4 w-4 text-gold-400" /> Powered by Motito
              </span>
              <h2 className="font-display text-3xl font-bold md:text-4xl">
                Buy Now, Pay Later
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-gray-400">
                Split any purchase over 3 months with 0% interest. Pay your down payment with Mobile Money and the rest in monthly installments.
              </p>
            </div>

            <div className="mt-14 grid gap-8 md:grid-cols-3">
              {[
                {
                  step: '01',
                  title: 'Choose Your Item',
                  desc: 'Browse products and see the monthly installment price on every item.',
                },
                {
                  step: '02',
                  title: 'Pay 40% Down',
                  desc: 'Pay your down payment instantly with MTN MoMo, Vodafone Cash, or card.',
                },
                {
                  step: '03',
                  title: 'Pay Monthly',
                  desc: 'Spread the rest over 3 equal monthly payments. No hidden fees.',
                },
              ].map((item) => (
                <div key={item.step} className="rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-sm">
                  <span className="font-display text-4xl font-bold text-ejua-400">{item.step}</span>
                  <h3 className="mt-4 text-lg font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm text-gray-400">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── CTA ───────────────────────────── */}
        <section className="mx-auto max-w-7xl px-4 py-20 text-center lg:px-8">
          <h2 className="font-display text-3xl font-bold text-navy-900 md:text-4xl">
            Ready to Start Selling?
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-gray-500">
            Join hundreds of Ghanaian vendors on Ejua. Get your own storefront, auto-generated marketing flyers, and reach thousands of buyers.
          </p>
          <div className="mt-8 flex justify-center gap-4">
            <Link href="/products" className="btn-primary !px-8 !py-4 !text-base">
              Shop Now
            </Link>
            <Link href="#" className="btn-secondary !px-8 !py-4 !text-base">
              Become a Vendor
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
