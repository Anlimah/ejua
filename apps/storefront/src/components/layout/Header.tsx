'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ShoppingBag, Search, Menu, X, User, ChevronDown } from 'lucide-react';
import { useCart } from '@/hooks/use-cart';

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const itemCount = useCart((s) => s.getItemCount());

  return (
    <header className="sticky top-0 z-50 border-b border-gray-100 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 lg:px-8">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-ejua-500">
            <span className="text-lg font-bold text-white">E</span>
          </div>
          <span className="font-display text-xl font-bold text-navy-900">
            Ejua
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden items-center gap-8 md:flex">
          <Link href="/products" className="text-sm font-medium text-navy-600 transition-colors hover:text-ejua-500">
            Shop All
          </Link>
          <button className="flex items-center gap-1 text-sm font-medium text-navy-600 transition-colors hover:text-ejua-500">
            Categories <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <Link href="/products?featured=true" className="text-sm font-medium text-navy-600 transition-colors hover:text-ejua-500">
            Featured
          </Link>
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-3">
          {/* Search */}
          <button
            onClick={() => setSearchOpen(!searchOpen)}
            className="btn-ghost !p-2"
            aria-label="Search"
          >
            <Search className="h-5 w-5" />
          </button>

          {/* Account */}
          <Link href="/login" className="btn-ghost hidden !p-2 md:flex">
            <User className="h-5 w-5" />
          </Link>

          {/* Cart */}
          <Link href="/cart" className="relative btn-ghost !p-2">
            <ShoppingBag className="h-5 w-5" />
            {itemCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-ejua-500 text-[10px] font-bold text-white">
                {itemCount > 9 ? '9+' : itemCount}
              </span>
            )}
          </Link>

          {/* Mobile menu toggle */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="btn-ghost !p-2 md:hidden"
            aria-label="Menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Search bar (expandable) */}
      {searchOpen && (
        <div className="border-t border-gray-100 bg-white px-4 py-3 animate-fade-in">
          <div className="mx-auto max-w-2xl">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                placeholder="Search products..."
                className="input !pl-11"
                autoFocus
              />
            </div>
          </div>
        </div>
      )}

      {/* Mobile nav */}
      {mobileOpen && (
        <div className="border-t border-gray-100 bg-white px-4 py-4 md:hidden animate-fade-in">
          <nav className="flex flex-col gap-1">
            <Link href="/products" className="rounded-xl px-4 py-3 text-sm font-medium hover:bg-gray-50" onClick={() => setMobileOpen(false)}>
              Shop All
            </Link>
            <Link href="/products?featured=true" className="rounded-xl px-4 py-3 text-sm font-medium hover:bg-gray-50" onClick={() => setMobileOpen(false)}>
              Featured
            </Link>
            <Link href="/login" className="rounded-xl px-4 py-3 text-sm font-medium hover:bg-gray-50" onClick={() => setMobileOpen(false)}>
              Sign In
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
