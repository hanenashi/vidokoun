// ==UserScript==
// @name         vidokoun
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Embeds YouTube and Vimeo links directly into okoun.cz posts
// @author       kokochan
// @match        *://*.okoun.cz/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Video service regex patterns and embed URL generators
    const services = [
        {
            name: 'YouTube',
            regex: /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i,
            getEmbedUrl: (id) => `https://www.youtube.com/embed/${id}`
        },
        {
            name: 'Vimeo',
            regex: /vimeo\.com\/(?:.*#|.*\/videos\/)?([0-9]+)/i,
            getEmbedUrl: (id) => `https://player.vimeo.com/video/${id}`
        }
    ];

    const embedVideos = () => {
        // Target links strictly within post contents 
        const links = document.querySelectorAll('div.content a:not(.vid-embedded), .item .content a:not(.vid-embedded)');
        
        links.forEach(link => {
            const url = link.href;
            
            for (const service of services) {
                const match = url.match(service.regex);
                if (match && match[1]) {
                    link.classList.add('vid-embedded'); // Mark to avoid duplicate embeds
                    
                    const wrapper = document.createElement('div');
                    wrapper.style.cssText = 'margin: 12px 0; max-width: 600px;';
                    
                    const iframe = document.createElement('iframe');
                    iframe.src = service.getEmbedUrl(match[1]);
                    iframe.style.cssText = 'width: 100%; aspect-ratio: 16/9; border: none; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.2);';
                    iframe.allowFullscreen = true;
                    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
                    
                    wrapper.appendChild(iframe);
                    
                    // Place the iframe container right below the original text link
                    link.parentNode.insertBefore(wrapper, link.nextSibling);
                    break; 
                }
            }
        });
    };

    // Run on initial load
    embedVideos();

    // Catch dynamically loaded posts to ensure compatibility with other scripts
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
