import type { APIRoute } from 'astro';
import { pageUrl, projectSlugs } from '../lib/content';

// robots.txt belongs at the origin root. A project-path deployment cannot
// control that root, so it only emits a sitemap; the host manages robots.txt.
export function getStaticPaths() {
  if (!import.meta.env.SITE) return [];
  const files = ['sitemap.xml'];
  if (import.meta.env.BASE_URL.replace(/\/$/, '') === '') files.push('robots.txt');
  return files.map(searchFile => ({params: {searchFile}}));
}
const escapeXml = (value: string) => value.replace(/[<>&"']/g, character => ({'<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;', "'":'&apos;'}[character]!));
export const GET: APIRoute = ({params, site}) => {
  if (!site) throw new Error('Search metadata requires SITE_URL');
  const absolute = (path: string, lang: 'zh' | 'en' = 'zh') => escapeXml(new URL(pageUrl(path, lang), site).href);
  if (params.searchFile === 'robots.txt') return new Response(`User-agent: *\nAllow: /\nSitemap: ${absolute('sitemap.xml')}\n`, {headers: {'Content-Type': 'text/plain; charset=utf-8'}});
  const routes = ['', 'about/', 'resume/', ...projectSlugs.map(slug => `work/${slug}/`)];
  const entries = routes.flatMap(path => (['zh', 'en'] as const).map(lang => `<url><loc>${absolute(path, lang)}</loc><xhtml:link rel="alternate" hreflang="zh-CN" href="${absolute(path)}"/><xhtml:link rel="alternate" hreflang="en" href="${absolute(path, 'en')}"/><xhtml:link rel="alternate" hreflang="x-default" href="${absolute(path)}"/></url>`));
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${entries.join('\n')}</urlset>`, {headers: {'Content-Type': 'application/xml; charset=utf-8'}});
};
