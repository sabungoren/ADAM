// ==========================================================================
// SMART ADAM - SITEMAP CONFIGURATION (sitemap.ts)
// Domain: https://smartadam.jinwoostream.lol
// ==========================================================================

export interface SitemapItem {
  url: string;
  lastModified?: string;
  changeFrequency?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number;
}

export const SITE_URL = 'https://smartadam.jinwoostream.lol';

export const sitemapRoutes: SitemapItem[] = [
  {
    url: `${SITE_URL}/`,
    lastModified: new Date().toISOString().split('T')[0],
    changeFrequency: 'daily',
    priority: 1.0,
  },
  {
    url: `${SITE_URL}/dashboard`,
    lastModified: new Date().toISOString().split('T')[0],
    changeFrequency: 'daily',
    priority: 0.9,
  },
  {
    url: `${SITE_URL}/logs`,
    lastModified: new Date().toISOString().split('T')[0],
    changeFrequency: 'weekly',
    priority: 0.7,
  },
  {
    url: `${SITE_URL}/login`,
    lastModified: new Date().toISOString().split('T')[0],
    changeFrequency: 'monthly',
    priority: 0.6,
  },
  {
    url: `${SITE_URL}/register`,
    lastModified: new Date().toISOString().split('T')[0],
    changeFrequency: 'monthly',
    priority: 0.5,
  },
];

/**
 * Generate standard XML sitemap
 */
export function generateSitemapXml(): string {
  const itemsXml = sitemapRoutes
    .map(
      (item) => `  <url>
    <loc>${item.url}</loc>
    ${item.lastModified ? `<lastmod>${item.lastModified}</lastmod>` : ''}
    ${item.changeFrequency ? `<changefreq>${item.changeFrequency}</changefreq>` : ''}
    ${item.priority !== undefined ? `<priority>${item.priority.toFixed(1)}</priority>` : ''}
  </url>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${itemsXml}
</urlset>`;
}

export default sitemapRoutes;
