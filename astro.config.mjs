import { defineConfig } from 'astro/config';

const site = process.env.SITE_URL || undefined;
if (process.env.REQUIRE_SITE_URL === '1' && !site) {
  throw new Error('Release build requires SITE_URL. Set the public origin and BASE_PATH before publishing.');
}
if (site) {
  const parsed = new URL(site);
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('SITE_URL must be an HTTP(S) origin, such as https://example.com. Use BASE_PATH for a project subdirectory.');
  }
  if (process.env.REQUIRE_SITE_URL === '1' && (parsed.protocol !== 'https:' || ['localhost', '127.0.0.1', '::1', '[::1]'].includes(parsed.hostname))) {
    throw new Error('Release SITE_URL must be a public HTTPS origin.');
  }
} else if (process.argv.includes('build')) {
  console.warn('[portfolio] Local build without SITE_URL: canonical, hreflang, and sitemap are omitted. Use npm run build:release for public deployment.');
}

// Local preview needs neither value. Release builds require the public origin.
export default defineConfig({
  output: 'static',
  site,
  base: process.env.BASE_PATH || '/',
  trailingSlash: 'always',
  build: { format: 'directory' },
});
