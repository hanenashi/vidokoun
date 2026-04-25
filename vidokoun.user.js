// ==UserScript==
// @name         vidokoun
// @namespace    http://tampermonkey.net/
// @version      1.1.0
// @description  Lazy-loads videos, tries GM blob loading for Twitter/X, Instagram, and Facebook, auto-cleans old blobs, and falls back to embeds
// @author       hanenashi
// @match        *://*.okoun.cz/*
// @updateURL    https://raw.githubusercontent.com/hanenashi/vidokoun/main/vidokoun.user.js
// @downloadURL  https://raw.githubusercontent.com/hanenashi/vidokoun/main/vidokoun.user.js
// @grant        GM_xmlhttpRequest
// @connect      api.vxtwitter.com
// @connect      video.twimg.com
// @connect      twitter.com
// @connect      x.com
// @connect      facebook.com
// @connect      www.facebook.com
// @connect      instagram.com
// @connect      www.instagram.com
// @connect      cdninstagram.com
// @connect      *.cdninstagram.com
// @connect      fbcdn.net
// @connect      *.fbcdn.net
// @connect      *.xx.fbcdn.net
// @connect      fbsbx.com
// @connect      *.fbsbx.com
// ==/UserScript==

(function() {
    'use strict';

    const DEBUG = false;
    const MAX_WIDTH = '550px';
    const MAX_LOADED_SOCIAL_BLOBS = 3;

    const loadedSocialBlobs = [];

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

    function gmGetText(url, referer, timeout = 15000) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                timeout,
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Referer': referer || url
                },
                onload: (res) => {
                    if (res.status < 200 || res.status >= 300) {
                        reject(new Error(`HTML HTTP ${res.status}`));
                        return;
                    }
                    resolve(res.responseText || '');
                },
                onerror: () => reject(new Error('GM HTML request failed')),
                ontimeout: () => reject(new Error('GM HTML request timeout'))
            });
        });
    }

    function gmGetBlobUrl(url, referer, timeout = 30000) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                timeout,
                responseType: 'blob',
                headers: {
                    'Accept': 'video/mp4,video/*,*/*',
                    'Referer': referer || url
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

    function htmlDecode(str) {
        const textarea = document.createElement('textarea');
        textarea.innerHTML = String(str || '');
        return textarea.value;
    }

    function looseDecodeUrl(str) {
        if (!str) return '';

        let out = String(str);

        for (let i = 0; i < 3; i++) {
            out = htmlDecode(out)
                .replace(/\\\//g, '/')
                .replace(/\\u0025/g, '%')
                .replace(/\\u0026/g, '&')
                .replace(/\\u003d/gi, '=')
                .replace(/\\u003f/gi, '?')
                .replace(/\\u002f/gi, '/')
                .replace(/\\u003a/gi, ':');

            try {
                out = decodeURIComponent(out);
            } catch (e) {
                // Keep partially decoded value.
            }
        }

        return out;
    }

    function looksLikeMp4Url(url) {
        return /^https?:\/\//i.test(url || '') && /\.mp4(?:[?#]|$)/i.test(url || '');
    }

    function extractFirstMp4FromHtml(html) {
        if (!html) return null;

        const patterns = [
            /<meta[^>]+(?:property|name)=["']og:video(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
            /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:video(?::secure_url)?["']/i,
            /<meta[^>]+(?:property|name)=["']twitter:player:stream["'][^>]+content=["']([^"']+)["']/i,
            /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']twitter:player:stream["']/i,
            /"playable_url_quality_hd"\s*:\s*"([^"]+)"/i,
            /"playable_url"\s*:\s*"([^"]+)"/i,
            /"browser_native_hd_url"\s*:\s*"([^"]+)"/i,
            /"browser_native_sd_url"\s*:\s*"([^"]+)"/i,
            /"video_url"\s*:\s*"([^"]+)"/i,
            /"contentUrl"\s*:\s*"([^"]+)"/i,
            /"src"\s*:\s*"(https?:\\\/\\\/[^"<>]+?\.mp4[^"<>]*)"/i,
            /(https?:\\\/\\\/[^"<>]+?\.mp4[^"<>]*)/i,
            /(https?:\/\/[^"'<>\s]+?\.mp4[^"'<>\s]*)/i
        ];

        for (const pattern of patterns) {
            const match = html.match(pattern);
            if (!match || !match[1]) continue;

            const decoded = looseDecodeUrl(match[1]);
            if (looksLikeMp4Url(decoded)) return decoded;
        }

        return null;
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

    function makeInstagramIframe(shortcode, type) {
        const iframe = document.createElement('iframe');
        iframe.setAttribute('data-vidokoun-node', '1');
        iframe.src = `https://www.instagram.com/${type}/${encodeURIComponent(shortcode)}/embed/`;
        iframe.style.cssText = [
            'width: 100%;',
            'height: 560px;',
            'resize: vertical;',
            'border: none;',
            'border-radius: 4px;',
            'background: #fff;'
        ].join(' ');
        iframe.allowFullscreen = true;
        iframe.allow = 'autoplay; fullscreen; picture-in-picture';
        return iframe;
    }

    function makeFacebookIframe(originalUrl) {
        const iframe = document.createElement('iframe');
        iframe.setAttribute('data-vidokoun-node', '1');
        iframe.src = `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(originalUrl)}&show_text=false&width=550`;
        iframe.style.cssText = [
            'width: 100%;',
            'height: 460px;',
            'resize: vertical;',
            'border: none;',
            'border-radius: 4px;',
            'background: #fff;'
        ].join(' ');
        iframe.allowFullscreen = true;
        iframe.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture';
        return iframe;
    }

    function registerSocialBlobVideo(record) {
        loadedSocialBlobs.push(record);
        cleanupSocialBlobs();
    }

    function unregisterSocialBlobVideo(record) {
        const index = loadedSocialBlobs.indexOf(record);
        if (index !== -1) loadedSocialBlobs.splice(index, 1);
    }

    function cleanupSocialBlobs() {
        while (loadedSocialBlobs.length > MAX_LOADED_SOCIAL_BLOBS) {
            const oldest = loadedSocialBlobs.shift();
            if (oldest && typeof oldest.unload === 'function') oldest.unload();
        }
    }

    function revokeAllSocialBlobs() {
        while (loadedSocialBlobs.length) {
            const item = loadedSocialBlobs.shift();
            if (item && typeof item.unload === 'function') item.unload(true);
        }
    }

    async function insertBlobVideo({ placeholderNode, match, originalUrl, service, videoUrl, referer, fallbackNodeFactory }) {
        const blobUrl = await gmGetBlobUrl(videoUrl, referer);

        const video = document.createElement('video');
        video.src = blobUrl;
        video.controls = true;
        video.autoplay = true;
        video.preload = 'metadata';
        video.playsInline = true;
        video.setAttribute('data-vidokoun-node', '1');
        video.style.cssText = [
            'width: 100%;',
            service.style || 'aspect-ratio: 16/9;',
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

                try { video.pause(); } catch (e) { /* ignore */ }
                video.removeAttribute('src');
                try { video.load(); } catch (e) { /* ignore */ }
                URL.revokeObjectURL(blobUrl);
                unregisterSocialBlobVideo(record);

                if (!pageLeaving && video.isConnected) {
                    const freshPlaceholder = createPlaceholder(service, match, originalUrl);
                    video.replaceWith(freshPlaceholder);
                }
            }
        };

        video.addEventListener('error', () => {
            record.unload(true);
            if (video.isConnected && fallbackNodeFactory) {
                video.replaceWith(fallbackNodeFactory());
            }
        }, { once: true });

        placeholderNode.replaceWith(video);
        registerSocialBlobVideo(record);
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

                    if (!videoUrl) throw new Error('No MP4 found in tweet');

                    await insertBlobVideo({
                        placeholderNode,
                        match,
                        originalUrl,
                        service,
                        videoUrl,
                        referer: 'https://x.com/',
                        fallbackNodeFactory: () => makeTwitterIframe(id)
                    });
                } catch (e) {
                    log('Twitter/X GM blob load failed, falling back to iframe:', e);
                    placeholderNode.replaceWith(makeTwitterIframe(id));
                }
            }
        },
        {
            name: 'Instagram',
            regex: /instagram\.com\/(p|reel)\/([a-zA-Z0-9_-]+)/i,
            style: 'aspect-ratio: 4/5; min-height: 550px; background: #000;',
            customAction: async (placeholderNode, match, originalUrl, service) => {
                const type = match[1];
                const shortcode = match[2];

                try {
                    const html = await gmGetText(originalUrl, 'https://www.instagram.com/');
                    const videoUrl = extractFirstMp4FromHtml(html);

                    if (!videoUrl) throw new Error('No MP4 found in Instagram page');

                    await insertBlobVideo({
                        placeholderNode,
                        match,
                        originalUrl,
                        service,
                        videoUrl,
                        referer: 'https://www.instagram.com/',
                        fallbackNodeFactory: () => makeInstagramIframe(shortcode, type)
                    });
                } catch (e) {
                    log('Instagram GM blob load failed, falling back to iframe:', e);
                    placeholderNode.replaceWith(makeInstagramIframe(shortcode, type));
                }
            }
        },
        {
            name: 'Facebook',
            regex: /facebook\.com\/(?:watch\/?\?v=\d+|reel\/[^/?#]+|[^\s?#]+\/videos\/[^/?#]+|share\/v\/[^/?#]+|[^\s?#]+\/posts\/[^/?#]+)/i,
            style: 'aspect-ratio: 16/9; background: #000;',
            customAction: async (placeholderNode, match, originalUrl, service) => {
                try {
                    const html = await gmGetText(originalUrl, 'https://www.facebook.com/');
                    const videoUrl = extractFirstMp4FromHtml(html);

                    if (!videoUrl) throw new Error('No MP4 found in Facebook page');

                    await insertBlobVideo({
                        placeholderNode,
                        match,
                        originalUrl,
                        service,
                        videoUrl,
                        referer: 'https://www.facebook.com/',
                        fallbackNodeFactory: () => makeFacebookIframe(originalUrl)
                    });
                } catch (e) {
                    log('Facebook GM blob load failed, falling back to iframe:', e);
                    placeholderNode.replaceWith(makeFacebookIframe(originalUrl));
                }
            }
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
        const id = service.name === 'Twitter/X' ? match[2] : (service.name === 'Instagram' ? match[2] : match[1]);

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

    window.addEventListener('pagehide', revokeAllSocialBlobs, { once: true });
    window.addEventListener('beforeunload', revokeAllSocialBlobs, { once: true });
})();
