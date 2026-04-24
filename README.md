# vidokoun

**[⚡ Install vidokoun Userscript](https://raw.githubusercontent.com/hanenashi/vidokoun/main/vidokoun.user.js)**
*(Requires a userscript manager like [Tampermonkey](https://www.tampermonkey.net/))*

## TL;DR
A lightweight userscript that transforms plain-text YouTube and Vimeo links into responsive inline iframes directly within `okoun.cz` posts.

## Technical Overview
- **Targeting:** Uses specific DOM selectors (`.item .content a`, `div.content a`) to strictly isolate anchor tags inside post bodies, avoiding navigation and UI elements.
- **Parsing:** Applies regex mapping to standard and shortened URLs to extract video IDs.
- **Injection:** Generates an isolated `div` wrapper and an `iframe`, injecting them into the DOM immediately succeeding the original text link. Marks processed links with a `.vid-embedded` class to prevent duplicate rendering.
- **Dynamic Content Support:** Attaches a `MutationObserver` to `document.body` to passively monitor node additions. This ensures videos are automatically embedded in posts injected dynamically without requiring a hard page refresh.
- **Updates:** Uses `@updateURL` and `@downloadURL` metadata tags to enable automatic background script updates from the `main` branch of this repository.
- 
