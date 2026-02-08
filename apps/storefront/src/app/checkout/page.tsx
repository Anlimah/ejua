'use client';

import { useState } from 'react';
import Link from 'next/link';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { formatMoney, calculateInstallment } from '@/lib/currency';
import { useCart } from '@/hooks/use-cart';
import { CreditCard, Smartphone, Zap, Lock, ArrowRight, ChevronRight } from 'lucide-react';

type PaymentMethod = 'momo' | 'card' | 'bnpl';

export default function CheckoutPage() {
  const { items, getTotal, getCurrency } = useCart();
  const total = getTotal();
  const currency = getCurrency();
  const installment = calculateInstallment(total, currency);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('momo');
  const [loading, setLoading] = useState(false);

  const handleCheckout = async () => {
    setLoading(true);
    // In production:
    // 1. Create order via API
    // 2. Get Paystack authorization_url
    // 3. Redirect to Paystack
    // For now, simulate
    setTimeout(() => {
      setLoading(false);
      alert('In production, you would be redirected to Paystack for payment.');
    }, 1500);
  };

  return (
    <>
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
        {/* Breadcrumb */}
        <nav className="mb-6 flex items-center gap-1 text-sm text-gray-400">
          <Link href="/cart" className="hover:text-navy-900">Cart</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-navy-900">Checkout</span>
        </nav>

        <h1 className="section-heading">Checkout</h1>

        <div className="mt-8 grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-8">
            {/* Shipping */}
            <section className="rounded-2xl border border-gray-100 p-6">
              <h2 className="text-lg font-semibold text-navy-900">Delivery Details</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-gray-700">Full Name</label>
                  <input type="text" className="input mt-1" placeholder="Kwame Asante" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Phone Number</label>
                  <input type="tel" className="input mt-1" placeholder="020 123 4567" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-sm font-medium text-gray-700">Email</label>
                  <input type="email" className="input mt-1" placeholder="kwame@example.com" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-sm font-medium text-gray-700">Delivery Address</label>
                  <input type="text" className="input mt-1" placeholder="Street, Area" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">City</label>
                  <input type="text" className="input mt-1" placeholder="Accra" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Region</label>
                  <select className="input mt-1">
                    <option value="">Select region</option>
                    <option>Greater Accra</option>
                    <option>Ashanti</option>
                    <option>Western</option>
                    <option>Central</option>
                    <option>Eastern</option>
                    <option>Northern</option>
                    <option>Volta</option>
                    <option>Upper East</option>
                    <option>Upper West</option>
                    <option>Bono</option>
                    <option>Bono East</option>
                    <option>Ahafo</option>
                    <option>Savannah</option>
                    <option>North East</option>
                    <option>Oti</option>
                    <option>Western North</option>
                  </select>
                </div>
              </div>
            </section>

            {/* Payment method */}
            <section className="rounded-2xl border border-gray-100 p-6">
              <h2 className="text-lg font-semibold text-navy-900">Payment Method</h2>
              <div className="mt-4 space-y-3">
                {/* MoMo */}
                <label
                  className={`flex cursor-pointer items-center gap-4 rounded-xl border-2 p-4 transition-colors ${
                    paymentMethod === 'momo' ? 'border-ejua-500 bg-ejua-50/50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input type="radio" name="payment" value="momo" checked={paymentMethod === 'momo'} onChange={() => setPaymentMethod('momo')} className="sr-only" />
                  <Smartphone className={`h-5 w-5 ${paymentMethod === 'momo' ? 'text-ejua-500' : 'text-gray-400'}`} />
                  <div className="flex-1">
                    <p className="text-sm font-semibold">Mobile Money</p>
                    <p className="text-xs text-gray-500">MTN MoMo, Vodafone Cash, AirtelTigo Money</p>
                  </div>
                  <div className="flex gap-1">
                    <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-[10px] font-bold text-yellow-700">MTN</span>
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">VOD</span>
                    <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">ATM</span>
                  </div>
                </label>

                {/* Card */}
                <label
                  className={`flex cursor-pointer items-center gap-4 rounded-xl border-2 p-4 transition-colors ${
                    paymentMethod === 'card' ? 'border-ejua-500 bg-ejua-50/50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input type="radio" name="payment" value="card" checked={paymentMethod === 'card'} onChange={() => setPaymentMethod('card')} className="sr-only" />
                  <CreditCard className={`h-5 w-5 ${paymentMethod === 'card' ? 'text-ejua-500' : 'text-gray-400'}`} />
                  <div className="flex-1">
                    <p className="text-sm font-semibold">Credit / Debit Card</p>
                    <p className="text-xs text-gray-500">Visa, Mastercard — powered by Paystack</p>
                  </div>
                </label>

                {/* BNPL */}
                {total >= 5000 && (
                  <label
                    className={`flex cursor-pointer items-center gap-4 rounded-xl border-2 p-4 transition-colors ${
                      paymentMethod === 'bnpl' ? 'border-ejua-500 bg-ejua-50/50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input type="radio" name="payment" value="bnpl" checked={paymentMethod === 'bnpl'} onChange={() => setPaymentMethod('bnpl')} className="sr-only" />
                    <Zap className={`h-5 w-5 ${paymentMethod === 'bnpl' ? 'text-gold-500' : 'text-gray-400'}`} />
                    <div className="flex-1">
                      <p className="text-sm font-semibold">Buy Now, Pay Later</p>
                      <p className="text-xs text-gray-500">
                        Pay {installment.downPaymentFormatted} now, then {installment.monthlyFormatted}/mo × 3
                      </p>
                    </div>
                    <span className="badge-gold">0% interest</span>
                  </label>
                )}
              </div>
            </section>
          </div>

          {/* Summary */}
          <div className="lg:col-span-1">
            <div className="rounded-2xl border border-gray-100 bg-gray-50/50 p-6 sticky top-24">
              <h3 className="text-lg font-semibold text-navy-900">Order Summary</h3>

              {/* Items list */}
              <div className="mt-4 space-y-2">
                {items.map((item) => (
                  <div key={item.productId} className="flex justify-between text-sm">
                    <span className="text-gray-600 truncate mr-2">
                      {item.name} × {item.quantity}
                    </span>
                    <span className="font-medium text-navy-900 whitespace-nowrap">
                      {formatMoney(item.price * item.quantity, item.currencyCode)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-4 space-y-2 border-t border-gray-200 pt-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="font-semibold">{formatMoney(total, currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Delivery</span>
                  <span className="font-medium text-emerald-600">Free</span>
                </div>

                {paymentMethod === 'bnpl' && (
                  <div className="rounded-lg bg-amber-50 p-3 text-xs">
                    <p className="font-semibold text-amber-800">Pay today: {installment.downPaymentFormatted}</p>
                    <p className="text-amber-700">Then {installment.monthlyFormatted}/mo × 3</p>
                  </div>
                )}

                <div className="border-t border-gray-200 pt-2 flex justify-between">
                  <span className="font-semibold">
                    {paymentMethod === 'bnpl' ? 'Due today' : 'Total'}
                  </span>
                  <span className="text-xl font-bold text-navy-900">
                    {paymentMethod === 'bnpl'
                      ? installment.downPaymentFormatted
                      : formatMoney(total, currency)
                    }
                  </span>
                </div>
              </div>

              <button
                onClick={handleCheckout}
                disabled={loading || items.length === 0}
                className="btn-primary mt-6 w-full !py-4 !text-base"
              >
                {loading ? (
                  <span className="animate-pulse-soft">Processing...</span>
                ) : (
                  <>
                    <Lock className="mr-2 h-4 w-4" />
                    {paymentMethod === 'bnpl' ? `Pay ${installment.downPaymentFormatted} Now` : 'Pay Now'}
                  </>
                )}
              </button>

              <p className="mt-3 text-center text-xs text-gray-400 flex items-center justify-center gap-1">
                <Lock className="h-3 w-3" /> Secured by Paystack
              </p>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
