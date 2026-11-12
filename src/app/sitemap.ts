import type { MetadataRoute } from 'next';
export default function sitemap(): MetadataRoute.Sitemap { return ['/', '/solutions/construction-project-management', '/solutions/construction-quotations', '/solutions/construction-invoices'].map(path => ({ url: `https://myla.co.zw${path}` })); }
