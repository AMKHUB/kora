---
name: video-streaming-pipeline
description: Optimize video encoding, adaptive HLS bitrate ladders (360p–4K), MP4 faststart, Cloudflare Stream / Mux integration, and hls.js ABR configuration for Kora streaming quality on West African 3G/4G and Fiber networks.
---

# Kora Video Streaming Pipeline

Use this skill whenever preparing, encoding, troubleshooting, or scaling video delivery for **Kora** (`src/player.tsx`, `api/play.js`, `supabase/functions/play/index.ts`, `public.video_assets`).

## 1. Adaptive Bitrate Ladder (Optimized for Mali / West Africa + Diaspora)

| Rendition | Resolution | Video Bitrate | Audio Bitrate | Target Network |
|---|---|---|---|---|
| Mobile Eco | 640×360 | 600 kbps | 96 kbps AAC | 3G / Low data |
| SD | 854×480 | 1 200 kbps | 128 kbps AAC | Mobile 4G |
| HD | 1280×720 | 2 800 kbps | 128 kbps AAC | 4G / Wi-Fi |
| Full HD | 1920×1080 | 5 200 kbps | 192 kbps AAC | Fiber / TV |

### Fast-Start MP4 Command (Instant Playback Before Full Download)
```bash
ffmpeg -i input.mp4 -c:v libx264 -preset medium -crf 21 -pix_fmt yuv420p \
  -c:a aac -b:a 128k -ar 48000 -movflags +faststart output_faststart.mp4
```

### Multi-Bitrate HLS Packaging Command (4-Second Segments)
```bash
ffmpeg -i input.mp4 \
  -filter_complex "[0:v]split=3[v1][v2][v3]; [v1]scale=640:360[v1o]; [v2]scale=1280:720[v2o]; [v3]scale=1920:1080[v3o]" \
  -map "[v1o]" -c:v:0 libx264 -b:v:0 600k -maxrate:0 750k -bufsize:0 1200k \
  -map "[v2o]" -c:v:1 libx264 -b:v:1 2800k -maxrate:1 3200k -bufsize:1 5600k \
  -map "[v3o]" -c:v:2 libx264 -b:v:2 5200k -maxrate:2 6000k -bufsize:2 10400k \
  -map a:0 -c:a aac -b:a 128k -ar 48000 \
  -f hls -hls_time 4 -hls_playlist_type vod -hls_segment_filename "stream_%v_%03d.ts" \
  -master_pl_name master.m3u8 -var_stream_map "v:0,a:0 v:1,a:0 v:2,a:0" stream_%v.m3u8
```

## 2. Player Streaming Checklist (`src/player.tsx`)
- `hls.js` must enable `capLevelToPlayerSize: true`, `startLevel: -1`, `maxBufferLength: 30`, `backBufferLength: 30`, and automatic recovery for `NETWORK_ERROR` (`hls.startLoad()`) and `MEDIA_ERROR` (`hls.recoverMediaError()`).
- `<video>` must include `crossOrigin="anonymous"`, `playsInline`, and `preload="auto"`.
- Show a buffering spinner on `waiting`/`stalled`, clear on `playing`/`canplay`, and track `buffered` range on the scrub bar.
- When integrating an external HLS CDN (Cloudflare Stream or Mux), update CSP `media-src` and `connect-src` in BOTH `server.js` and `vercel.json` (see `/csp-sync`).

## 3. Server Playback Verification (`api/play.js` & `supabase/functions/play/index.ts`)
- Prefer `video_assets.hls_url` (adaptive streaming) when set; fall back to a 1-hour signed Supabase Storage URL (`videos` bucket).
- Always allow both `premium` and `family` plans for premium-gated content.
- Never expose Supabase keys or signed URL logic in frontend code (`src/`).
