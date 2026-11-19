import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { PageHeader } from "@/client/components/PageHeader";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/client/components/ui/dialog";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { Switch } from "@/client/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/client/components/ui/toggle-group";
import { FONT_FAMILIES } from "@/client/lib/render";
import { deleteTemplate, getTemplates, saveTemplate, setDefaultTemplate } from "@/serverFunctions/templates";

export const Route = createFileRoute("/templates")({
  loader: () => getTemplates(),
  component: TemplatesPage,
});

type Template = Awaited<ReturnType<typeof getTemplates>>[number];

const FONTS = [
  { value: "sans", label: "Sans" },
  { value: "anton", label: "Anton" },
  { value: "bebas", label: "Bebas Neue" },
  { value: "montserrat", label: "Montserrat" },
  { value: "serif", label: "Serif" },
] as const;
const POSITIONS = ["top", "middle", "bottom"] as const;
const CORNERS = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;
const label = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace("-", " ");

function TemplatesPage() {
  const list = Route.useLoaderData();
  const router = useRouter();
  const [editing, setEditing] = useState<Template | "new" | null>(null);
  const [deleting, setDeleting] = useState<Template | null>(null);

  return (
    <AppShell nav={<AppNav />}>
      <PageHeader
        title="Templates"
        description="The default template is applied to new clips."
        actions={
          <Button data-testid="new-template" onClick={() => setEditing("new")}>
            <Plus aria-hidden />
            New template
          </Button>
        }
      />
      <ul className="divide-y divide-border rounded-lg border border-border">
        {list.map((t) => (
          <li key={t.id} data-testid="template-row" data-id={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            {t.hasLogo ? (
              <img data-testid="template-logo-preview" src={`/api/templates/${t.id}/logo`} alt="" className="size-10 rounded border border-border object-contain" />
            ) : null}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{t.name}</span>
                {t.isDefault ? <Badge variant="soft" data-testid="default-badge">Default</Badge> : null}
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="rounded bg-muted px-1.5" style={{ fontFamily: FONT_FAMILIES[t.font], color: t.highlightColor }}>
                  {t.uppercase ? "AA" : "Aa"}
                </span>
                {FONTS.find((f) => f.value === t.font)?.label} · {label(t.position)}
              </div>
            </div>
            {!t.isDefault ? (
              <Button
                variant="outline"
                size="sm"
                data-testid="make-default"
                onClick={async () => {
                  await setDefaultTemplate({ data: { id: t.id } });
                  await router.invalidate();
                }}
              >
                Make default
              </Button>
            ) : null}
            <Button variant="outline" size="sm" onClick={() => setEditing(t)}>
              Edit
            </Button>
            {list.length > 1 ? (
              <Button variant="ghost" size="icon-sm" aria-label="Delete" onClick={() => setDeleting(t)}>
                <Trash2 aria-hidden />
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {editing ? (
        <TemplateDialog
          template={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await router.invalidate();
          }}
        />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title={`Delete “${deleting.name}”?`}
          confirmLabel="Delete"
          destructive
          onConfirm={async () => {
            await deleteTemplate({ data: { id: deleting.id } });
            setDeleting(null);
            await router.invalidate();
          }}
          onClose={() => setDeleting(null)}
        >
          Clips using it switch to your default template.
        </ConfirmDialog>
      ) : null}
    </AppShell>
  );
}

function TemplateDialog({ template, onClose, onSaved }: { template: Template | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(template?.name ?? "");
  const [font, setFont] = useState<string>(template?.font ?? "sans");
  const [textColor, setTextColor] = useState(template?.textColor ?? "#ffffff");
  const [highlightColor, setHighlightColor] = useState(template?.highlightColor ?? "#facc15");
  const [position, setPosition] = useState<string>(template?.position ?? "bottom");
  const [uppercase, setUppercase] = useState(template?.uppercase ?? false);
  const [logoCorner, setLogoCorner] = useState<string>(template?.logoCorner ?? "top-right");
  const [logo, setLogo] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const saved = await saveTemplate({
        data: {
          ...(template ? { id: template.id } : {}),
          name,
          font: font as (typeof FONTS)[number]["value"],
          textColor,
          highlightColor,
          position: position as (typeof POSITIONS)[number],
          uppercase,
          logoCorner: logoCorner as (typeof CORNERS)[number],
          removeLogo,
        },
      });
      if (!saved) throw new Error("Couldn't save the template.");
      if (logo) {
        const response = await fetch(`/api/templates/${saved.id}/logo`, { method: "PUT", headers: { "content-type": logo.type }, body: logo });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? "Couldn't upload the logo.");
        }
      }
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the template.");
      setPending(false);
    }
  }

  const choice = (value: string, set: (v: string) => void, items: readonly { value: string; label: string }[], prefix: string) => (
    <ToggleGroup variant="outline" className="flex-wrap" value={[value]} onValueChange={(v: string[]) => v[0] && set(v[0])}>
      {items.map((item) => (
        <ToggleGroupItem key={item.value} value={item.value} data-testid={`${prefix}-${item.value}`}>
          {item.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{template ? "Edit template" : "New template"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="template-name">Name</Label>
            <Input id="template-name" data-testid="template-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Font</Label>
            {choice(font, setFont, FONTS, "font")}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="text-color">Text colour</Label>
              <Input id="text-color" type="color" data-testid="template-text-color" value={textColor} onChange={(e) => setTextColor(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="highlight-color">Highlight colour</Label>
              <Input id="highlight-color" type="color" data-testid="template-highlight-color" value={highlightColor} onChange={(e) => setHighlightColor(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Caption position</Label>
            {choice(position, setPosition, POSITIONS.map((p) => ({ value: p, label: label(p) })), "position")}
          </div>
          <div className="flex items-center gap-2">
            <Switch id="uppercase" data-testid="template-uppercase" checked={uppercase} onCheckedChange={(on: boolean) => setUppercase(on)} />
            <Label htmlFor="uppercase">Uppercase</Label>
          </div>
          <div className="space-y-2">
            <Label htmlFor="template-logo">Logo (PNG, JPEG or WebP)</Label>
            <Input id="template-logo" data-testid="template-logo" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => { setLogo(e.target.files?.[0] ?? null); setRemoveLogo(false); }} />
            {template?.hasLogo && !logo ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setRemoveLogo(!removeLogo)}>
                {removeLogo ? "Keep logo" : "Remove logo"}
              </Button>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label>Logo corner</Label>
            {choice(logoCorner, setLogoCorner, CORNERS.map((c) => ({ value: c, label: label(c) })), "corner")}
          </div>
          <DialogFooter>
            <Button type="submit" data-testid="save-template" disabled={!name.trim()} pending={pending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
