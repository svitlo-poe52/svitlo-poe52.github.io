// Classic (non-module) script loaded in <head> so the saved theme applies before first paint.
(function () {
  const KEY = 'svitlo-theme';
  const root = document.documentElement;
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  if (saved === 'light' || saved === 'dark') root.dataset.theme = saved;

  const dark = () => root.dataset.theme
    ? root.dataset.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;

  function sync() {
    document.querySelectorAll('[data-theme-toggle]').forEach((b) => {
      b.setAttribute('aria-pressed', String(dark()));
      const label = b.querySelector('[data-theme-label]');
      if (label) label.textContent = dark() ? b.dataset.darkLabel || 'темна' : b.dataset.lightLabel || 'світла';
    });
    document.dispatchEvent(new CustomEvent('themechange', { detail: { dark: dark() } }));
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-theme-toggle]')) return;
    root.dataset.theme = dark() ? 'light' : 'dark';
    try { localStorage.setItem(KEY, root.dataset.theme); } catch (err) {}
    sync();
  });
  const mq = matchMedia('(prefers-color-scheme: dark)');
  // Safari before 14 only has the old addListener API.
  if (mq.addEventListener) mq.addEventListener('change', sync); else mq.addListener(sync);
  document.addEventListener('DOMContentLoaded', sync);
})();
