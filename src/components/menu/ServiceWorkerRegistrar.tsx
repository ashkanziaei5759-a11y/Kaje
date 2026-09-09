'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker that makes the menu installable and usable
 * offline.
 *
 * Registration is skipped in development: a cached dev bundle survives code
 * changes and produces confusing stale renders.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch((error) => console.error('Service worker registration failed:', error));
    };

    // Wait for load so registration never competes with the first paint.
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);

  return null;
}
