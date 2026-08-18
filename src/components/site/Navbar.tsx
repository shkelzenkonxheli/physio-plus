import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Menu, X, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

const links = [
  { to: "/fizioterapeutet", label: "Fizioterapeutët" },
  { to: "/sherbimet", label: "Shërbimet" },
  { to: "/regjionet", label: "Regjionet" },
  { to: "/si-funksionon", label: "Si funksionon" },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
  const { user, isAdmin, isPhysio } = useAuth();
  const panelTo = isAdmin ? "/admin" : isPhysio ? "/paneli" : "/llogaria";

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/85 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2 font-bold text-lg">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-hero-gradient text-primary-foreground">
            <Activity className="h-5 w-5" />
          </span>
          Physio<span className="-ml-1.5 text-primary">Plus</span>
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              activeProps={{ className: "text-foreground bg-muted" }}
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-2 md:flex">
          {user ? (
            <Button asChild>
              <Link to={panelTo}>Paneli</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost">
                <Link to="/hyr">Kyçu</Link>
              </Button>
              <Button asChild>
                <Link to="/regjistrohu">Regjistrohu</Link>
              </Button>
            </>
          )}
        </div>

        <button
          className="md:hidden rounded-lg p-2 hover:bg-muted"
          onClick={() => setOpen((v) => !v)}
          aria-label="Menyja"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>

      {open ? (
        <div className="border-t border-border bg-background px-4 py-3 md:hidden">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2.5 text-sm font-medium"
            >
              {l.label}
            </Link>
          ))}
          <div className="mt-2 flex flex-col gap-2">
            {user ? (
              <Button asChild onClick={() => setOpen(false)}>
                <Link to={panelTo}>Paneli</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="outline" onClick={() => setOpen(false)}>
                  <Link to="/hyr">Kyçu</Link>
                </Button>
                <Button asChild onClick={() => setOpen(false)}>
                  <Link to="/regjistrohu">Regjistrohu</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </header>
  );
}