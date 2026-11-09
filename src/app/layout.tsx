import type { Metadata } from 'next';
import './globals.css';
import Providers from '@/components/Providers';
import { BRAND } from '@/lib/brand';

export const metadata: Metadata = {
  title: BRAND.title,
  description: BRAND.description,
  applicationName: BRAND.name,
  icons: { icon: '/icon.png', apple: '/icon.png' },
};
export default function RootLayout({children}:{children:React.ReactNode}){
  return <html lang="en" suppressHydrationWarning><body className="bg-slate-50 font-sans text-ink-900 antialiased dark:bg-ink-950 dark:text-slate-100"><Providers>{children}</Providers></body></html>;
}
