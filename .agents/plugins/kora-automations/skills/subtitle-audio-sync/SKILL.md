---
name: subtitle-audio-sync
description: Synchronize WebVTT and SRT subtitles precisely with spoken voice and audio in Kora (AI voice transcription via Gemini 2.5 Flash / Whisper, SRT-to-WebVTT normalization, millisecond offset calibration, and frame-accurate player rendering).
---

# Kora Subtitle & Voice Synchronization

Use this skill when generating, importing, fixing, or auditing synchronized subtitles in **Kora** (`api/subtitles.js`, `src/player.tsx`, `public.subtitles`, `src/admin.tsx`, `src/studio/StudioApp.tsx`).

## 1. Golden Rules for Voice-Synced Subtitles
1. **Never display fake/demo subtitles over real videos.** Only render cues parsed from real WebVTT tracks stored in `public.subtitles` for that `title_id` / `episode_id`.
2. **Frame-accurate sync in `src/player.tsx`**:
   - Track playback time using `video.requestVideoFrameCallback` (`meta.mediaTime`) with `timeupdate` fallback.
   - Apply track offset + viewer calibration: `effectiveTime = mediaTime + (offset_ms / 1000)`.
   - Expose live `[` (`-0.1 s`) and `]` (`+0.1 s`) sync shortcuts + persistent admin save via `POST /api/subtitles?action=offset`.
3. **Dialogue Clarity Audio Processing**:
   - Provide optional Web Audio API vocal clarity (`BiquadFilterNode` peaking at `2800 Hz`, `+3.5 dB` + `DynamicsCompressorNode`) so speech stays intelligible over background music/SFX.

## 2. Automatic Voice-to-Subtitle Generation (`/api/subtitles?action=generate`)
- Supported server-side AI engines (configure ONE key in Vercel Environment Variables — never in frontend):
  - `GEMINI_API_KEY` (Google AI Studio — native multimodal video/audio transcription & translation directly into timestamped WebVTT for French, English, Bambara, Japanese, etc.)
  - `GROQ_API_KEY` (`whisper-large-v3-turbo`, ultra-fast `response_format=vtt`)
  - `OPENAI_API_KEY` (`whisper-1`, `response_format=vtt`)
- For videos larger than 20 MB, extract compressed mono 16 kHz speech audio locally first before transcribing:
  ```bash
  ffmpeg -i film.mp4 -vn -ac 1 -ar 16000 -b:a 32k audio_speech.mp3
  ```

## 3. WebVTT Quality Checklist
- Header must start with `WEBVTT`.
- Timestamps must use dots (`00:01:02.340 --> 00:01:05.120`), never SRT commas.
- Each cue should be 1–2 lines, max ~42 characters per line, minimum duration `0.8s`, maximum duration `6.0s`.
- End timestamp must strictly exceed start timestamp (`end > start`).
