import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { ChevronLeft, Crosshair, Download, Hand, Pause, Play, Star, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { Missing } from "@/client/components/Missing";
import { PageHeader } from "@/client/components/PageHeader";
import { ExportBadge } from "@/client/components/StatusBadge";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { Progress } from "@/client/components/ui/progress";
import { Switch } from "@/client/components/ui/switch";
import { Toggle } from "@/client/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/client/components/ui/toggle-group";
import { formatTime } from "@/client/lib/format";
import { exportClip, loadFont, loadImage, sampleFrames } from "@/client/lib/media";
import { cropRect, drawFrame, outputSize, type Aspect, type CaptionStyle, type Look } from "@/client/lib/render";
import { wordsBetween, type Word } from "@/lib/highlights";
import { deleteClip, detectFocus, getClip, updateClip } from "@/serverFunctions/clips";

export const Route = createFileRoute("/projects/$id_/clips/$clipId")({
  loader: ({ params }) => getClip({ data: { id: params.clipId } }),
  component: ClipPage,
});

const ASPECTS: Aspect[] = ["9:16", "1:1", "16:9"];
const STYLES: { value: CaptionStyle; label: string }[] = [
  { value: "pop", label: "Pop" },
  { value: "box", label: "Box" },
  { value: "karaoke", label: "Karaoke" },
  { value: "minimal", label: "Minimal" },
];

type Loaded = NonNullable<Awaited<ReturnType<typeof getClip>>>;

function ClipPage() {
  const data = Route.useLoaderData();
  if (!data) return <Missing what="Clip" />;
  return <Editor key={data.clip.id} data={data} />;
}

function Editor({ data }: { data: Loaded }) {
  const router = useRouter();
  const navigate = useNavigate();
  const { clip, project, transcript, templates } = data;
  const [title, setTitle] = useState(clip.title);
  const [startText, setStartText] = useState(String(clip.startSec));
  const [endText, setEndText] = useState(String(clip.endSec));
  const [aspect, setAspect] = useState<Aspect>(clip.aspect as Aspect);
  const [focusMode, setFocusMode] = useState(clip.focusMode as "auto" | "manual");
  const [focus, setFocus] = useState({ x: clip.focusX, y: clip.focusY });
  const [keyframes, setKeyframes] = useState(clip.keyframes);
  const [captionsOn, setCaptionsOn] = useState(clip.captionsOn);
  const [style, setStyle] = useState(clip.captionStyle as CaptionStyle);
  const [templateId, setTemplateId] = useState(clip.templateId ?? templates[0]?.id ?? null);
  const [edits, setEdits] = useState<Word[]>(clip.words);
  const [selected, setSelected] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<"clean" | "dirty" | "saving" | "saved">("clean");
  const [exportStatus, setExportStatus] = useState(clip.exportStatus);
  const [exportSize, setExportSize] = useState(clip.exportSize);
  const [exporting, setExporting] = useState<number | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const dirty = () => setSaveState("dirty");

  const start = Number(startText);
  const end = Number(endText);
  const trimValid = Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end <= project.durationSec + 0.05 && end - start >= 1;
  // The words follow the trim; edits carry over by start time.
  const words = useMemo(() => {
    if (!trimValid) return edits;
    const byStart = new Map(edits.map((w) => [w.s, w]));
    const base = transcript.length ? wordsBetween(transcript, start, end) : edits;
    return base.map((w) => byStart.get(w.s) ?? w);
  }, [edits, transcript, start, end, trimValid]);
  const template = templates.find((t) => t.id === templateId) ?? null;
  const look: Look = { aspect, focusMode, focusX: focus.x, focusY: focus.y, keyframes, captionsOn, captionStyle: style, words, template };

  function editWord(index: number, change: Partial<Word>) {
    const target = words[index]!;
    const next = { ...target, ...change };
    setEdits((current) => {
      const others = current.filter((w) => w.s !== target.s);
      return [...others, next].sort((a, b) => a.s - b.s);
    });
    dirty();
  }

  async function save() {
    if (!trimValid) {
      toast.error(`Keep the clip between 0 and ${project.durationSec.toFixed(1)} seconds, at least a second long.`);
      return;
    }
    setSaveState("saving");
    try {
      const result = await updateClip({
        data: {
          id: clip.id, title, startSec: start, endSec: end, aspect, focusMode, focusX: focus.x, focusY: focus.y,
          captionsOn, captionStyle: style, templateId, words,
        },
      });
      if (!result) throw new Error();
      setExportStatus(result.exportStatus);
      setEdits(result.words);
      setSaveState("saved");
    } catch {
      setSaveState("dirty");
      toast.error("Couldn't save the clip.");
    }
  }

  async function autoReframe() {
    setDetecting(true);
    try {
      const frames = await sampleFrames(project.id, start, end);
      const result = await detectFocus({ data: { id: clip.id, frames } });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setKeyframes(result.keyframes);
      setFocusMode("auto");
      if (exportStatus === "ready") setExportStatus("outdated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't find the subject.");
    } finally {
      setDetecting(false);
    }
  }

  async function runExport() {
    if (saveState === "dirty") await save();
    setExporting(0);
    try {
      const size = await exportClip(
        { id: clip.id, projectId: project.id, start, end },
        look,
        template?.hasLogo ? `/api/templates/${template.id}/logo` : null,
        setExporting,
      );
      setExportStatus("ready");
      setExportSize(size);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The export failed.");
    } finally {
      setExporting(null);
    }
  }

  return (
    <AppShell nav={<AppNav />}>
      <PageHeader
        backLink={
          <Link to="/projects/$id" params={{ id: project.id }} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="size-4" aria-hidden />
            {project.title}
          </Link>
        }
        title={title || "Clip"}
        description={`${formatTime(start)}–${formatTime(end)} · score ${clip.score}`}
        actions={
          <>
            <span data-testid="save-state" className="text-sm text-muted-foreground">
              {saveState === "saved" ? "Saved" : saveState === "dirty" ? "Unsaved changes" : ""}
            </span>
            <Button variant="outline" size="icon-sm" aria-label="Delete clip" data-testid="delete-clip" onClick={() => setDeleting(true)}>
              <Trash2 aria-hidden />
            </Button>
            <Button data-testid="save-clip" onClick={save} pending={saveState === "saving"} disabled={saveState === "clean" || saveState === "saved"}>
              Save
            </Button>
          </>
        }
      />
      <Preview
        projectId={project.id}
        start={trimValid ? start : clip.startSec}
        end={trimValid ? end : clip.endSec}
        look={look}
        logoUrl={template?.hasLogo ? `/api/templates/${template.id}/logo` : null}
        onDragFocus={(next) => {
          setFocus(next);
          setFocusMode("manual");
          dirty();
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle>Clip</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="clip-title">Title</Label>
            <Input id="clip-title" data-testid="clip-title-input" value={title} maxLength={200} onChange={(e) => { setTitle(e.target.value); dirty(); }} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="clip-start">Start (seconds)</Label>
              <Input id="clip-start" data-testid="clip-start" inputMode="decimal" value={startText} aria-invalid={!trimValid} onChange={(e) => { setStartText(e.target.value); dirty(); }} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="clip-end">End (seconds)</Label>
              <Input id="clip-end" data-testid="clip-end" inputMode="decimal" value={endText} aria-invalid={!trimValid} onChange={(e) => { setEndText(e.target.value); dirty(); }} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Aspect ratio</Label>
            <ToggleGroup variant="outline" value={[aspect]} onValueChange={(v: string[]) => { if (v[0]) { setAspect(v[0] as Aspect); dirty(); } }}>
              {ASPECTS.map((a) => (
                <ToggleGroupItem key={a} value={a} data-testid={`aspect-${a}`}>{a}</ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="space-y-2">
            <Label>Framing</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" data-testid="reframe-auto" pending={detecting} onClick={autoReframe}>
                <Crosshair aria-hidden />
                Follow the speaker
              </Button>
              <Button variant="outline" size="sm" data-testid="reframe-manual" onClick={() => { setFocusMode("manual"); dirty(); }}>
                <Hand aria-hidden />
                Place by hand
              </Button>
              <span data-testid="reframe-status" className="text-sm text-muted-foreground">
                {focusMode === "auto" && keyframes.length ? `Following the speaker · ${keyframes.length} points` : "Manual · drag the preview"}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Captions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Switch id="captions-on" data-testid="captions-toggle" checked={captionsOn} onCheckedChange={(on: boolean) => { setCaptionsOn(on); dirty(); }} />
            <Label htmlFor="captions-on">Show captions</Label>
          </div>
          <div className="space-y-2">
            <Label>Style</Label>
            <ToggleGroup variant="outline" value={[style]} onValueChange={(v: string[]) => { if (v[0]) { setStyle(v[0] as CaptionStyle); dirty(); } }}>
              {STYLES.map((s) => (
                <ToggleGroupItem key={s.value} value={s.value} data-testid={`style-${s.value}`}>{s.label}</ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="space-y-2">
            <Label>Template</Label>
            <ToggleGroup variant="outline" className="flex-wrap" value={templateId ? [templateId] : []} onValueChange={(v: string[]) => { if (v[0]) { setTemplateId(v[0]); dirty(); } }}>
              {templates.map((t) => (
                <ToggleGroupItem key={t.id} value={t.id} data-testid="template-option">{t.name}</ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="space-y-2">
            <Label>Words</Label>
            {words.length === 0 ? (
              <p className="text-sm text-muted-foreground">No words were heard in this clip.</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {words.map((w, i) => (
                  <Toggle
                    key={w.s}
                    size="sm"
                    variant="outline"
                    data-testid="caption-word"
                    pressed={selected === i}
                    onPressedChange={() => setSelected(selected === i ? null : i)}
                    className={w.k ? "text-primary" : undefined}
                  >
                    {w.w}
                  </Toggle>
                ))}
              </div>
            )}
            {selected !== null && words[selected] ? (
              <div className="flex items-center gap-2">
                <Input aria-label="Word" data-testid="word-input" className="max-w-56" value={words[selected]!.w} maxLength={60} onChange={(e) => editWord(selected, { w: e.target.value })} />
                <Toggle variant="outline" size="sm" data-testid="word-keyword" pressed={!!words[selected]!.k} onPressedChange={(k: boolean) => editWord(selected, { k })}>
                  <Star aria-hidden />
                  Highlight
                </Toggle>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Export</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button data-testid="export-clip" pending={exporting !== null} onClick={runExport}>
              Export MP4
            </Button>
            <ExportBadge status={exportStatus} size={exportSize} />
            {exportStatus !== "none" ? (
              <Button variant="outline" data-testid="download-clip" render={<a href={`/api/clips/${clip.id}/export`} download />}>
                <Download aria-hidden />
                Download
              </Button>
            ) : null}
          </div>
          {exporting !== null ? <Progress value={Math.round(exporting * 100)} aria-label="Export progress" /> : null}
        </CardContent>
      </Card>

      {deleting ? (
        <ConfirmDialog
          title="Delete this clip?"
          confirmLabel="Delete"
          destructive
          onConfirm={async () => {
            await deleteClip({ data: { id: clip.id } });
            await router.invalidate();
            await navigate({ to: "/projects/$id", params: { id: project.id } });
          }}
          onClose={() => setDeleting(false)}
        />
      ) : null}
    </AppShell>
  );
}

function Preview({
  projectId, start, end, look, logoUrl, onDragFocus,
}: {
  projectId: string;
  start: number;
  end: number;
  look: Look;
  logoUrl: string | null;
  onDragFocus: (focus: { x: number; y: number }) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lookRef = useRef(look);
  lookRef.current = look;
  const logoRef = useRef<HTMLImageElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(start);
  const drag = useRef<{ x: number; y: number; fx: number; fy: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    logoRef.current = null;
    if (logoUrl) void loadImage(logoUrl).then((img) => { if (!cancelled) logoRef.current = img; });
    return () => { cancelled = true; };
  }, [logoUrl]);
  useEffect(() => {
    if (look.template) void loadFont(look.template.font);
  }, [look.template?.font]);

  useEffect(() => {
    const video = videoRef.current;
    if (video && (video.currentTime < start || video.currentTime > end)) video.currentTime = start;
  }, [start, end]);

  useEffect(() => {
    let frame = 0;
    const draw = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.videoWidth) {
        if (video.currentTime >= end) {
          video.pause();
          video.currentTime = start;
        }
        const { width, height } = outputSize(lookRef.current.aspect, video.videoWidth, video.videoHeight);
        const scale = 480 / Math.max(width, height);
        const w = Math.round(width * scale);
        const h = Math.round(height * scale);
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        const ctx = canvas.getContext("2d")!;
        drawFrame(ctx, video, video.videoWidth, video.videoHeight, w, h, lookRef.current, video.currentTime, logoRef.current);
        setTime(video.currentTime);
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [start, end]);

  function toggle() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  }

  function pointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const rect = cropRect(lookRef.current, video.currentTime, video.videoWidth, video.videoHeight);
    const fx = (rect.sx + rect.cw / 2) / video.videoWidth;
    const fy = (rect.sy + rect.ch / 2) / video.videoHeight;
    drag.current = { x: e.clientX, y: e.clientY, fx, fy };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function pointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const video = videoRef.current;
    const start = drag.current;
    if (!video || !start) return;
    const box = e.currentTarget.getBoundingClientRect();
    const rect = cropRect(lookRef.current, video.currentTime, video.videoWidth, video.videoHeight);
    // Dragging moves the picture under the frame, like panning a photo.
    const dx = ((e.clientX - start.x) / box.width) * (rect.cw / video.videoWidth);
    const dy = ((e.clientY - start.y) / box.height) * (rect.ch / video.videoHeight);
    const clamp = (n: number) => Math.max(0, Math.min(1, n));
    onDragFocus({ x: clamp(start.fx - dx), y: clamp(start.fy - dy) });
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-center rounded-lg border border-border bg-muted p-2">
        <canvas
          data-testid="preview-canvas"
          ref={canvasRef}
          width={270}
          height={480}
          className="h-auto max-h-[60vh] max-w-full cursor-grab touch-none rounded active:cursor-grabbing"
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={() => { drag.current = null; }}
          onPointerCancel={() => { drag.current = null; }}
        />
      </div>
      <video
        ref={videoRef}
        src={`/api/projects/${projectId}/source`}
        preload="auto"
        playsInline
        className="hidden"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onLoadedMetadata={(e) => { e.currentTarget.currentTime = start; }}
      />
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon-sm" aria-label={playing ? "Pause" : "Play"} onClick={toggle}>
          {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
        </Button>
        <input
          type="range"
          aria-label="Position"
          className="flex-1 accent-primary"
          min={start}
          max={end}
          step={0.05}
          value={Math.min(end, Math.max(start, time))}
          onChange={(e) => { if (videoRef.current) videoRef.current.currentTime = Number(e.target.value); }}
        />
        <span className="w-24 text-right text-sm text-muted-foreground tabular-nums">
          {formatTime(time - start)} / {formatTime(end - start)}
        </span>
      </div>
    </div>
  );
}
