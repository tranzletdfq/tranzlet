// Tranzlet PWA bootstrap.
// The splash screen is an installed-app experience only; normal web visits stay instant.
(() => {
  const isInstalledApp =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  if (!isInstalledApp) {
    const style = document.createElement('style');
    style.id = 'tranzlet-browser-no-splash';
    style.textContent = '#app-splash{display:none!important}';
    document.head.appendChild(style);
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error) => {
        console.error('Tranzlet service worker registration failed:', error);
      });
    });
  }
})();
