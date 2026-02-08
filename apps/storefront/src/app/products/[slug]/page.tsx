'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { formatMoney, calculateInstallment } from '@/lib/currency';
import { useCart } from '@/hooks/use-cart';
import { ShoppingBag, Zap, Minus, Plus, ChevronRight, ShieldCheck, Truck, RotateCcw, Check } from 'lucide-react';

// In production: const product = await products.getBySlug(params.slug);
const PRODUCT = {
  id: '1', name: 'Samsung Galaxy A15', slug: 'samsung-galaxy-a15',
  description: 'Experience the Samsung Galaxy A15 with its stunning 6.5-inch Super AMOLED display, powerful MediaTek Helio G99 processor, and versatile triple camera system. With 128GB storage and 4GB RAM, this phone handles everything from gaming to multitasking with ease. The 5000mAh battery keeps you going all day.',
  price: 259900, sale_price: null, currency_code: 'GHS', image_url: null,
  is_active: true, is_featured: true, vendor_id: 'v1', category_id: 'c1', stock_quantity: 50,
  variants: [
    { id: 'v1', name: 'Black', sku: 'SGA15-BLK', price_override: null, stock_quantity: 25, attributes: { color: 'Black' } },
    { id: 'v2', name: 'Blue', sku: 'SGA15-BLU', price_override: null, stock_quantity: 15, attributes: { color: 'Blue' } },
    { id: 'v3', name: 'Light Green', sku: 'SGA15-GRN', price_override: null, stock_quantity: 10, attributes: { color: 'Light Green' } },
  ],
};

export default function ProductDetailPage() {
  const product = PRODUCT;
  const addItem = useCart((s) => s.addItem);
  const [quantity, setQuantity] = useState(1);
  const [selectedVariant, setSelectedVariant] = useState(product.variants?.[0]?.id);
  const [showInstallment, setShowInstallment] = useState(false);
  const [added, setAdded] = useState(false);

  const effectivePrice = product.sale_price || product.price;
  const installment = calculateInstallment(effectivePrice, product.currency_code);

  const handleAddToCart = () => {
    addItem({
      productId: product.id,
      variantId: selectedVariant,
      name: product.name,
      price: effectivePrice,
      imageUrl: product.image_url,
      currencyCode: product.currency_code,
      vendorId: product.vendor_id,
      slug: product.slug,
    }, quantity);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  return (
    <>
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
        {/* Breadcrumb */}
        <nav className="mb-6 flex items-center gap-1 text-sm text-gray-400">
          <Link href="/" className="hover:text-navy-900">Home</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <Link href="/products" className="hover:text-navy-900">Products</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-navy-900">{product.name}</span>
        </nav>

        <div className="grid gap-10 lg:grid-cols-2">
          {/* Image */}
          <div className="relative aspect-square overflow-hidden rounded-3xl bg-gray-50">
            {product.image_url ? (
              <Image src={product.image_url} alt={product.name} fill className="object-cover" priority />
            ) : (
              <div className="flex h-full items-center justify-center text-gray-300">
                <ShoppingBag className="h-24 w-24" />
              </div>
            )}
          </div>

          {/* Details */}
          <div className="flex flex-col">
            <p className="text-sm font-medium text-ejua-500 uppercase tracking-wider">In Stock</p>
            <h1 className="mt-2 font-display text-3xl font-bold text-navy-900 md:text-4xl">
              {product.name}
            </h1>

            {/* Price */}
            <div className="mt-4 flex items-baseline gap-3">
              <span className="text-3xl font-bold text-navy-900">
                {formatMoney(effectivePrice, product.currency_code)}
              </span>
              {product.sale_price && (
                <span className="text-lg text-gray-400 line-through">
                  {formatMoney(product.price, product.currency_code)}
                </span>
              )}
            </div>

            {/* Installment toggle */}
            <div className="mt-4">
              <button
                onClick={() => setShowInstallment(!showInstallment)}
                className="installment-badge cursor-pointer transition-transform hover:scale-105 active:scale-95"
              >
                <Zap className="h-4 w-4" />
                Or from {installment.monthlyFormatted}/mo
              </button>

              {showInstallment && (
                <div className="mt-3 rounded-xl border border-ejua-100 bg-ejua-50/50 p-4 animate-slide-up">
                  <h4 className="text-sm font-semibold text-navy-900">Installment Plan</h4>
                  <div className="mt-2 space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Down payment (40%)</span>
                      <span className="font-semibold">{installment.downPaymentFormatted}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">3 monthly payments</span>
                      <span className="font-semibold">{installment.monthlyFormatted}</span>
                    </div>
                    <div className="border-t border-ejua-200 pt-1.5 flex justify-between">
                      <span className="text-gray-500">Total cost</span>
                      <span className="font-bold text-navy-900">{installment.totalCostFormatted}</span>
                    </div>
                    <p className="text-xs text-ejua-600 font-medium mt-1">0% interest — Pay with Mobile Money</p>
                  </div>
                </div>
              )}
            </div>

            {/* Description */}
            <p className="mt-6 text-sm leading-relaxed text-gray-600">
              {product.description}
            </p>

            {/* Variants */}
            {product.variants && product.variants.length > 0 && (
              <div className="mt-6">
                <label className="text-sm font-semibold text-navy-900">Color</label>
                <div className="mt-2 flex gap-2">
                  {product.variants.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setSelectedVariant(v.id)}
                      className={`rounded-xl border-2 px-4 py-2 text-sm font-medium transition-colors ${
                        selectedVariant === v.id
                          ? 'border-ejua-500 bg-ejua-50 text-ejua-700'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {v.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quantity + Add to Cart */}
            <div className="mt-8 flex items-center gap-4">
              <div className="flex items-center rounded-xl border border-gray-200">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="p-3 text-gray-500 hover:text-navy-900"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-10 text-center text-sm font-semibold">{quantity}</span>
                <button
                  onClick={() => setQuantity(Math.min(10, quantity + 1))}
                  className="p-3 text-gray-500 hover:text-navy-900"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              <button
                onClick={handleAddToCart}
                className={`btn-primary flex-1 !py-4 !text-base ${added ? '!bg-emerald-500' : ''}`}
              >
                {added ? (
                  <><Check className="mr-2 h-5 w-5" /> Added!</>
                ) : (
                  <><ShoppingBag className="mr-2 h-5 w-5" /> Add to Cart</>
                )}
              </button>
            </div>

            {/* Trust signals */}
            <div className="mt-8 grid grid-cols-3 gap-4 rounded-2xl border border-gray-100 p-4">
              <div className="text-center">
                <ShieldCheck className="mx-auto h-5 w-5 text-emerald-500" />
                <p className="mt-1 text-xs text-gray-500">Buyer Protection</p>
              </div>
              <div className="text-center">
                <Truck className="mx-auto h-5 w-5 text-blue-500" />
                <p className="mt-1 text-xs text-gray-500">Fast Delivery</p>
              </div>
              <div className="text-center">
                <RotateCcw className="mx-auto h-5 w-5 text-amber-500" />
                <p className="mt-1 text-xs text-gray-500">14-Day Returns</p>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
