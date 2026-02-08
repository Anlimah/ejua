'use client';

import Link from 'next/link';
import Image from 'next/image';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { formatMoney, calculateInstallment } from '@/lib/currency';
import { useCart } from '@/hooks/use-cart';
import { Minus, Plus, Trash2, ShoppingBag, ArrowRight, Zap } from 'lucide-react';

export default function CartPage() {
  const { items, updateQuantity, removeItem, getTotal, clearCart, getCurrency } = useCart();
  const total = getTotal();
  const currency = getCurrency();
  const installment = total > 0 ? calculateInstallment(total, currency) : null;

  if (items.length === 0) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-7xl px-4 py-20 text-center lg:px-8">
          <ShoppingBag className="mx-auto h-16 w-16 text-gray-300" />
          <h1 className="mt-4 font-display text-2xl font-bold text-navy-900">Your cart is empty</h1>
          <p className="mt-2 text-gray-500">Discover amazing products from Ghanaian vendors.</p>
          <Link href="/products" className="btn-primary mt-6 inline-flex">
            Start Shopping <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
        <h1 className="section-heading">Shopping Cart</h1>
        <p className="mt-1 text-sm text-gray-500">{items.length} item{items.length !== 1 ? 's' : ''}</p>

        <div className="mt-8 grid gap-8 lg:grid-cols-3">
          {/* Cart items */}
          <div className="lg:col-span-2 space-y-4">
            {items.map((item) => (
              <div key={`${item.productId}-${item.variantId}`} className="card flex gap-4 !p-4">
                {/* Image */}
                <Link href={`/products/${item.slug}`} className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-xl bg-gray-50">
                  {item.imageUrl ? (
                    <Image src={item.imageUrl} alt={item.name} fill className="object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-gray-300">
                      <ShoppingBag className="h-8 w-8" />
                    </div>
                  )}
                </Link>

                {/* Details */}
                <div className="flex flex-1 flex-col justify-between">
                  <div>
                    <Link href={`/products/${item.slug}`} className="text-sm font-semibold text-navy-900 hover:text-ejua-500">
                      {item.name}
                    </Link>
                    <p className="mt-0.5 text-sm font-bold text-navy-900">
                      {formatMoney(item.price * item.quantity, item.currencyCode)}
                    </p>
                  </div>

                  <div className="flex items-center justify-between">
                    {/* Quantity */}
                    <div className="flex items-center rounded-lg border border-gray-200">
                      <button
                        onClick={() => updateQuantity(item.productId, item.variantId, item.quantity - 1)}
                        className="p-2 text-gray-400 hover:text-navy-900"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-8 text-center text-xs font-semibold">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.productId, item.variantId, item.quantity + 1)}
                        className="p-2 text-gray-400 hover:text-navy-900"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Remove */}
                    <button
                      onClick={() => removeItem(item.productId, item.variantId)}
                      className="p-2 text-gray-400 hover:text-ejua-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            <button onClick={clearCart} className="btn-ghost text-sm text-gray-400 hover:!text-ejua-500">
              Clear cart
            </button>
          </div>

          {/* Order summary */}
          <div className="lg:col-span-1">
            <div className="rounded-2xl border border-gray-100 bg-gray-50/50 p-6 sticky top-24">
              <h3 className="text-lg font-semibold text-navy-900">Order Summary</h3>

              <div className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="font-semibold">{formatMoney(total, currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Delivery</span>
                  <span className="font-medium text-emerald-600">Free</span>
                </div>
                <div className="border-t border-gray-200 pt-2 flex justify-between">
                  <span className="font-semibold text-navy-900">Total</span>
                  <span className="text-lg font-bold text-navy-900">{formatMoney(total, currency)}</span>
                </div>
              </div>

              {/* Installment option */}
              {installment && total >= 5000 && (
                <div className="mt-4 rounded-xl border border-ejua-200 bg-ejua-50/50 p-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-ejua-700">
                    <Zap className="h-4 w-4" />
                    Pay in installments
                  </div>
                  <p className="mt-1 text-xs text-ejua-600">
                    {installment.downPaymentFormatted} now, then {installment.monthlyFormatted}/mo × 3
                  </p>
                </div>
              )}

              <Link href="/checkout" className="btn-primary mt-6 w-full !py-4 !text-base">
                Proceed to Checkout <ArrowRight className="ml-2 h-4 w-4" />
              </Link>

              <Link href="/products" className="btn-ghost mt-2 w-full text-center text-sm">
                Continue Shopping
              </Link>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
