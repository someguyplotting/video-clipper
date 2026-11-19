// Pure rules shared by the clipping job and the editor.

export type LengthBand = "auto" | "short" | "medium" | "long";
export const LENGTH_BANDS: LengthBand[] = ["auto", "short", "medium", "long"];
export const BAND_LIMITS: Record<LengthBand, { min: number; max: number }> = {
  short: { min: 3, max: 30 },
  medium: { min: 30, max: 60 },
  long: { min: 60, max: 90 },
  auto: { min: 5, max: 90 },
};

export interface Word {
  w: string;
  s: number;
  e: number;
  k?: boolean;
}

export interface Highlight {
  title: string;
  start: number;
  end: number;
  score: number;
  reason: string;
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * The model's proposals made safe: clamped to the scanned range, snapped to
 * word edges, dropped when outside the length band, best first.
 */
export function selectHighlights(
  proposals: unknown,
  range: { start: number; end: number },
  band: LengthBand,
  words: Word[],
  limit = 12,
): Highlight[] {
  const { min, max } = BAND_LIMITS[band];
  const list = Array.isArray(proposals) ? proposals : [];
  const picked: Highlight[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    let start = Number(raw.start);
    let end = Number(raw.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (start >= range.end || end <= range.start) continue;
    start = Math.max(start, range.start);
    end = Math.min(end, range.end);
    const first = words.find((w) => w.e > start && w.s >= start - 0.6);
    if (first && first.s < end) start = Math.max(range.start, Math.min(start, first.s));
    const last = [...words].reverse().find((w) => w.s < end && w.e <= end + 0.6);
    if (last && last.e > start) end = Math.min(range.end, Math.max(end, last.e));
    const length = end - start;
    if (length < min || length > max) continue;
    const title = String(raw.title ?? "").trim().slice(0, 120) || "Untitled clip";
    const score = Math.max(0, Math.min(100, Math.round(Number(raw.score) || 0)));
    const reason = String(raw.reason ?? "").trim().slice(0, 300);
    picked.push({ title, start: round(start), end: round(end), score, reason });
  }
  picked.sort((a, b) => b.score - a.score || a.start - b.start);
  return picked.slice(0, limit);
}

/** The transcript words that fall inside a clip. */
export function wordsBetween(words: Word[], start: number, end: number): Word[] {
  return words.filter((w) => w.s >= start - 0.05 && w.e <= end + 0.05);
}

/** Trimmed bounds kept inside the source and at least one second long. */
export function validTrim(start: number, end: number, duration: number) {
  return start >= 0 && end <= duration + 0.05 && end - start >= 1;
}
