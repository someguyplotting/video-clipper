import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ChevronLeft, Download, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState } from "@/client/components/EmptyState";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { Missing } from "@/client/components/Missing";
import { PageHeader } from "@/client/components/PageHeader";
import { ExportBadge, StatusBadge } from "@/client/components/StatusBadge";
import { Alert, AlertDescription, AlertTitle } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { Progress } from "@/client/components/ui/progress";
import { Textarea } from "@/client/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/client/components/ui/toggle-group";
import { formatTime, parseTime } from "@/client/lib/format";
import { extractAudio } from "@/client/lib/media";
import type { LengthBand } from "@/lib/highlights";
import { getProject, retryClipping, startClipping } from "@/serverFunctions/projects";

export const Route = createFileRoute("/projects/$id")({
  loader: ({ params }) => getProject({ data: { id: params.id } }),
  component: ProjectPage,
});

const BANDS: { value: LengthBand; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "short", label: "Under 30s" },
  { value: "medium", label: "30–60s" },
  { value: "long", label: "60–90s" },
];

function ProjectPage() {
  const project = Route.useLoaderData();
  const router = useRouter();
  const processing = project?.status === "processing";
  useEffect(() => {
    if (!processing) return;
    const timer = setInterval(() => void router.invalidate(), 2000);
    return () => clearInterval(timer);
  }, [processing, router]);
  if (!project) return <Missing what="Project" />;

  return (
    <AppShell nav={<AppNav />}>
      <PageHeader
        backLink={
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="size-4" aria-hidden />
            Projects
          </Link>
        }
        title={project.title}
        description={
          <span className="inline-flex items-center gap-2">
            {formatTime(project.durationSec)}
            <StatusBadge status={project.status} testId="project-status" />
          </span>
        }
      />
      <video
        data-testid="source-video"
        src={`/api/projects/${project.id}/source`}
        controls
        preload="metadata"
        className="aspect-video w-full rounded-lg border border-border bg-muted"
      />
      {project.status === "failed" ? <FailedNotice id={project.id} error={project.error} /> : null}
      <ClippingForm project={project} />
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Clips</h2>
        {project.clips.length === 0 ? (
          <EmptyState
            variant="dashed"
            size="sm"
            title={processing ? "Finding clips…" : "No clips yet"}
            description={processing ? undefined : "Find clips and they will appear here, best first."}
          />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {project.clips.map((clip) => (
              <li key={clip.id} data-testid="clip-row" className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span
                  data-testid="clip-score"
                  className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 font-semibold text-primary"
                  title="Highlight score"
                >
                  {clip.score}
                </span>
                <div className="min-w-0 flex-1">
                  <div data-testid="clip-title" className="truncate font-medium">
                    {clip.title}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {formatTime(clip.start)}–{formatTime(clip.end)} · {Math.round(clip.end - clip.start)}s · {clip.aspect}
                  </div>
                  {clip.reason ? <div className="text-sm text-muted-foreground">{clip.reason}</div> : null}
                </div>
                <ExportBadge status={clip.exportStatus} size={clip.exportSize} />
                {clip.exportStatus !== "none" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid="download-clip"
                    render={<a href={`/api/clips/${clip.id}/export`} download />}
                  >
                    <Download aria-hidden />
                    Download
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  data-testid="edit-clip"
                  render={<Link to="/projects/$id/clips/$clipId" params={{ id: project.id, clipId: clip.id }} />}
                >
                  Edit
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}

function FailedNotice({ id, error }: { id: string; error: string | null }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <Alert variant="destructive" data-testid="project-error">
      <AlertTitle>Clipping failed</AlertTitle>
      <AlertDescription className="space-y-2">
        <p>{error}</p>
        <Button
          size="sm"
          variant="outline"
          data-testid="retry-clipping"
          pending={pending}
          onClick={async () => {
            setPending(true);
            await retryClipping({ data: { id } });
            await router.invalidate();
            setPending(false);
          }}
        >
          Retry
        </Button>
      </AlertDescription>
    </Alert>
  );
}

type Project = NonNullable<Awaited<ReturnType<typeof getProject>>>;

function ClippingForm({ project }: { project: Project }) {
  const router = useRouter();
  const [start, setStart] = useState(formatTime(project.scanStart ?? 0));
  const [end, setEnd] = useState(formatTime(project.scanEnd ?? project.durationSec));
  const [band, setBand] = useState<LengthBand>((project.lengthBand as LengthBand) ?? "auto");
  const [prompt, setPrompt] = useState(project.prompt ?? "");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = progress !== null || project.status === "processing";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const from = parseTime(start);
    const to = Math.min(parseTime(end), project.durationSec);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to - from < 3) {
      setError("Choose a start and end at least a few seconds apart, like 0:00 and 12:30.");
      return;
    }
    setError(null);
    setProgress(0);
    try {
      const audio = await extractAudio(project.id, from, to, setProgress);
      await startClipping({
        data: { id: project.id, scanStart: from, scanEnd: to, lengthBand: band, prompt, audioChunks: audio.chunks, chunkSec: audio.chunkSec },
      });
      await router.invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start clipping.");
    } finally {
      setProgress(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{project.clips.length ? "Find clips again" : "Find clips"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="scan-start">From</Label>
              <Input id="scan-start" data-testid="scan-start" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="scan-end">To</Label>
              <Input id="scan-end" data-testid="scan-end" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Clip length</Label>
            <ToggleGroup
              variant="outline"
              value={[band]}
              onValueChange={(value: string[]) => value[0] && setBand(value[0] as LengthBand)}
              className="flex-wrap"
            >
              {BANDS.map((b) => (
                <ToggleGroupItem key={b.value} value={b.value} data-testid={`band-${b.value}`}>
                  {b.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="space-y-2">
            <Label htmlFor="clip-prompt">Moments to look for (optional)</Label>
            <Textarea
              id="clip-prompt"
              data-testid="clip-prompt"
              value={prompt}
              maxLength={500}
              placeholder="e.g. practical advice for new managers"
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>
          {progress !== null ? <Progress value={Math.round(progress * 100)} aria-label="Preparing audio" /> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex items-center gap-3">
            <Button type="submit" data-testid="find-clips" pending={busy}>
              <Sparkles aria-hidden />
              Find clips
            </Button>
            {project.clips.length ? (
              <span className="text-sm text-muted-foreground">Replaces the current clips.</span>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
