// Browser-side media work: uploading the source, extracting audio for
// transcription, sampling frames for reframe, and rendering the export.
import {
  ALL_FORMATS,
  BufferTarget,
  CanvasSink,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
  UrlSource,
  WavOutputFormat,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
} from "mediabunny";
import { FONT_FAMILIES, cropRect, drawFrame, outputSize, type Look } from "./render";

const PART_SIZE = 10 * 1024 * 1024;
export const AUDIO_CHUNK_SEC = 600;

async function ok<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

/** The duration of a local video file, read by the browser. */
export function readDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };
    video.onerror = () => reject(new Error("This file can't be read as a video."));
    video.src = URL.createObjectURL(file);
  });
}

export async function uploadVideo(file: File, title: string, onProgress: (fraction: number) => void) {
  const durationSec = await readDuration(file);
  const contentType = file.type === "video/quicktime" || file.type === "video/webm" ? file.type : "video/mp4";
  const { id } = await ok<{ id: string }>(
    await fetch("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, durationSec, contentType }),
    }),
  );
  const { uploadId } = await ok<{ uploadId: string }>(await fetch(`/api/projects/${id}/upload?step=start`, { method: "POST" }));
  const parts: { partNumber: number; etag: string }[] = [];
  const count = Math.max(1, Math.ceil(file.size / PART_SIZE));
  for (let i = 0; i < count; i++) {
    const body = file.slice(i * PART_SIZE, (i + 1) * PART_SIZE);
    const { etag } = await ok<{ etag: string }>(
      await fetch(`/api/projects/${id}/upload?uploadId=${encodeURIComponent(uploadId)}&part=${i + 1}`, { method: "PUT", body }),
    );
    parts.push({ partNumber: i + 1, etag });
    onProgress((i + 1) / count);
  }
  await ok(
    await fetch(`/api/projects/${id}/upload?step=complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ uploadId, parts }),
    }),
  );
  return id;
}

const sourceInput = (projectId: string) =>
  new Input({ source: new UrlSource(`/api/projects/${projectId}/source`), formats: ALL_FORMATS });

/** Extracts 16 kHz mono audio for the range and stores it in parts of ten minutes. */
export async function extractAudio(projectId: string, start: number, end: number, onProgress: (fraction: number) => void) {
  let chunks = 0;
  for (let from = start; from < end - 0.5; from += AUDIO_CHUNK_SEC) {
    const to = Math.min(end, from + AUDIO_CHUNK_SEC);
    const input = sourceInput(projectId);
    if (!(await input.getPrimaryAudioTrack())) throw new Error("This video has no sound to transcribe.");
    const output = new Output({ format: new WavOutputFormat(), target: new BufferTarget() });
    const conversion = await Conversion.init({
      input,
      output,
      trim: { start: from, end: to },
      video: { discard: true },
      audio: { numberOfChannels: 1, sampleRate: 16000, forceTranscode: true },
    });
    if (!conversion.isValid) throw new Error("This video's sound can't be decoded in this browser.");
    conversion.onProgress = (p) => onProgress((from - start + p * (to - from)) / (end - start));
    await conversion.execute();
    await ok(await fetch(`/api/projects/${projectId}/audio/${chunks}`, { method: "PUT", body: output.target.buffer! }));
    chunks++;
  }
  return { chunks, chunkSec: AUDIO_CHUNK_SEC };
}

/** Small JPEG frames across the clip, for finding the subject. */
export async function sampleFrames(projectId: string, start: number, end: number, count = 6) {
  const input = sourceInput(projectId);
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error("This video has no picture.");
  const sink = new CanvasSink(track, { width: 384, fit: "contain" });
  const times = Array.from({ length: count }, (_, i) => start + ((end - start) * (i + 0.5)) / count);
  const frames: { t: number; image: string }[] = [];
  let i = 0;
  for await (const wrapped of sink.canvasesAtTimestamps(times)) {
    const t = times[i++]!;
    if (!wrapped) continue;
    const canvas = wrapped.canvas;
    let image: string;
    if (canvas instanceof HTMLCanvasElement) image = canvas.toDataURL("image/jpeg", 0.7);
    else {
      const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.7 });
      image = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(blob);
      });
    }
    frames.push({ t: Math.round(t * 100) / 100, image });
  }
  return frames;
}

export async function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export async function loadFont(font: string) {
  const family = FONT_FAMILIES[font];
  if (family) await document.fonts.load(`800 48px ${family}`).catch(() => undefined);
}

/** Renders the clip to MP4 in the browser and stores it. Returns the file size. */
export async function exportClip(
  clip: { id: string; projectId: string; start: number; end: number },
  look: Look,
  logoUrl: string | null,
  onProgress: (fraction: number) => void,
) {
  if (look.template) await loadFont(look.template.font);
  const logo = logoUrl ? await loadImage(logoUrl) : null;
  const input = sourceInput(clip.projectId);
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error("This video has no picture.");
  const srcW = track.displayWidth;
  const srcH = track.displayHeight;
  const { width, height } = outputSize(look.aspect, srcW, srcH);
  const videoCodec = await getFirstEncodableVideoCodec(["avc", "vp9", "av1"], { width, height });
  if (!videoCodec) throw new Error("This browser can't encode video. Try a recent Chrome or Edge.");
  const hasAudio = !!(await input.getPrimaryAudioTrack());
  const audioCodec = hasAudio ? await getFirstEncodableAudioCodec(["aac", "opus"]) : null;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d")!;
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
  let offset: number | null = null;
  const conversion = await Conversion.init({
    input,
    output,
    trim: { start: clip.start, end: clip.end },
    video: {
      codec: videoCodec,
      forceTranscode: true,
      processedWidth: width,
      processedHeight: height,
      process: (sample) => {
        if (offset === null) offset = sample.timestamp < clip.start - 0.05 ? clip.start : 0;
        const t = sample.timestamp + offset;
        const frame = sample.toCanvasImageSource();
        drawFrame(ctx, frame, srcW, srcH, width, height, look, t, logo);
        return canvas;
      },
    },
    audio: audioCodec ? { codec: audioCodec } : { discard: true },
  });
  if (!conversion.isValid) throw new Error("This clip can't be rendered in this browser.");
  conversion.onProgress = onProgress;
  await conversion.execute();
  const buffer = output.target.buffer!;
  await ok(await fetch(`/api/clips/${clip.id}/export`, { method: "PUT", headers: { "content-type": "video/mp4" }, body: buffer }));
  return buffer.byteLength;
}

export { cropRect };
