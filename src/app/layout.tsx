import type { Metadata } from 'next';
import './globals.css';
import Providers from '@/components/Providers';

export const metadata: Metadata = { title:'BuildOps — Construction & Industrial Management', description:'Full-stack ERP for construction and industrial companies' };
export default function RootLayout({children}:{children:React.ReactNode}){
  return <html lang="en" suppressHydrationWarning><body className="bg-slate-50 text-ink-900 antialiased dark:bg-ink-950 dark:text-slate-100"><Providers>{children}</Providers></body></html>;
}
