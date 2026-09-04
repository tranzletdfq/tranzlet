// Tranzlet PWA bootstrap.
// The splash screen is an installed-app experience only; normal web visits stay instant.
(() => {
  const isInstalledApp =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  // Shared visual polish for every Tranzlet page.
  const style = document.createElement('style');
  style.id = 'tranzlet-global-polish';
  style.textContent = `
    html { scroll-behavior: smooth; }
    body { overflow-x: hidden; }
    *, *::before, *::after { box-sizing: border-box; }
    button, a, input, select, textarea { -webkit-tap-highlight-color: transparent; }
    button, a { touch-action: manipulation; }
    input, select, textarea { font-size: 16px; }
    :focus-visible { outline: 2px solid #F97316; outline-offset: 2px; }
    @media (max-width: 639px) {
      main { min-width: 0; }
      section { min-width: 0; }
      h1, h2, h3, p { overflow-wrap: break-word; }
      .rounded-2xl { border-radius: 1rem; }
      .rounded-3xl { border-radius: 1.25rem; }
    }
    @media (max-width: 420px) {
      header .max-w-7xl, header .max-w-3xl { padding-left: 1rem; padding-right: 1rem; }
      main > .max-w-7xl, main > .max-w-4xl, main > .max-w-3xl { padding-left: 1rem; padding-right: 1rem; }
    }
    @media (prefers-reduced-motion: reduce) {
      html { scroll-behavior: auto; }
      *, *::before, *::after { transition-duration: .01ms !important; animation-duration: .01ms !important; }
    }
  `;
  document.head.appendChild(style);

  if (!isInstalledApp) {
    const splashStyle = document.createElement('style');
    splashStyle.id = 'tranzlet-browser-no-splash';
    splashStyle.textContent = '#app-splash{display:none!important}';
    document.head.appendChild(splashStyle);
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error) => {
        console.error('Tranzlet service worker registration failed:', error);
      });
    });
  }
})();
