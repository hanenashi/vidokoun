// ==UserScript==
// @name         vidokoun
// @namespace    http://tampermonkey.net/
// @version      1.0.9
// @description  Lazy-loads videos, extracts Twitter/X MP4s, tries GM blob loading, auto-cleans old blobs, and falls back to Twitter iframe
// @author       hanenashi
// @match        *://*.okoun.cz/*
// @updateURL    https://raw.githubusercontent.com/hanenashi/vidokoun/main/vidokoun.user.js
// @downloadURL  https://raw.githubusercontent.com/hanenashi/vidokoun/main/vidokoun.user.js
// @grant        GM_xmlhttpRequest
// @connect      api.vxtwitter.com
// @connect      video.twimg.com
// @connect      twitter.com
// @connect      x.com
// ==/UserScript==

(function() {
    'use strict';

    const DEBUG = false;
    const MAX_WIDTH = '550px';
    const MAX_LOADED_TWITTER_BLOBS = 3;

    const loadedTwitterBlobs = [];

    function log(...args) {
        if (DEBUG) console.log('[vidokoun]', ...args);
    }

    function gmGetJson(url, timeout = 12000) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                timeout,
                headers: {
                    'Accept': 'application/json,text/plain,*/*'
                },
                onload: (res) => {
                    if (res.status < 200 || res.status >= 300) {
                        reject(new Error(`HTTP ${res.status}`));
                        return;
                    }

                    try {
                        resolve(JSON.parse(res.responseText));
                    } catch (e) {
                        reject(new Error('Bad JSON response'));
                    }
                },
                onerror: () => reject(new Error('GM JSON request failed')),
                ontimeout: () => reject(new Error('GM JSON request timeout'))
            });
        });
    }

    function gmGetBlobUrl(url, timeout = 30000) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                timeout,
                responseType: 'blob',
                headers: {
                    'Accept': 'video/mp4,video/*,*/*',
                    'Referer': 'https://x.com/'
                },
                onload: (res) => {
                    if (res.status < 200 || res.status >= 300) {
                        reject(new Error(`MP4 HTTP ${res.status}`));
                        return;
                    }

                    if (!res.response || !res.response.size) {
                        reject(new Error('Empty MP4 blob'));
                        return;
                    }

                    resolve(URL.createObjectURL(res.response));
                },
                onerror: () => reject(new Error('GM MP4 request failed')),
                ontimeout: () => reject(new Error('GM MP4 request timeout'))
            });
        });
    }

    function makeTwitterIframe(id) {
        const iframe = document.createElement('iframe');
        iframe.setAttribute('data-vidokoun-node', '1');
        iframe.src = `https://platform.twitter.com/embed/Tweet.html?id=${encodeURIComponent(id)}`;
        iframe.style.cssText = [
            'width: 100%;',
            'height: 460px;',
            'resize: vertical;',
            'border: none;',
            'border-radius: 4px;',
            'background: #fff;'
        ].join(' ');
        iframe.allowFullscreen = true;
        iframe.allow = 'autoplay; fullscreen; picture-in-picture';
        return iframe;
    }

    function registerTwitterBlobVideo(record) {
        loadedTwitterBlobs.push(record);
        cleanupTwitterBlobs();
    }

    function unregisterTwitterBlobVideo(record) {
        const index = loadedTwitterBlobs.indexOf(record);
        if (index !== -1) loadedTwitterBlobs.splice(index, 1);
    }

    function cleanupTwitterBlobs() {
        while (loadedTwitterBlobs.length > MAX_LOADED_TWITTER_BLOBS) {
            const oldest = loadedTwitterBlobs.shift();
            if (oldest && typeof oldest.unload === 'function') {
                oldest.unload();
            }
        }
    }

    function revokeAllTwitterBlobs() {
        while (loadedTwitterBlobs.length) {
            const item = loadedTwitterBlobs.shift();
            if (item && typeof item.unload === 'function') {
                item.unload(true);
            }
        }
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
            customAction: async (placeholderNode, match, originalUrl, service) => {
                const username = match[1];
                const id = match[2];

                try {
                    const data = await gmGetJson(`https://api.vxtwitter.com/${encodeURIComponent(username)}/status/${encodeURIComponent(id)}`);

                    const videoUrl =
                        (data.mediaURLs || []).find(url => /\.mp4(?:\?|$)/i.test(url)) ||
                        (data.media_extended || []).map(m => m.url).find(url => /\.mp4(?:\?|$)/i.test(url));

                    if (!videoUrl) {
                        throw new Error('No MP4 found in tweet');
                    }

                    const blobUrl = await gmGetBlobUrl(videoUrl);

                    const video = document.createElement('video');
                    video.src = blobUrl;
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

                    let unloaded = false;
                    const record = {
                        blobUrl,
                        video,
                        unload: (pageLeaving = false) => {
                            if (unloaded) return;
                            unloaded = true;

                            try {
                                video.pause();
                            } catch (e) {
                                // ignore
                            }

                            video.removeAttribute('src');
                            try {
                                video.load();
                            } catch (e) {
                                // ignore
                            }

                            URL.revokeObjectURL(blobUrl);
                            unregisterTwitterBlobVideo(record);

                            if (!pageLeaving && video.isConnected) {
                                const freshPlaceholder = createPlaceholder(service, match, originalUrl);
                                video.replaceWith(freshPlaceholder);
                            }
                        }
                    };

                    video.addEventListener('error', () => {
                        record.unload(true);
                        if (video.isConnected) {
                            video.replaceWith(makeTwitterIframe(id));
                        }
                    }, { once: true });

                    placeholderNode.replaceWith(video);
                    registerTwitterBlobVideo(record);
                } catch (e) {
                    log('Twitter/X GM blob load failed, falling back to iframe:', e);
                    placeholderNode.replaceWith(makeTwitterIframe(id));
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
                await service.customAction(this, match, originalUrl, service);
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

    window.addEventListener('pagehide', revokeAllTwitterBlobs, { once: true });
    window.addEventListener('beforeunload', revokeAllTwitterBlobs, { once: true });
})();
