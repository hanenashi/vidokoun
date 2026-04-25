# vidokoun

**[Install vidokoun Userscript](https://raw.githubusercontent.com/hanenashi/vidokoun/main/vidokoun.user.js)**  
*(Requires a userscript manager. Tested mainly with Tampermonkey/Kiwi on Android and desktop Chromium-style browsers. v1.1.1 adds a compatibility wrapper for Firefox/Greasemonkey-style `GM.xmlHttpRequest`.)*

## TL;DR

`vidokoun` is a lightweight userscript for `okoun.cz` that detects video links inside post bodies and adds lazy inline players below them.

Supported targets:

- YouTube
- Vimeo
- Twitter/X video tweets
- Instagram posts/reels
- Facebook videos/reels/posts where a video URL can be extracted
- Direct `.mp4` links

The script does **not** load heavy embeds immediately. It inserts clickable placeholders first, then loads the player only after user interaction.

## Current version

`1.1.1`

Main focus of this version:

- Firefox/Greasemonkey compatibility wrapper for `GM.xmlHttpRequest`
- keeps Tampermonkey/Kiwi/Chromium support through `GM_xmlhttpRequest`
- experimental Instagram MP4 extraction from page HTML
- experimental Facebook MP4 extraction from page HTML
- Twitter/X MP4 extraction via `api.vxtwitter.com`
- blob-loading workaround for CDN/CORS/hotlink issues
- automatic cleanup of old loaded social blobs after 3 loaded videos

## Installation

Install directly from:

```text
https://raw.githubusercontent.com/hanenashi/vidokoun/main/vidokoun.user.js
```

The userscript includes update metadata:

```javascript
// @updateURL    https://raw.githubusercontent.com/hanenashi/vidokoun/main/vidokoun.user.js
// @downloadURL  https://raw.githubusercontent.com/hanenashi/vidokoun/main/vidokoun.user.js
```

Because the script uses cross-origin userscript requests, your userscript manager may request network permissions for several domains.

Current metadata grants:

```javascript
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
```

Current network permissions:

```javascript
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
```

If video loading suddenly stops after an update, check that the userscript manager actually accepted the new permissions. Userscript managers sometimes keep old permissions until the script is reinstalled. Very modern, very haunted.

## Browser / userscript manager notes

### Tampermonkey / Kiwi / Chromium

This is still the main target environment.

Vidokoun uses:

```javascript
GM_xmlhttpRequest(...)
```

when available.

### Firefox / Greasemonkey

v1.1.1 adds a compatibility wrapper for newer Greasemonkey-style API:

```javascript
GM.xmlHttpRequest(...)
```

The wrapper tries APIs in this order:

```text
1. GM_xmlhttpRequest      // Tampermonkey / Violentmonkey-style
2. GM.xmlHttpRequest      // Greasemonkey 4+ style
3. throw clean error
```

Compatibility wrapper:

```javascript
function gmRequest(details) {
    if (typeof GM_xmlhttpRequest === 'function') {
        return GM_xmlhttpRequest(details);
    }

    if (typeof GM !== 'undefined' && GM && typeof GM.xmlHttpRequest === 'function') {
        const result = GM.xmlHttpRequest(details);

        if (result && typeof result.then === 'function') {
            result.then((res) => {
                if (typeof details.onload === 'function') details.onload(res);
            }).catch((err) => {
                if (typeof details.onerror === 'function') details.onerror(err);
            });
        }

        return result;
    }

    throw new Error('No GM xmlhttp request API available');
}
```

Reality check: Firefox/Greasemonkey API support is now handled, but Meta video extraction can still fail because Facebook/Instagram page HTML and media URLs are intentionally unfriendly. API compatibility does not magically make Meta less cursed.

## Technical overview

### DOM targeting

The script scans only links inside Okoun post content:

```javascript
div.content a
.item .content a
```

This avoids touching navigation, profile links, board controls, and other site UI.

Processed links are marked with:

```html
data-vidokoun-done="1"
class="vid-embedded"
```

Injected Vidokoun nodes are marked with:

```html
data-vidokoun-node="1"
```

This prevents duplicate embedding and keeps the mutation observer from repeatedly eating its own tail.

### Service registry

Video services are defined in a simple internal registry. Each service has:

- `name`
- `regex`
- optional `getEmbedUrl(id)`
- optional `customAction(...)`
- `style`
- optional `isNative`

Standard iframe services use `getEmbedUrl()`. Direct MP4 links use native `<video>`. Twitter/X, Instagram, and Facebook use custom loaders.

### Lazy loading

Vidokoun does not immediately load YouTube/Vimeo/Instagram/Facebook/Twitter embeds.

Instead it inserts a placeholder:

```text
[ Load YouTube ]
[ Load Twitter/X ]
[ Load Instagram ]
[ Load Facebook ]
...
```

Only after clicking does it create the actual iframe or video element.

This keeps Okoun listing pages lighter, especially on mobile.

### MutationObserver behavior

The script uses a `MutationObserver` to handle posts added dynamically after page load.

Important details:

- observer watches `document.body`
- added nodes are collected into a `Set`
- scanning is debounced by 250 ms
- only newly added roots are scanned, not the entire page every time
- injected Vidokoun nodes are ignored via `data-vidokoun-node="1"`

This avoids the earlier failure mode where injected embeds triggered new scans, which then triggered more DOM work, which made mobile browsers sad.

## Social blob loading flow

Blob playback is used for Twitter/X, Instagram, and Facebook when a direct MP4 URL can be found.

General flow:

```text
User clicks placeholder
  -> userscript request fetches service metadata/page HTML
  -> script extracts first MP4 URL
  -> userscript request downloads MP4 as Blob
  -> URL.createObjectURL(blob) creates local blob: URL
  -> <video src="blob:..."> is inserted
  -> if anything fails, fallback iframe is inserted
```

### Twitter/X loading flow

Twitter/X uses `api.vxtwitter.com`:

```text
User clicks Load Twitter/X
  -> gmRequest fetches JSON from api.vxtwitter.com
  -> script extracts first MP4 URL
  -> gmRequest downloads MP4 as Blob
  -> blob video is inserted
  -> if anything fails, fallback to Twitter embed iframe
```

Fallback iframe:

```text
https://platform.twitter.com/embed/Tweet.html?id=<tweet_id>
```

### Instagram loading flow

Instagram handling is experimental.

```text
User clicks Load Instagram
  -> gmRequest fetches Instagram post/reel HTML
  -> script searches meta tags and embedded JSON for an MP4 URL
  -> gmRequest downloads MP4 as Blob
  -> blob video is inserted
  -> if anything fails, fallback to Instagram embed iframe
```

Fallback iframe:

```text
https://www.instagram.com/<p|reel>/<shortcode>/embed/
```

### Facebook loading flow

Facebook handling is experimental and probably the most fragile.

```text
User clicks Load Facebook
  -> gmRequest fetches Facebook page HTML
  -> script searches meta tags and embedded JSON for an MP4 URL
  -> gmRequest downloads MP4 as Blob
  -> blob video is inserted
  -> if anything fails, fallback to Facebook plugin iframe
```

Fallback iframe:

```text
https://www.facebook.com/plugins/video.php?href=<encoded_original_url>&show_text=false&width=550
```

## Social blob memory cleanup

Blob playback is useful, but it has a cost: the whole MP4 is downloaded into memory/blob storage first.

To avoid memory buildup, v1.1.1 keeps only the latest 3 loaded social blob videos alive:

```javascript
const MAX_LOADED_SOCIAL_BLOBS = 3;
```

Tracked blob videos include:

- Twitter/X blob videos
- Instagram blob videos
- Facebook blob videos

When a 4th social blob video is loaded:

```text
oldest loaded social blob video
  -> pause()
  -> remove src
  -> video.load()
  -> URL.revokeObjectURL(blobUrl)
  -> replace video with a fresh Load placeholder
```

This cleanup is silent. No warning, no popup, no tiny bureaucrat with a clipboard.

Additional cleanup runs on page exit:

```javascript
window.addEventListener('pagehide', revokeAllSocialBlobs, { once: true });
window.addEventListener('beforeunload', revokeAllSocialBlobs, { once: true });
```

## Direct MP4 handling

Direct `.mp4` links are inserted as native videos:

```html
<video controls preload="none" playsinline>
```

They do not use the social blob cleanup queue, because they are not downloaded through `gmRequest` first.

## Fallback behavior

If MP4 extraction or blob loading fails, Vidokoun falls back to the service iframe/embed where available.

Fallbacks are heavier, but better than a dead black rectangle.

## Notes for mobile / Kiwi Browser

Pixel/Kiwi was one of the main pain points behind v1.0.8 and newer.

Known practical behavior:

- listing pages should stay light because videos are lazy-loaded
- blob-loaded videos cost real memory
- only 3 social blob videos are kept loaded at once
- older loaded blob videos are automatically replaced back with placeholders
- YouTube/Vimeo/Instagram/Facebook iframes are still browser-managed and can be heavier than placeholders after loading
- Meta extraction may fail frequently; fallback iframe is expected, not a disaster

## Changelog highlights

### 1.1.1

- Added Firefox/Greasemonkey compatibility wrapper.
- Added `GM.xmlHttpRequest` grant while keeping `GM_xmlhttpRequest`.
- Routed internal cross-origin requests through `gmRequest(...)`.
- Keeps Chromium/Kiwi/Tampermonkey behavior intact.

### 1.1.0

- Added experimental Instagram MP4 extraction from page HTML.
- Added experimental Facebook MP4 extraction from page HTML.
- Added fallback iframes for Instagram and Facebook.
- Generalized blob cleanup from Twitter-only to social blob videos.
- Added Meta-related `@connect` permissions.

### 1.0.9

- Added silent auto-cleanup for Twitter/X blob videos.
- Keeps only 3 loaded Twitter/X blob videos alive.
- Revokes blob URLs with `URL.revokeObjectURL()`.
- Replaces unloaded old videos back with fresh placeholders.
- Cleans tracked Twitter/X blobs on `pagehide` / `beforeunload`.

### 1.0.8

- Switched Twitter/X MP4 loading to `GM_xmlhttpRequest`.
- Loads Twitter/X MP4s as local `blob:` URLs.
- Added fallback to Twitter embed iframe when blob loading fails.
- Added required `@connect` permissions.

### 1.0.7

- Debounced `MutationObserver` processing.
- Avoided repeated full-page rescans.
- Added `data-vidokoun-node` markers to ignore Vidokoun's own injected DOM.
- Reduced mobile freezing risk on pages with many Twitter/X links.

## Limitations

- Twitter/X behavior depends on `api.vxtwitter.com` and Twitter/X media availability.
- Instagram/Facebook extraction is best-effort only and can break when Meta changes page structure.
- Blob loading downloads the whole MP4 before playback; this is not true streaming.
- Very large videos can still be memory-expensive before cleanup has a chance to help.
- Some Facebook/Instagram videos may require login, regional access, cookies, or may hide media URLs from page HTML.
- A real streaming proxy would need an external server; userscript-only code cannot truly proxy server-side traffic.
