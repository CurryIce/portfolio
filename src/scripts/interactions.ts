import { getUI } from '../lib/i18n';
const ui = getUI(document.documentElement.lang === 'en' ? 'en' : 'zh');

const themeButton = document.querySelector<HTMLButtonElement>('[data-theme-toggle]');
const setTheme = (value: string) => {
  if (value === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = value;
  if (themeButton) {
    const label = value === 'light' ? ui.light : value === 'dark' ? ui.dark : ui.system;
    themeButton.textContent = label;
    themeButton.setAttribute('aria-label', `${ui.themeChange}. ${ui.themeCurrent}: ${label}`);
  }
};
setTheme(document.documentElement.dataset.theme || 'system');
themeButton?.addEventListener('click', () => {
  const current = document.documentElement.dataset.theme || 'system';
  const next = current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system';
  setTheme(next);
  try { localStorage.setItem('portfolio-theme', next); } catch {}
});

const menuButton = document.querySelector<HTMLButtonElement>('[data-menu-toggle]');
const nav = document.getElementById('site-nav');
const closeMenu = () => { menuButton?.setAttribute('aria-expanded', 'false'); nav?.classList.remove('is-open'); };
menuButton?.addEventListener('click', () => {
  const open = menuButton.getAttribute('aria-expanded') !== 'true';
  menuButton.setAttribute('aria-expanded', String(open));
  nav?.classList.toggle('is-open', open);
});
nav?.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menuButton?.getAttribute('aria-expanded') === 'true') {
    closeMenu();
    menuButton.focus();
  }
});

const viewer = document.querySelector<HTMLDialogElement>('#image-viewer');
const viewerImage = document.querySelector<HTMLImageElement>('#viewer-image');
const viewerCaption = document.getElementById('viewer-caption');
document.querySelectorAll<HTMLAnchorElement>('[data-lightbox]').forEach(link => {
  link.addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || !viewer?.showModal || !viewerImage) return;
    event.preventDefault();
    viewerImage.src = link.href;
    viewerImage.alt = link.dataset.previewAlt || link.querySelector('img')?.alt || ui.projectImage;
    if (viewerCaption) viewerCaption.textContent = link.dataset.caption || '';
    viewer.showModal();
  });
});
document.querySelector('[data-viewer-close]')?.addEventListener('click', () => viewer?.close());
viewer?.addEventListener('click', event => { if (event.target === viewer) viewer.close(); });
viewerImage?.addEventListener('error', () => { if (viewerCaption) viewerCaption.textContent = ui.imageError; });

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
document.querySelectorAll<HTMLButtonElement>('[data-animation]').forEach(button => {
  const figure = button.closest('figure');
  const image = figure?.querySelector('img');
  if (!figure || !image) return;
  const lightbox = figure.querySelector<HTMLAnchorElement>('[data-lightbox]');
  const status = button.parentElement?.querySelector<HTMLElement>('.clip-status');
  const posterSources = image.getAttribute('srcset');
  let loadingVersion = 0;
  const reset = () => { button.disabled = false; button.removeAttribute('aria-busy'); };
  const stop = () => {
    loadingVersion++;
    image.src = button.dataset.poster!;
    if (posterSources) image.setAttribute('srcset', posterSources);
    if (lightbox) lightbox.href = button.dataset.poster!;
    button.setAttribute('aria-pressed', 'false');
    button.textContent = ui.playClip;
    reset();
  };
  const play = () => {
    if (button.disabled || button.getAttribute('aria-pressed') === 'true') return;
    const version = ++loadingVersion;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.textContent = ui.loadingClip;
    if (status) status.textContent = '';
    const clip = new Image();
    clip.onload = () => {
      if (version !== loadingVersion) return;
      image.removeAttribute('srcset');
      image.src = button.dataset.animation!;
      if (lightbox) lightbox.href = button.dataset.animation!;
      button.setAttribute('aria-pressed', 'true');
      button.textContent = ui.stopClip;
      reset();
    };
    clip.onerror = () => {
      if (version !== loadingVersion) return;
      button.textContent = ui.playClip;
      if (status) status.textContent = ui.clipError;
      reset();
    };
    clip.src = button.dataset.animation!;
  };
  button.addEventListener('click', () => {
    if (button.getAttribute('aria-pressed') === 'true') stop();
    else play();
  });
  reducedMotion.addEventListener('change', event => { if (event.matches) stop(); });
  if (button.dataset.autoplay === 'true' && !reducedMotion.matches) {
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          observer.disconnect();
          if (!reducedMotion.matches) play();
        }
      });
      observer.observe(image);
    } else play();
  }
});
const languageLink = document.querySelector<HTMLAnchorElement>('[data-language-switch]');
if (languageLink) {
  const target = languageLink.href.split('#')[0];
  const preserveHash = () => { languageLink.href = target + window.location.hash; };
  preserveHash();
  window.addEventListener('hashchange', preserveHash);
}
