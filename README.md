# Video Clipper

Upload a long video and get short highlight clips picked by AI. Trim, reframe and caption each clip with your own template, then export it as an MP4.

Inspired by https://opus.pro

Built with [oss.new](https://oss.new) for [EveryApp](https://github.com/every-app/every-app).

## Features

- Upload MP4, MOV or WebM videos as projects you can play, rename and delete.
- Find clips in a chosen part of a video by length and an optional prompt, ranked by highlight score.
- Trim, rename and delete clips, pick 9:16, 1:1 or 16:9, and follow the speaker or place the frame by hand.
- Add word-by-word animated captions, fix words, highlight keywords and pick a caption style.
- Keep templates with font, colours, caption position, uppercase and a logo, one of them your default.
- Export clips to MP4 in the browser and download them again later.

Left out: accounts and sign-in, which your Gateway handles; importing from video links; social publishing and scheduling; B-roll, voice-over and other generation add-ons; a public API; plans and billing; editor project exports and custom font upload; native mobile apps.

## Setup

- Install: `pnpm install`, then `pnpm everyapp install <repository url>` or `pnpm run deploy` from a clone.
- Run locally: `pnpm dev`. Test: `pnpm test` for unit tests; `checks/` holds the release suites.
- AI clipping and "Follow the speaker" use OpenAI through your Gateway: add a key with `pnpm everyapp provider add openai` (https://platform.openai.com/api-keys). Without it, upload, editing, captions of existing clips and export still work.
- No other secrets or settings. Storage (D1, R2) and the job queue are created on deploy; R2 must be enabled on the Cloudflare account.

## Limitations

- Audio extraction and export run in the browser; use a recent Chrome or Edge. Long exports take about as long as the clip and need the tab open.
- Exports use H.264 when the browser can encode it, otherwise VP9 in the MP4 file.
- Transcription is sent in ten-minute parts; very long scans take a while and use OpenAI credit.
- The suites run with a local stand-in for the AI provider; real OpenAI calls and deployment were not exercised here.
