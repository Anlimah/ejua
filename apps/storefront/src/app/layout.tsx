import type { Metadata, Viewport } from 'next';
import { DM_Sans, Playfair_Display } from 'next/font/google';
import '@/styles/globals.css';

const fontBody = DM_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

const fontDisplay = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Ejua — Shop Smart, Pay Easy',
    template: '%s | Ejua',
  },
  description: 'Ghana\'s marketplace for buying and selling with flexible installment payments. Shop from trusted vendors, pay with Mobile Money, and spread costs over time.',
  keywords: ['marketplace', 'Ghana', 'mobile money', 'installments', 'BNPL', 'buy now pay later', 'online shopping', 'ejua'],
  openGraph: {
    title: 'Ejua — Shop Smart, Pay Easy',
    description: 'Ghana\'s marketplace with flexible installment payments.',
    type: 'website',
    locale: 'en_GH',
    siteName: 'Ejua',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#E94560',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fontBody.variable} ${fontDisplay.variable}`}>
      <body className="min-h-screen bg-white font-body text-navy-900 antialiased">
        {children}
      </body>
    </html>
  );
}
