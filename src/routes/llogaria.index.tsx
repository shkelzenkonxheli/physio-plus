import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/llogaria/")({
  head: () => ({
    meta: [
      { title: "Llogaria ime | PhysioPlus" },
      { name: "description", content: "Menaxho llogarinë dhe terminet e tua në PhysioPlus." },
      { property: "og:title", content: "Llogaria ime | PhysioPlus" },
      { property: "og:description", content: "Menaxho llogarinë dhe terminet e tua." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AccountPage,
});

function AccountPage() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/hyr", replace: true });
  }, [user, loading, navigate]);

  return (
    <SiteLayout>
      <div className="mx-auto max-w-2xl px-4 py-14">
        <h1 className="text-3xl font-bold">Llogaria ime</h1>
        <p className="mt-2 text-muted-foreground">{user?.email}</p>
        <div className="mt-8 space-y-3">
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link to="/llogaria/terminet">Terminet e mia</Link>
          </Button>
          <div>
            <Button variant="outline" onClick={() => void signOut()}>
              Dil nga llogaria
            </Button>
          </div>
        </div>
      </div>
    </SiteLayout>
  );
}