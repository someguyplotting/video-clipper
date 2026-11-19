import { Link } from "@tanstack/react-router";

const LINK = "text-sm text-muted-foreground transition-colors hover:text-foreground";

export function AppNav() {
  return (
    <nav className="flex items-center gap-4">
      <Link to="/" className={LINK} activeOptions={{ exact: true }} activeProps={{ className: "text-foreground" }}>
        Projects
      </Link>
      <Link to="/templates" className={LINK} activeProps={{ className: "text-foreground" }}>
        Templates
      </Link>
    </nav>
  );
}
