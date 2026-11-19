import { Link } from "@tanstack/react-router";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { Button } from "@/client/components/ui/button";

export function Missing({ what }: { what: string }) {
  return (
    <AppShell nav={<AppNav />}>
      <PageHeader title={`${what} not found`} />
      <div data-testid="not-found">
        <EmptyState
          kind="filtered"
          title={`This ${what.toLowerCase()} doesn't exist or isn't yours.`}
          action={<Button render={<Link to="/" />}>Back to projects</Button>}
        />
      </div>
    </AppShell>
  );
}
