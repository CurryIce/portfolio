import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { build } from 'esbuild';

// Run the complete page script, including initialization, rather than extracting
// individual handlers. This catches errors that prevent any handler being bound.
const bundle = await build({ entryPoints: ['src/scripts/interactions.ts'], bundle: true, write: false, format: 'iife', platform: 'browser' });
const layout = await readFile('src/layouts/Base.astro', 'utf8');
const bootstrap = layout.match(/<script is:inline>([\s\S]*?)<\/script>/)[1];
function element(extra = {}) {
  const attributes = new Map();
  const listeners = {};
  const classes = new Set();
  return {
    attributes, listeners, dataset: {}, textContent: '', focused: false,
    setAttribute: (key, value) => attributes.set(key, value),
    getAttribute: key => attributes.get(key) ?? null,
    removeAttribute: key => attributes.delete(key),
    addEventListener: (type, handler) => { (listeners[type] ||= []).push(handler); },
    fire(type, event = {}) { for (const handler of listeners[type] || []) handler(event); },
    classList: { add: key => classes.add(key), remove: key => classes.delete(key), toggle: (key, active) => active ? classes.add(key) : classes.delete(key), contains: key => classes.has(key) },
    focus() { this.focused = true; },
    ...extra,
  };
}
function page({ lang = 'zh-CN', reduce = false, storedTheme, storageBlocked = false } = {}) {
  const html = element({ lang });
  const theme = element();
  const menu = element();
  menu.setAttribute('aria-expanded', 'false');
  const navLink = element();
  const nav = element({ querySelectorAll: () => [navLink] });
  const image = element({ src: '/poster.webp', alt: 'Ability demo' });
  image.setAttribute('srcset', '/poster-small.webp 840w, /poster.webp 1800w');
  const mediaLink = element({ href: '/poster.webp', dataset: { caption: 'Gameplay' }, querySelector: () => image });
  const status = element();
  const figure = { querySelector: selector => selector === 'img' ? image : mediaLink };
  const clipButton = element({ dataset: { poster: '/poster.webp', animation: '/clip.gif', autoplay: 'true' }, disabled: false, closest: () => figure, parentElement: { querySelector: () => status } });
  clipButton.setAttribute('aria-pressed', 'false');
  const viewerImage = element();
  const viewerCaption = element();
  const viewer = element({ showModal() { this.open = true; }, close() { this.open = false; } });
  const close = element();
  const language = element({ href: `https://portfolio.example/${lang === 'en' ? '' : 'en/'}#old` });
  const document = element({
    documentElement: html,
    querySelector: selector => ({ '[data-theme-toggle]': theme, '[data-menu-toggle]': menu, '#image-viewer': viewer, '#viewer-image': viewerImage, '[data-viewer-close]': close, '[data-language-switch]': language })[selector] ?? null,
    getElementById: id => ({ 'site-nav': nav, 'viewer-caption': viewerCaption })[id] ?? null,
    querySelectorAll: selector => selector === '[data-animation]' ? [clipButton] : selector === '[data-lightbox]' ? [mediaLink] : [],
  });
  const motion = element({ matches: reduce });
  const clips = [];
  let observer;
  class IntersectionObserver {
    constructor(callback) { this.callback = callback; observer = this; }
    observe() {}
    disconnect() { this.disconnected = true; }
  }
  class Image { constructor() { clips.push(this); } }
  const window = element({ location: { hash: '#contact' }, matchMedia: () => motion, IntersectionObserver });
  const storage = new Map(storedTheme ? [['portfolio-theme', storedTheme]] : []);
  const localStorage = {
    getItem(key) { if (storageBlocked) throw new Error('Storage blocked'); return storage.get(key); },
    setItem(key, value) { if (storageBlocked) throw new Error('Storage blocked'); storage.set(key, value); },
  };
  const context = vm.createContext({ document, window, localStorage, IntersectionObserver, Image });
  vm.runInContext(bootstrap, context);
  vm.runInContext(bundle.outputFiles[0].text, context);
  return { html, theme, menu, nav, navLink, image, mediaLink, status, clipButton, viewer, viewerImage, close, language, document, window, motion, clips, observer, storage };
}

for (const [lang, labels] of [['zh-CN', ['跟随系统', '浅色', '深色']], ['en', ['System', 'Light', 'Dark']]]) {
  const p = page({ lang });
  assert.equal(p.theme.textContent, labels[0]);
  for (const value of ['light', 'dark', 'system']) {
    p.theme.fire('click');
    assert.equal(p.html.dataset.theme, value === 'system' ? undefined : value);
    assert.equal(p.storage.get('portfolio-theme'), value);
  }
  assert.equal(p.theme.textContent, labels[0]);
  p.menu.fire('click');
  assert.equal(p.menu.getAttribute('aria-expanded'), 'true');
  assert.equal(p.nav.classList.contains('is-open'), true);
  p.document.fire('keydown', { key: 'Escape' });
  assert.equal(p.menu.getAttribute('aria-expanded'), 'false');
  assert.equal(p.menu.focused, true);
  p.menu.fire('click');
  p.navLink.fire('click');
  assert.equal(p.nav.classList.contains('is-open'), false);
  assert.equal(p.language.href.endsWith('#contact'), true);
  p.window.location.hash = '#work';
  p.window.fire('hashchange');
  assert.equal(p.language.href.endsWith('#work'), true);
  assert.equal(p.clips.length, 0);
  p.observer.callback([{ isIntersecting: true }]);
  p.clips[0].onload();
  assert.equal(p.image.src, '/clip.gif');
  assert.equal(p.image.getAttribute('srcset'), null);
  assert.equal(p.clipButton.getAttribute('aria-pressed'), 'true');
  let prevented = false;
  p.mediaLink.fire('click', { preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(p.viewer.open, true);
  assert.equal(p.viewerImage.src, '/clip.gif');
  p.close.fire('click');
  assert.equal(p.viewer.open, false);
  p.clipButton.fire('click');
  assert.equal(p.image.src, '/poster.webp');
  assert.notEqual(p.image.getAttribute('srcset'), null);
  p.clipButton.fire('click');
  p.clips[1].onerror();
  assert.equal(p.clipButton.disabled, false);
  assert.notEqual(p.status.textContent, '');
}
const saved = page({ storedTheme: 'dark' });
assert.equal(saved.html.dataset.theme, 'dark');
assert.equal(saved.theme.textContent, '深色');
saved.theme.fire('click');
assert.equal(saved.html.dataset.theme, undefined);
const blocked = page({ storageBlocked: true });
blocked.theme.fire('click');
assert.equal(blocked.html.dataset.theme, 'light');
const reduced = page({ reduce: true });
assert.equal(reduced.clips.length, 0);
assert.equal(reduced.observer, undefined);
reduced.clipButton.fire('click');
reduced.clips[0].onload();
assert.equal(reduced.image.src, '/clip.gif');
reduced.motion.fire('change', { matches: true });
assert.equal(reduced.image.src, '/poster.webp');
const pending = page();
pending.observer.callback([{ isIntersecting: true }]);
pending.motion.fire('change', { matches: true });
pending.clips[0].onload();
assert.equal(pending.image.src, '/poster.webp');
console.log('Complete bilingual page script passed: initialization, theme cycle and persistence, blocked storage, mobile menu, language anchors, lightbox, GIF playback, and reduced motion.');
