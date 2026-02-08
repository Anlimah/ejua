'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ShoppingBag, Zap } from 'lucide-react';
import { formatMoney, calculateInstallment } from '@/lib/currency';
import { useCart } from '@/hooks/use-cart';
import type { Product } from '@/lib/api';

interface ProductCardProps {
  product: Product;
  priority?: boolean;
}

export default function ProductCard({ product, priority = false }: ProductCardProps) {
  const addItem = useCart((s) => s.addItem);
  const effectivePrice = product.sale_price || product.price;
  const installment = calculateInstallment(effectivePrice, product.currency_code);
  const hasDiscount = product.sale_price && product.sale_price < product.price;

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    addItem({
      productId: product.id,
      name: product.name,
      price: effectivePrice,
      imageUrl: product.image_url,
      currencyCode: product.currency_code,
      vendorId: product.vendor_id,
      slug: product.slug,
    });
  };

  return (
    <Link href={`/products/${product.slug}`} className="group block">
      <div className="card !p-0 overflow-hidden">
        {/* Image */}
        <div className="relative aspect-square overflow-hidden bg-gray-50">
          {product.image_url ? (
            <Image
              src={product.image_url}
              alt={product.name}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
              priority={priority}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-gray-300">
              <ShoppingBag className="h-12 w-12" />
            </div>
          )}

          {/* Sale badge */}
          {hasDiscount && (
            <div className="absolute left-3 top-3 rounded-lg bg-ejua-500 px-2.5 py-1 text-xs font-bold text-white shadow-sm">
              SALE
            </div>
          )}

          {/* Quick add button */}
          <button
            onClick={handleAddToCart}
            className="absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full bg-navy-900 text-white opacity-0 shadow-lg transition-all group-hover:opacity-100 hover:bg-ejua-500 active:scale-90"
            aria-label="Add to cart"
          >
            <ShoppingBag className="h-4 w-4" />
          </button>
        </div>

        {/* Info */}
        <div className="p-4">
          <p className="mb-1 text-xs font-medium text-gray-400 uppercase tracking-wide">
            {product.category_id ? 'Category' : 'Ejua'}
          </p>
          <h3 className="text-sm font-semibold text-navy-900 line-clamp-2 leading-snug">
            {product.name}
          </h3>

          {/* Price */}
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-lg font-bold text-navy-900">
              {formatMoney(effectivePrice, product.currency_code)}
            </span>
            {hasDiscount && (
              <span className="text-sm text-gray-400 line-through">
                {formatMoney(product.price, product.currency_code)}
              </span>
            )}
          </div>

          {/* Installment badge */}
          {effectivePrice >= 5000 && (
            <div className="mt-2">
              <span className="installment-badge !text-xs !px-3 !py-1">
                <Zap className="h-3 w-3" />
                From {installment.monthlyFormatted}/mo
              </span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
