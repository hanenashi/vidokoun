// ==UserScript==
// @name         vidokoun
// @namespace    http://tampermonkey.net/
// @version      1.0.7
// @description  Lazy-loads videos, extracts Twitter/X MP4s, and adds fallback source links without melting mobile browsers
// @author       hanenashi
// @match        *://*.okoun.cz/*
// @updateURL    https://raw.githubusercontent.com/hanenashi/vidokoun/main/vidokoun.user.js
// @downloadURL  https://raw.githubusercontent.com/hanenashi/vidokoun/main/vidokoun.user.js
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const DEBUG = false;
    const MAX_WIDTH = '550px';

    function log(...args) {
        if (DEBUG) console.log('[vidokoun]', ...args);
    }

    const services = [
        {
            name: 'YouTube',
            regex: /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([^"&?\/\s]{11})/i,
            getEmbedUrl: (id) => `https://www.youtube.com/embed/${id}?autoplay=1`,
            style: 'aspect-ratio: 16/9;'
        },
        {
            name: 'Vimeo',
            regex: /vimeo\.com\/(?:.*#|.*\/videos\/)?([0-9]+)/i,
            getEmbedUrl: (id) => `https://player.vimeo.com/video/${id}?autoplay=1`,
            style: 'aspect-ratio: 16/9;'
        },
        {
            name: 'Twitter/X',
            regex: /(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)\/status\/(\d+)/i,
            style: 'aspect-ratio: 16/9; background: #000;',
            customAction: async (placeholderNode, match, originalUrl) => {
                const username = match[1];
                const id = match[2];
                const button = placeholderNode.querySelector('.vidokoun-play');

                try {
                    const controller = new AbortController();
                    const timer = setTimeout(() => controller.abort(), 12000);

                    const res = await fetch(`https://api.vxtwitter.com/${username}/status/${id}`, {
                        signal: controller.signal
                    });

                    clearTimeout(timer);

                    if (!res.ok) {
                        throw new Error(`vxtwitter HTTP ${res.status}`);
                    }

                    const data = await res.json();

                    const videoUrl =
                        (data.mediaURLs || []).find(url => /\.mp4(?:\?|$)/i.test(url)) ||
                        (data.media_extended || []).map(m => m.url).find(url => /\.mp4(?:\?|$)/i.test(url));

                    if (!videoUrl) {
                        throw new Error('No MP4 found in tweet');
                    }

                    const video = document.createElement('video');
                    video.src = videoUrl;
                    video.controls = true;
                    video.autoplay = true;
                    video.preload = 'metadata';
                    video.playsInline = true;
                    video.setAttribute('data-vidokoun-node', '1');
                    video.style.cssText = [
                        'width: 100%;',
                        'aspect-ratio: 16/9;',
                        'border-radius: 4px;',
                        'box-shadow: 0 2px 8px rgba(0,0,0,0.2);',
                        'background: #000;'
                    ].join(' ');

                    placeholderNode.replaceWith(video);
                } catch (e) {
                    log('Twitter/X load failed:', e);

                    const failBox = document.createElement('div');
                    failBox.setAttribute('data-vidokoun-node', '1');
                    failBox.style.cssText = [
                        'width: 100%;',
                        'min-height: 90px;',
                        'background: #1a1a1a;',
                        'color: #ddd;',
                        'border-radius: 4px;',
                        'display: flex;',
                        'align-items: center;',
                        'justify-content: center;',
                        'font-family: sans-serif;',
                        'font-size: 13px;',
                        'text-align: center;',
                        'padding: 12px;',
                        'box-sizing: border-box;'
                    ].join(' ');

                    failBox.innerHTML = `
                        <div>
                            <div style="margin-bottom: 8px;">Could not extract Twitter/X video.</div>
                            <a href="${escapeAttr(originalUrl)}" target="_blank" rel="noopener noreferrer" style="color:#aaa;">
                                Open original link
                            </a>
                        </div>
                    `;

                    placeholderNode.replaceWith(failBox);
                }
            }
        },
        {
            name: 'Instagram',
            regex: /instagram\.com\/(?:p|reel)\/([a-zA-Z0-9_-]+)/i,
            getEmbedUrl: (id) => `https://www.instagram.com/p/${id}/embed/`,
            style: 'aspect-ratio: 4/5; min-height: 550px;'
        },
        {
            name: 'Direct MP4',
            regex: /(https?:\/\/[^\s"'<>]+\.mp4(?:\?[^\s"'<>]*)?)/i,
            isNative: true,
            style: 'aspect-ratio: 16/9; background: #000; max-height: 550px;'
        }
    ];

    function escapeAttr(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function isInsideVidokounNode(node) {
        if (!node || node.nodeType !== 1) return false;
        return !!node.closest('[data-vidokoun-node="1"]');
    }

    function createPlaceholder(service, match, originalUrl) {
        const id = service.name === 'Twitter/X' ? match[2] : match[1];

        const placeholder = document.createElement('div');
        placeholder.setAttribute('data-vidokoun-node', '1');
        placeholder.style.cssText = [
            'width: 100%;',
            service.style,
            'background-color: #1a1a1a;',
            'border-radius: 4px;',
            'display: flex;',
            'align-items: center;',
            'justify-content: center;',
            'cursor: pointer;',
            'box-shadow: 0 2px 8px rgba(0,0,0,0.2);',
            'transition: background 0.2s ease;',
            'background-position: center;',
            'background-size: cover;'
        ].join(' ');

        if (service.name === 'YouTube') {
            placeholder.style.backgroundImage = `url(https://i.ytimg.com/vi/${id}/hqdefault.jpg)`;
        }

        const playBtn = document.createElement('div');
        playBtn.className = 'vidokoun-play';
        playBtn.textContent = `Load ${service.name}`;
        playBtn.style.cssText = [
            'background: rgba(0, 0, 0, 0.75);',
            'color: #fff;',
            'padding: 10px 20px;',
            'border-radius: 20px;',
            'font-family: sans-serif;',
            'font-size: 13px;',
            'font-weight: bold;',
            'pointer-events: none;',
            'border: 1px solid rgba(255,255,255,0.2);',
            'transition: all 0.2s;'
        ].join(' ');

        placeholder.onmouseenter = () => {
            playBtn.style.background = 'rgba(180, 0, 0, 0.9)';
        };

        placeholder.onmouseleave = () => {
            playBtn.style.background = 'rgba(0, 0, 0, 0.75)';
        };

        placeholder.appendChild(playBtn);

        placeholder.addEventListener('click', async function() {
            if (this.dataset.vidokounLoading === '1') return;
            this.dataset.vidokounLoading = '1';

            playBtn.textContent = 'Loading...';
            playBtn.style.background = 'rgba(100, 100, 100, 0.9)';

            if (service.customAction) {
                await service.customAction(this, match, originalUrl);
                return;
            }

            const iframe = document.createElement('iframe');
            iframe.setAttribute('data-vidokoun-node', '1');
            iframe.src = service.getEmbedUrl(id);
            iframe.style.cssText = [
                'width: 100%;',
                service.style,
                'border: none;',
                'border-radius: 4px;',
                'background: white;'
            ].join(' ');
            iframe.allowFullscreen = true;
            iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';

            this.replaceWith(iframe);
        });

        return placeholder;
    }

    function makeSourceLink(url, serviceName) {
        const sourceLink = document.createElement('a');
        sourceLink.setAttribute('data-vidokoun-node', '1');
        sourceLink.href = url;
        sourceLink.target = '_blank';
        sourceLink.rel = 'noopener noreferrer';
        sourceLink.textContent = `[ Open original ${serviceName} link ]`;
        sourceLink.style.cssText = [
            'align-self: flex-end;',
            'margin-top: 6px;',
            'font-size: 11px;',
            'color: #888;',
            'text-decoration: none;',
            'font-family: sans-serif;'
        ].join(' ');

        sourceLink.onmouseenter = () => {
            sourceLink.style.color = '#ccc';
        };

        sourceLink.onmouseleave = () => {
            sourceLink.style.color = '#888';
        };

        return sourceLink;
    }

    function processLink(link) {
        if (!link || link.nodeType !== 1) return;
        if (link.dataset.vidokounDone === '1') return;
        if (isInsideVidokounNode(link)) return;

        const contentRoot = link.closest('div.content, .item .content');
        if (!contentRoot) return;

        const url = link.href;
        if (!url) return;

        for (const service of services) {
            const match = url.match(service.regex);
            if (!match) continue;

            link.dataset.vidokounDone = '1';
            link.classList.add('vid-embedded');

            const wrapper = document.createElement('div');
            wrapper.setAttribute('data-vidokoun-node', '1');
            wrapper.style.cssText = [
                'margin: 12px 0;',
                `max-width: ${MAX_WIDTH};`,
                'display: flex;',
                'flex-direction: column;'
            ].join(' ');

            if (service.isNative) {
                const video = document.createElement('video');
                video.setAttribute('data-vidokoun-node', '1');
                video.src = match[1];
                video.controls = true;
                video.preload = 'none';
                video.playsInline = true;
                video.style.cssText = [
                    'width: 100%;',
                    service.style,
                    'border-radius: 4px;',
                    'box-shadow: 0 2px 8px rgba(0,0,0,0.2);'
                ].join(' ');
                wrapper.appendChild(video);
            } else {
                wrapper.appendChild(createPlaceholder(service, match, url));
            }

            wrapper.appendChild(makeSourceLink(url, service.name));

            if (link.parentNode) {
                link.parentNode.insertBefore(wrapper, link.nextSibling);
            }

            if (link.querySelector('img')) {
                link.style.display = 'none';
            }

            log('embedded', service.name, url);
            return;
        }

        link.dataset.vidokounDone = '1';
    }

    function processRoot(root) {
        if (!root) return;

        if (root.nodeType !== 1) return;
        if (isInsideVidokounNode(root)) return;

        if (root.matches && root.matches('div.content a, .item .content a')) {
            processLink(root);
        }

        const links = root.querySelectorAll
            ? root.querySelectorAll('div.content a:not([data-vidokoun-done="1"]), .item .content a:not([data-vidokoun-done="1"])')
            : [];

        links.forEach(processLink);
    }

    function processInitialPage() {
        processRoot(document.body);
    }

    let scanTimer = null;
    const pendingRoots = new Set();

    function scheduleProcess(root) {
        if (!root || root.nodeType !== 1) return;
        if (isInsideVidokounNode(root)) return;

        pendingRoots.add(root);

        if (scanTimer) return;

        scanTimer = setTimeout(() => {
            const roots = Array.from(pendingRoots);
            pendingRoots.clear();
            scanTimer = null;

            roots.forEach(processRoot);
        }, 250);
    }

    processInitialPage();

    const observer = new MutationObserver((mutations) => {
        for (const mut of mutations) {
            for (const node of mut.addedNodes) {
                scheduleProcess(node);
            }
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
})();
