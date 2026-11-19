import { Badge } from "@/client/components/ui/badge";
import { formatSize, STATUS_LABEL } from "@/client/lib/format";

const VARIANT = {
  uploading: "secondary",
  uploaded: "secondary",
  processing: "info",
  ready: "success",
  failed: "destructive",
} as const;

export function StatusBadge({ status, testId }: { status: string; testId?: string }) {
  return (
    <Badge variant={VARIANT[status as keyof typeof VARIANT] ?? "secondary"} data-testid={testId}>
      {STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

export function ExportBadge({ status, size }: { status: string; size: number | null }) {
  if (status === "none") return null;
  return (
    <Badge data-testid="export-status" variant={status === "ready" ? "success" : "warning"}>
      {status === "ready" ? `Exported${size ? ` · ${formatSize(size)}` : ""}` : "Outdated"}
    </Badge>
  );
}

