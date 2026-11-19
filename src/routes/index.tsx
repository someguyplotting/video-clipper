import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { StatusBadge } from "@/client/components/StatusBadge";
import { Button } from "@/client/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/client/components/ui/dialog";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { Progress } from "@/client/components/ui/progress";
import { formatTime } from "@/client/lib/format";
import { uploadVideo } from "@/client/lib/media";
import { deleteProject, getProjects, renameProject } from "@/serverFunctions/projects";

export const Route = createFileRoute("/")({
  loader: () => getProjects(),
  component: ProjectsPage,
});

type Project = Awaited<ReturnType<typeof getProjects>>[number];

function ProjectsPage() {
  const projects = Route.useLoaderData();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);
  const [pending, setPending] = useState(false);

  async function remove() {
    if (!deleting) return;
    setPending(true);
    try {
      await deleteProject({ data: { id: deleting.id } });
      setDeleting(null);
      await router.invalidate();
    } catch {
      toast.error("Couldn't delete the project.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AppShell nav={<AppNav />}>
      <PageHeader
        title="Projects"
        actions={
          <Button data-testid="new-project" onClick={() => setCreating(true)}>
            <Plus aria-hidden />
            New project
          </Button>
        }
      />
      {projects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Upload a video and it will appear here."
          action={<Button onClick={() => setCreating(true)}>Upload a video</Button>}
        />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {projects.map((project) => (
            <li key={project.id} data-testid="project-row" className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <Link
                  to="/projects/$id"
                  params={{ id: project.id }}
                  className="block truncate font-medium hover:underline"
                >
                  {project.title}
                </Link>
                <div className="text-sm text-muted-foreground">
                  {formatTime(project.durationSec)} · {new Date(`${project.createdAt}Z`).toLocaleDateString()}
                </div>
              </div>
              <StatusBadge status={project.status} />
              <Button variant="ghost" size="icon-sm" aria-label="Rename" data-testid="rename-project" onClick={() => setRenaming(project)}>
                <Pencil aria-hidden />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label="Delete" data-testid="delete-project" onClick={() => setDeleting(project)}>
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {creating ? <NewProjectDialog onClose={() => setCreating(false)} /> : null}
      {renaming ? (
        <RenameDialog
          project={renaming}
          onClose={() => setRenaming(null)}
          onSaved={async () => {
            setRenaming(null);
            await router.invalidate();
          }}
        />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title={`Delete “${deleting.title}”?`}
          confirmLabel="Delete"
          destructive
          pending={pending}
          onConfirm={remove}
          onClose={() => setDeleting(null)}
        >
          Its clips and exports are deleted too.
        </ConfirmDialog>
      ) : null}
    </AppShell>
  );
}

function NewProjectDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file || !title.trim()) return;
    setError(null);
    setProgress(0);
    try {
      const id = await uploadVideo(file, title.trim(), setProgress);
      await navigate({ to: "/projects/$id", params: { id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The upload failed.");
      setProgress(null);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && progress === null && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="project-file">Video</Label>
            <Input
              id="project-file"
              data-testid="project-file"
              type="file"
              accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
              onChange={(e) => {
                const picked = e.target.files?.[0] ?? null;
                setFile(picked);
                if (picked && !title) setTitle(picked.name.replace(/\.[^.]+$/, ""));
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-title">Title</Label>
            <Input id="project-title" data-testid="project-title-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          </div>
          {progress !== null ? <Progress value={Math.round(progress * 100)} aria-label="Upload progress" /> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="submit" data-testid="create-project" disabled={!file || !title.trim()} pending={progress !== null}>
              Upload
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RenameDialog({ project, onClose, onSaved }: { project: Project; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(project.title);
  const [pending, setPending] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      await renameProject({ data: { id: project.id, title } });
      onSaved();
    } catch {
      toast.error("Couldn't rename the project.");
      setPending(false);
    }
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Rename project</DialogTitle>
          </DialogHeader>
          <Input aria-label="Title" data-testid="rename-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          <DialogFooter>
            <Button type="submit" data-testid="rename-save" disabled={!title.trim()} pending={pending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
