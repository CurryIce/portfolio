import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, relative, dirname, join } from 'node:path';
import { checkSourceContent } from './check-content.mjs';
import sharp from 'sharp';

const root = resolve('dist');
const base = (process.env.BASE_PATH || '/').replace(/\/$/, '');
async function walk(dir) {
  const found = [];
  for (const entry of await readdir(dir, {withFileTypes: true})) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await walk(path));
    else found.push(path);
  }
  return found;
}
const files = await walk(root);
const htmlFiles = files.filter(file => file.endsWith('.html'));
const failures = [];
await checkSourceContent();
// Optional local rules supplement the generic checks without publishing private identifiers.
let localDisclosurePatterns = [];
try {
  const patterns = JSON.parse(await readFile('source-assets/maintenance/private-disclosure-patterns.json', 'utf8'));
  localDisclosurePatterns = patterns.map(pattern => new RegExp(pattern));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const css = await readFile('src/styles/global.css', 'utf8');
const themes = [...css.matchAll(/--bg:\s*(#[\da-f]+);[^}]+/g)].slice(0, 2).map(match => {
  return Object.fromEntries([...match[0].matchAll(/--([\w-]+):\s*(#[\da-f]+|#fff);/g)].map(token => [token[1], token[2]]));
});
function luminance(hex) {
  const expanded = hex.length === 4 ? '#' + [...hex.slice(1)].map(character => character + character).join('') : hex;
  const linear = [1, 3, 5].map(offset => parseInt(expanded.slice(offset, offset + 2), 16) / 255).map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
  return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
}
let contrastPairs = 0;
for (const [index, theme] of themes.entries()) {
  for (const [fg, bg] of [['text', 'bg'], ['muted', 'bg'], ['muted', 'surface'], ['accent', 'bg'], ['button-text', 'accent']]) {
    const values = [luminance(theme[fg]), luminance(theme[bg])].sort((a, b) => b - a);
    const ratio = (values[0] + .05) / (values[1] + .05);
    if (ratio < 4.5) failures.push(`Theme ${index}: ${fg}/${bg} contrast ${ratio.toFixed(2)} is below AA`);
    contrastPairs++;
  }
}
let linksChecked = 0;
for (const file of htmlFiles) {
  const html = await readFile(file, 'utf8');
  const name = relative(root, file);
  const language = name.replaceAll('\\', '/').startsWith('en/') ? 'en' : 'zh-CN';
  if (!html.includes(`<html lang="${language}"`)) failures.push(`${name}: wrong page language`);
  if (!/data-language-switch/.test(html)) failures.push(`${name}: missing language switch`);
  const normalizedName = name.replaceAll('\\', '/');
  let counterpart = language === 'en' ? normalizedName.slice(3) : `en/${normalizedName}`;
  if (normalizedName === '404.html') counterpart = 'en/404/index.html';
  if (normalizedName === 'en/404/index.html') counterpart = '404.html';
  const expectedSwitch = `${base}/${counterpart.replace(/index\.html$/, '')}`;
  const languageTag = html.match(/<a\b[^>]*data-language-switch[^>]*>/)?.[0];
  const languageHref = languageTag?.match(/href="([^"]+)"/)?.[1];
  if (languageHref !== expectedSwitch) failures.push(`${name}: language switch must target corresponding page ${expectedSwitch}`);
  if ((html.match(/<h1(?:\s|>)/g) || []).length !== 1) failures.push(`${name}: expected one H1`);
  if (!/<title>[^<]+<\/title>/.test(html)) failures.push(`${name}: missing title`);
  if (/CASE-\d{3}|\bUE[1-4]\b/.test(html) || localDisclosurePatterns.some(pattern => pattern.test(html))) failures.push(`${name}: internal identifiers exposed`);
  const meta = key => html.match(new RegExp(`<meta\\b[^>]*(?:property|name)="${key}"[^>]*content="([^"]+)"`))?.[1];
  if (!/<link\b[^>]*rel="icon"/.test(html)) failures.push(`${name}: favicon is missing`);
  if (meta('twitter:card') !== 'summary_large_image') failures.push(`${name}: missing large-image share card`);
  const sharePath = `${base}/social/portfolio-${language === 'en' ? 'en' : 'zh'}.png`;
  try {
    if (new URL(meta('og:image')).pathname !== sharePath || meta('twitter:image') !== meta('og:image')) failures.push(`${name}: wrong language share image`);
    const image = await sharp(resolve(root, sharePath.slice(base.length).replace(/^\//, ''))).metadata();
    if (image.width !== 1200 || image.height !== 630 || !meta('og:image:alt')) failures.push(`${name}: invalid share image metadata`);
  } catch { failures.push(`${name}: invalid or missing share image`); }
  if (process.env.SITE_URL) {
    const expectedUrl = new URL(`${base}/${normalizedName.replace(/index\.html$/, '')}`, process.env.SITE_URL).href;
    if (!/404(?:\.html|\/index\.html)$/.test(normalizedName) && (!html.includes(`rel="canonical" href="${expectedUrl}"`) || meta('og:url') !== expectedUrl)) failures.push(`${name}: canonical/share URL does not match public deployment`);
    const zhName = language === 'en' ? counterpart : normalizedName;
    const enName = language === 'en' ? normalizedName : counterpart;
    for (const [lang, fileName] of [['zh-CN', zhName], ['en', enName], ['x-default', zhName]]) {
      const alternate = new URL(`${base}/${fileName.replace(/index\.html$/, '')}`, process.env.SITE_URL).href;
      if (!html.includes(`rel="alternate" hreflang="${lang}" href="${alternate}"`)) failures.push(`${name}: alternate ${lang} has the wrong public URL`);
    }
  }
  if (/404(?:\.html|\/index\.html)$/.test(normalizedName) && meta('robots') !== 'noindex') failures.push(`${name}: 404 page must not be indexed`);
  const references = [...html.matchAll(/\b(?:href|src)="([^"]+)"/g)].map(match => match[1]);
  for (const match of html.matchAll(/\bsrcset="([^"]+)"/g)) {
    references.push(...match[1].split(',').map(source => source.trim().split(/\s+/)[0]));
  }
  for (const value of references) {
    if (/^(https?:|mailto:|tel:|data:)/.test(value) || !value) continue;
    const [pathPart, anchor] = value.split('#');
    let target;
    if (!pathPart) target = file;
    else if (pathPart.startsWith('/')) {
      if (base && !pathPart.startsWith(base + '/')) { failures.push(`${name}: link outside base ${value}`); continue; }
      target = resolve(root, decodeURIComponent(pathPart.slice(base.length)).replace(/^\//, ''));
    } else target = resolve(dirname(file), decodeURIComponent(pathPart));
    if (!target.startsWith(root)) { failures.push(`${name}: link leaves output ${value}`); continue; }
    try {
      if ((await stat(target)).isDirectory()) target = join(target, 'index.html');
      await stat(target);
      if (anchor && target.endsWith('.html')) {
        const linkedHtml = await readFile(target, 'utf8');
        if (!linkedHtml.includes(`id="${anchor}"`)) failures.push(`${name}: missing anchor ${value}`);
      }
      linksChecked++;
    } catch { failures.push(`${name}: missing resource ${value}`); }
  }
  for (const image of html.matchAll(/<img\b([^>]+)>/g)) {
    if (!/\balt="[^"]*"/.test(image[1])) failures.push(`${name}: image missing alt text`);
    if (!/id="viewer-image"/.test(image[1]) && (!/\bwidth="\d+"/.test(image[1]) || !/\bheight="\d+"/.test(image[1]))) failures.push(`${name}: image missing size`);
  }
}
if (process.env.SITE_URL) {
  try {
    const sitemap = await readFile(join(root, 'sitemap.xml'), 'utf8');
    const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
    const expected = htmlFiles.map(file => relative(root, file).replaceAll('\\', '/')).filter(name => !/404(?:\.html|\/index\.html)$/.test(name)).map(name => new URL(`${base}/${name.replace(/index\.html$/, '')}`, process.env.SITE_URL).href);
    if (locations.length !== expected.length || expected.some(url => !locations.includes(url))) failures.push('Sitemap must contain every public page exactly once, excluding 404');
    if (!base) {
      const robots = await readFile(join(root, 'robots.txt'), 'utf8');
      if (!robots.includes(`Sitemap: ${new URL('/sitemap.xml', process.env.SITE_URL).href}`)) failures.push('robots.txt has the wrong sitemap URL');
    }
  } catch { failures.push('Missing generated search metadata'); }
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else console.log(`Verified ${htmlFiles.length} bilingual static pages, ${linksChecked} local links/assets, and ${contrastPairs} theme contrast pairs. Titles, image alternatives, Chinese/English languages, anchors, and anonymized content passed.`);
