import { headers } from 'next/headers';
import type { MetadataRoute } from 'next';
export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get('host')?.split(':')[0].toLowerCase();
  if (host !== 'myla.co.zw') return { rules: { userAgent: '*', disallow: '/' } };
  return { rules: { userAgent: '*', allow: '/', disallow: ['/api/','/login','/onboarding','/reset-password','/verify-email'] }, sitemap: 'https://myla.co.zw/sitemap.xml' };
}
