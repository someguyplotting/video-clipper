// Draws one frame of a clip: the reframed video, captions and logo. The
// preview and the export share it, so what you see is what you get.
import type { Word } from "@/lib/highlights";

export type Aspect = "9:16" | "1:1" | "16:9";
export type CaptionStyle = "pop" | "box" | "karaoke" | "minimal";

export interface Look {
  aspect: Aspect;
  focusMode: "auto" | "manual";
  focusX: number;
  focusY: number;
  keyframes: { t: number; x: number; y: number }[];
  captionsOn: boolean;
  captionStyle: CaptionStyle;
  words: Word[];
  template: {
    font: string;
    textColor: string;
    highlightColor: string;
    position: string;
    uppercase: boolean;
    logoCorner: string;
  } | null;
}

export const FONT_FAMILIES: Record<string, string> = {
  sans: "system-ui, sans-serif",
  anton: "'Anton', sans-serif",
  bebas: "'Bebas Neue', sans-serif",
  montserrat: "'Montserrat', sans-serif",
  serif: "Georgia, serif",
};

const RATIOS: Record<Aspect, number> = { "9:16": 9 / 16, "1:1": 1, "16:9": 16 / 9 };

/** The source rectangle the aspect ratio keeps. */
export function cropSize(aspect: Aspect, w: number, h: number) {
  const r = RATIOS[aspect];
  return w / h > r ? { cw: h * r, ch: h } : { cw: w, ch: w / r };
}

/** Output size: the crop, scaled so the short side is at most 1080, even. */
export function outputSize(aspect: Aspect, w: number, h: number) {
  const { cw, ch } = cropSize(aspect, w, h);
  const scale = Math.min(1, 1080 / Math.min(cw, ch));
  const even = (n: number) => Math.max(2, Math.round((n * scale) / 2) * 2);
  return { width: even(cw), height: even(ch) };
}

export function focusAt(look: Look, t: number) {
  const k = look.keyframes;
  if (look.focusMode !== "auto" || !k.length) return { x: look.focusX, y: look.focusY };
  if (t <= k[0]!.t) return { x: k[0]!.x, y: k[0]!.y };
  for (let i = 1; i < k.length; i++) {
    const a = k[i - 1]!;
    const b = k[i]!;
    if (t <= b.t) {
      const f = (t - a.t) / Math.max(0.001, b.t - a.t);
      const ease = f * f * (3 - 2 * f);
      return { x: a.x + (b.x - a.x) * ease, y: a.y + (b.y - a.y) * ease };
    }
  }
  const last = k[k.length - 1]!;
  return { x: last.x, y: last.y };
}

/** Where the crop sits in the source for a given focus point. */
export function cropRect(look: Look, t: number, w: number, h: number) {
  const { cw, ch } = cropSize(look.aspect, w, h);
  const f = focusAt(look, t);
  const sx = Math.min(Math.max(0, f.x * w - cw / 2), w - cw);
  const sy = Math.min(Math.max(0, f.y * h - ch / 2), h - ch);
  return { sx, sy, cw, ch };
}

/** Caption groups: up to three words, broken at pauses and punctuation. */
export function captionGroups(words: Word[]) {
  const groups: Word[][] = [];
  let current: Word[] = [];
  for (const w of words) {
    const prev = current[current.length - 1];
    if (current.length >= 3 || (prev && (w.s - prev.e > 0.6 || /[.!?,]$/.test(prev.w)))) {
      groups.push(current);
      current = [];
    }
    current.push(w);
  }
  if (current.length) groups.push(current);
  return groups;
}

export function drawFrame(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  outW: number,
  outH: number,
  look: Look,
  t: number,
  logo: CanvasImageSource | null,
) {
  const { sx, sy, cw, ch } = cropRect(look, t, srcW, srcH);
  ctx.drawImage(source, sx, sy, cw, ch, 0, 0, outW, outH);
  const tpl = look.template ?? {
    font: "sans", textColor: "#ffffff", highlightColor: "#facc15", position: "bottom", uppercase: false, logoCorner: "top-right",
  };
  if (logo) {
    const size = Math.round(Math.min(outW, outH) * 0.14);
    const pad = Math.round(size * 0.3);
    const x = tpl.logoCorner.endsWith("left") ? pad : outW - size - pad;
    const y = tpl.logoCorner.startsWith("top") ? pad : outH - size - pad;
    ctx.drawImage(logo, x, y, size, size);
  }
  if (!look.captionsOn) return;
  const group = captionGroups(look.words).find((g) => t >= g[0]!.s - 0.05 && t <= g[g.length - 1]!.e + 0.25);
  if (!group) return;
  const fontSize = Math.round(Math.min(outW, outH) * (look.captionStyle === "minimal" ? 0.06 : 0.085));
  ctx.font = `800 ${fontSize}px ${FONT_FAMILIES[tpl.font] ?? FONT_FAMILIES.sans}`;
  ctx.textBaseline = "middle";
  const texts = group.map((w) => (tpl.uppercase ? w.w.toUpperCase() : w.w));
  const space = fontSize * 0.3;
  const widths = texts.map((s) => ctx.measureText(s).width);
  const total = widths.reduce((a, b) => a + b, 0) + space * (texts.length - 1);
  const y = tpl.position === "top" ? outH * 0.18 : tpl.position === "middle" ? outH * 0.5 : outH * 0.8;
  let x = (outW - total) / 2;
  ctx.lineJoin = "round";
  group.forEach((w, i) => {
    const spoken = t >= w.s && t <= w.e + 0.05;
    const said = t >= w.s;
    const lit =
      w.k || (look.captionStyle === "karaoke" ? said : look.captionStyle !== "minimal" && spoken);
    if (look.captionStyle === "box" && spoken) {
      ctx.fillStyle = tpl.highlightColor;
      const padX = fontSize * 0.15;
      ctx.fillRect(x - padX, y - fontSize * 0.6, widths[i]! + padX * 2, fontSize * 1.2);
    }
    const scale = look.captionStyle === "pop" && spoken ? 1.12 : 1;
    ctx.save();
    ctx.translate(x + widths[i]! / 2, y);
    ctx.scale(scale, scale);
    if (look.captionStyle !== "minimal") {
      ctx.lineWidth = fontSize * 0.16;
      ctx.strokeStyle = "rgba(0,0,0,0.85)";
      ctx.strokeText(texts[i]!, -widths[i]! / 2, 0);
    } else {
      ctx.shadowColor = "rgba(0,0,0,0.8)";
      ctx.shadowBlur = fontSize * 0.2;
    }
    ctx.fillStyle = look.captionStyle === "box" && spoken ? tpl.textColor : lit ? tpl.highlightColor : tpl.textColor;
    ctx.fillText(texts[i]!, -widths[i]! / 2, 0);
    ctx.restore();
    x += widths[i]! + space;
  });
}
