import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="border-t border-gray-100 bg-navy-900 text-white">
      <div className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
        <div className="grid gap-8 md:grid-cols-4">
          {/* Brand */}
          <div className="md:col-span-1">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ejua-500">
                <span className="text-sm font-bold">E</span>
              </div>
              <span className="font-display text-lg font-bold">Ejua</span>
            </div>
            <p className="mt-3 text-sm text-gray-400">
              Shop smart, pay easy. Ghana&apos;s marketplace with flexible installment payments.
            </p>
          </div>

          {/* Shop */}
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Shop</h4>
            <ul className="mt-4 space-y-2">
              <li><Link href="/products" className="text-sm text-gray-300 hover:text-white">All Products</Link></li>
              <li><Link href="/products?featured=true" className="text-sm text-gray-300 hover:text-white">Featured</Link></li>
              <li><Link href="/products?sort=newest" className="text-sm text-gray-300 hover:text-white">New Arrivals</Link></li>
            </ul>
          </div>

          {/* Help */}
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Help</h4>
            <ul className="mt-4 space-y-2">
              <li><span className="text-sm text-gray-300">How Installments Work</span></li>
              <li><span className="text-sm text-gray-300">Shipping & Delivery</span></li>
              <li><span className="text-sm text-gray-300">Returns & Refunds</span></li>
            </ul>
          </div>

          {/* Sell */}
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Sell on Ejua</h4>
            <ul className="mt-4 space-y-2">
              <li><span className="text-sm text-gray-300">Become a Vendor</span></li>
              <li><span className="text-sm text-gray-300">Vendor Dashboard</span></li>
              <li><span className="text-sm text-gray-300">Marketing Tools</span></li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-gray-800 pt-8 md:flex-row">
          <p className="text-xs text-gray-500">
            &copy; {new Date().getFullYear()} Ejua. All rights reserved.
          </p>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-gray-800 px-2 py-1 text-xs text-gray-400">MTN MoMo</span>
            <span className="rounded-md bg-gray-800 px-2 py-1 text-xs text-gray-400">Vodafone Cash</span>
            <span className="rounded-md bg-gray-800 px-2 py-1 text-xs text-gray-400">AirtelTigo</span>
            <span className="rounded-md bg-gray-800 px-2 py-1 text-xs text-gray-400">Visa / MC</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
