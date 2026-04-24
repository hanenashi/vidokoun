// ==UserScript==
// @name         vidokoun
// @namespace    http://tampermonkey.net/
// @version      1.0.4
// @description  Lazy-loads YouTube, Vimeo, Twitter, IG, and direct MP4 links in okoun.cz posts
// @author       hanenashi
// @match        *://*.okoun.cz/*
// @updateURL    https://raw.githubusercontent.com/hanenashi/vidokoun/main/vidokoun.user.js
// @downloadURL  https://raw.githubusercontent.com/hanenashi/vidokoun/main/vidokoun.user.js
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Video/Social service regex patterns, embed URLs, and custom aspect ratios
    const services = [
        {
            name: 'YouTube',
            regex: /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i,
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
            name: 'Twitter',
            regex: /(?:twitter\.com|x\.com)\/[a-zA-Z0-9_]+\/status\/(\d+)/i,
            getEmbedUrl: (id) => `https://platform.twitter.com/embed/Tweet.html?id=${id}`,
            style: 'height: 450px; resize: vertical;'
        },
        {
            name: 'Instagram',
            regex: /instagram\.com\/(?:p|reel)\/([a-zA-Z0-9_-]+)/i,
            getEmbedUrl: (id) => `https://www.instagram.com/p/${id}/embed/`,
            style: 'aspect-ratio: 4/5; min-height: 550px;'
        },
        {
            name: 'Direct MP4',
            regex: /(https?:\/\/[^\s]+\.mp4(?:\?.*)?)/i,
            isNative: true, // Flag to use native <video> instead of an iframe
            style: 'aspect-ratio: 16/9; background: #000; max-height: 550px;'
        }
    ];

    const createPlaceholder = (service, id) => {
        const placeholder = document.createElement('div');
        placeholder.style.cssText = `width: 100%; ${service.style} background-color: #1a1a1a; border-radius: 4px; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.2); transition: background 0.2s ease; background-position: center; background-size: cover;`;
        
        if (service.name === 'YouTube') {
            placeholder.style.backgroundImage = `url(https://i.ytimg.com/vi/${id}/hqdefault.jpg)`;
        }

        const playBtn = document.createElement('div');
        playBtn.innerHTML = `▶ Load ${service.name}`;
        playBtn.style.cssText = 'background: rgba(0, 0, 0, 0.75); color: #fff; padding: 10px 20px; border-radius: 20px; font-family: sans-serif; font-size: 13px; font-weight: bold; pointer-events: none; border: 1px solid rgba(255,255,255,0.2);';
        
        placeholder.onmouseenter = () => playBtn.style.background = 'rgba(255, 0, 0, 0.9)';
        placeholder.onmouseleave = () => playBtn.style.background = 'rgba(0, 0, 0, 0.75)';

        placeholder.appendChild(playBtn);

        placeholder.addEventListener('click', function() {
            const iframe = document.createElement('iframe');
            iframe.src = service.getEmbedUrl(id);
            iframe.style.cssText = `width: 100%; ${service.style} border: none; border-radius: 4px; background: white;`;
            iframe.allowFullscreen = true;
            iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
            
            this.replaceWith(iframe);
        });

        return placeholder;
    };

    const embedVideos = () => {
        const links = document.querySelectorAll('div.content a:not(.vid-embedded), .item .content a:not(.vid-embedded)');
        
        links.forEach(link => {
            const url = link.href;
            
            for (const service of services) {
                const match = url.match(service.regex);
                if (match && match[1]) {
                    link.classList.add('vid-embedded'); 
                    
                    const wrapper = document.createElement('div');
                    wrapper.style.cssText = 'margin: 12px 0; max-width: 550px;';
                    
                    if (service.isNative) {
                        // Native HTML5 video tag specifically for .mp4 links
                        const video = document.createElement('video');
                        video.src = match[1];
                        video.controls = true;
                        video.preload = 'none'; // The crucial part: 0 bytes downloaded on page load
                        video.style.cssText = `width: 100%; ${service.style} border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.2);`;
                        wrapper.appendChild(video);
                    } else {
                        // Facade injection for iframe-based services
                        const placeholder = createPlaceholder(service, match[1]);
                        wrapper.appendChild(placeholder);
                    }
                    
                    link.parentNode.insertBefore(wrapper, link.nextSibling);
                    
                    // Hide original link if it wraps an image thumbnail
                    if (link.querySelector('img')) {
                        link.style.display = 'none';
                    }
                    
                    break; 
                }
            }
        });
    };

    embedVideos();

    const observer = new MutationObserver((mutations) => {
        let shouldRun = false;
        for (const mut of mutations) {
            if (mut.addedNodes.length) {
                shouldRun = true;
                break;
            }
        }
        if (shouldRun) embedVideos();
    });

    observer.observe(document.body, { childList: true, subtree: true });
})();
