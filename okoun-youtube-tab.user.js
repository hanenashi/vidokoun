// ==UserScript==
// @name         Okoun YouTube: open in tab
// @namespace    https://github.com/hanenashi/vidokoun
// @version      0.1.2
// @description  Open Okoun YouTube previews directly, with a landscape fullscreen button on the watch page.
// @icon         https://raw.githubusercontent.com/hanenashi/vidokoun/main/assets/vidokoun-youtube-icon.png
// @updateURL    https://raw.githubusercontent.com/hanenashi/vidokoun/main/okoun-youtube-tab.user.js
// @downloadURL  https://raw.githubusercontent.com/hanenashi/vidokoun/main/okoun-youtube-tab.user.js
// @match        https://www.okoun.cz/*
// @match        https://okoun.cz/*
// @match        https://www.youtube.com/watch*
// @match        https://m.youtube.com/watch*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  if (location.hostname.endsWith('okoun.cz')) {
    const decorate = () => {
      for (const card of document.querySelectorAll('.okoun-embed--youtube[data-embed-id]')) {
        if (card.querySelector('.okoun-youtube-tab-link')) continue;
        const id = card.getAttribute('data-embed-id');
        if (!/^[A-Za-z0-9_-]{11}$/.test(id || '')) continue;

        const url = new URL('https://m.youtube.com/watch');
        url.searchParams.set('v', id);

        const link = document.createElement('a');
        link.className = 'okoun-youtube-tab-link';
        link.href = url.href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.setAttribute('aria-label', 'Open YouTube video in a new tab');
        link.title = 'Open on YouTube in a new tab';
        Object.assign(link.style, {
          position: 'absolute',
          inset: '0',
          zIndex: '10',
          display: 'block',
          cursor: 'pointer',
        });
        if (getComputedStyle(card).position === 'static') card.style.position = 'relative';
        card.append(link);
      }
    };

    const start = () => {
      decorate();
      new MutationObserver(decorate).observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    };
    if (document.documentElement) start();
    else document.addEventListener('DOMContentLoaded', start, { once: true });
    return;
  }

  const button = document.createElement('button');
  button.textContent = '▶ Landscape fullscreen';
  button.setAttribute('aria-label', 'Play this video in landscape fullscreen');
  Object.assign(button.style, {
    position: 'fixed',
    left: '50%',
    bottom: 'max(24px, env(safe-area-inset-bottom))',
    transform: 'translateX(-50%)',
    zIndex: '2147483647',
    padding: '14px 20px',
    border: '0',
    borderRadius: '999px',
    background: '#c00',
    color: 'white',
    font: 'bold 16px system-ui, sans-serif',
    boxShadow: '0 3px 16px #0009',
  });

  button.addEventListener('click', () => {
    const video = document.querySelector('video');
    if (!video) {
      button.textContent = 'Video still loading — tap again';
      return;
    }

    const fullscreenControl = document.querySelector(
      '.player-controls-bottom .fullscreen-icon, .ytp-fullscreen-button'
    );
    if (!fullscreenControl) {
      button.textContent = 'YouTube controls still loading — tap again';
      return;
    }

    // Let YouTube fullscreen its player so its controls and double-tap seeking stay available.
    fullscreenControl.click();
    button.remove();
  });

  const showButton = () => document.body?.append(button);
  if (document.body) showButton();
  else document.addEventListener('DOMContentLoaded', showButton, { once: true });
})();
