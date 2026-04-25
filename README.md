# vidokoun

**[Install vidokoun Userscript](https://raw.githubusercontent.com/hanenashi/vidokoun/main/vidokoun.user.js)**  
*(Requires a userscript manager like [Tampermonkey](https://www.tampermonkey.net/). Tested mainly with Kiwi Browser on Android and desktop Chromium-style browsers.)*

## TL;DR

`vidokoun` is a lightweight userscript for `okoun.cz` that detects video links inside post bodies and adds lazy inline players below them.

Supported targets:

- YouTube
- Vimeo
- Twitter/X video tweets
- Instagram posts/reels
- Direct `.mp4` links

The script does **not** load heavy embeds immediately. It inserts clickable placeholders first, then loads the player only after user interaction.

## Current version

`1.0.9`

Main focus of this version:

- safer mobile behavior on video-heavy Okoun pages
- Twitter/X MP4 extraction via `api.vxtwitter.com`
- `GM_xmlhttpRequest` blob-loading workaround for Twitter/X CDN/CORS/hotlink issues
- automatic cleanup of old loaded Twitter/X blobs after 3 loaded videos

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

Because the script uses `GM_xmlhttpRequest`, your userscript manager may request network permissions for:

```javascript
// @connect      api.vxtwitter.com
// @connect      video.twimg.com
// @connect      twitter.com
// @connect      x.com
```

If Twitter/X loading suddenly stops after an update, check that Tampermonkey/Kiwi actually accepted the new permissions. Userscript managers sometimes keep old permissions until the script is reinstalled. Very modern, very haunted.

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

Standard iframe services use `getEmbedUrl()`. Direct MP4 links use native `<video>`. Twitter/X uses a custom loader.

### Lazy loading

Vidokoun does not immediately load YouTube/Vimeo/Instagram/Twitter embeds.

Instead it inserts a placeholder:

```text
[ Load YouTube ]
[ Load Twitter/X ]
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

### Twitter/X loading flow

Twitter/X handling is special because direct `video.twimg.com` playback can fail in browsers with `403 Forbidden`, CORS, hotlink protection, or other CDN weirdness.

Current flow:

```text
User clicks Load Twitter/X
  -> GM_xmlhttpRequest fetches JSON from api.vxtwitter.com
  -> script extracts first MP4 URL
  -> GM_xmlhttpRequest downloads MP4 as Blob
  -> URL.createObjectURL(blob) creates local blob: URL
  -> <video src="blob:..."> is inserted
  -> if anything fails, fallback to Twitter embed iframe
```

Fallback iframe:

```text
https://platform.twitter.com/embed/Tweet.html?id=<tweet_id>
```

### Twitter/X memory cleanup

Blob playback is useful, but it has a cost: the whole MP4 is downloaded into memory/blob storage first.

To avoid memory buildup, v1.0.9 keeps only the latest 3 loaded Twitter/X blob videos alive:

```javascript
const MAX_LOADED_TWITTER_BLOBS = 3;
```

When a 4th Twitter/X blob video is loaded:

```text
oldest loaded Twitter/X video
  -> pause()
  -> remove src
  -> video.load()
  -> URL.revokeObjectURL(blobUrl)
  -> replace video with a fresh Load Twitter/X placeholder
```

This cleanup is silent. No warning, no popup, no tiny bureaucrat with a clipboard.

Additional cleanup runs on page exit:

```javascript
window.addEventListener('pagehide', revokeAllTwitterBlobs, { once: true });
window.addEventListener('beforeunload', revokeAllTwitterBlobs, { once: true });
```

### Direct MP4 handling

Direct `.mp4` links are inserted as native videos:

```html
<video controls preload="none" playsinline>
```

They do not use the Twitter/X blob cleanup queue, because they are not downloaded through `GM_xmlhttpRequest` first.

### Fallback behavior

If Twitter/X MP4 extraction or blob loading fails, Vidokoun falls back to a full Twitter/X embed iframe.

This is heavier, but better than a dead black rectangle.

## Permissions

Current metadata grants:

```javascript
// @grant        GM_xmlhttpRequest
// @connect      api.vxtwitter.com
// @connect      video.twimg.com
// @connect      twitter.com
// @connect      x.com
```

The script previously used `@grant none`, but Twitter/X blob loading requires `GM_xmlhttpRequest`.

## Notes for mobile / Kiwi Browser

Pixel/Kiwi was one of the main pain points behind v1.0.8 and v1.0.9.

Known practical behavior:

- listing pages should stay light because videos are lazy-loaded
- Twitter/X videos are loaded as blobs, so they cost real memory
- only 3 Twitter/X blob videos are kept loaded at once
- older loaded Twitter/X videos are automatically replaced back with placeholders
- YouTube/Vimeo/Instagram iframes are still browser-managed and can be heavier than placeholders after loading

## Changelog highlights

### 1.0.9

- Added silent auto-cleanup for Twitter/X blob videos.
- Keeps only 3 loaded Twitter/X blob videos alive.
- Revokes blob URLs with `URL.revokeObjectURL()`.
- Replaces unloaded old videos back with fresh placeholders.
- Cleans all tracked Twitter/X blobs on `pagehide` / `beforeunload`.

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
- Blob loading downloads the whole MP4 before playback; this is not true streaming.
- Very large Twitter/X videos can still be memory-expensive before cleanup has a chance to help.
- Instagram embeds may be heavy or blocked depending on browser/session/privacy settings.
- A real streaming proxy would need an external server; userscript-only code cannot truly proxy server-side traffic.
