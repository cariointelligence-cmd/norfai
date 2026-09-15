import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Menu } from "lucide-react";
import { useEffect, useState } from "react";
import { RedirectToSignIn, UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getAdminState } from "@/lib/norr/actions";
import { Drawer } from "@/components/drawer";
import { NorfMark } from "@/components/marketing";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminShell,
});

const NAV = [
  { to: "/admin", label: "Overview" },
  { to: "/admin/search", label: "Search health" },
  { to: "/admin/activity", label: "Activity" },
  { to: "/admin/visitors", label: "Visitors" },
  { to: "/admin/security", label: "Security" },
  { to: "/admin/data-network", label: "Data network" },
  { to: "/admin/seo", label: "SEO and GEO" },
  { to: "/admin/blog", label: "News" },
  { to: "/admin/support", label: "Support" },
  { to: "/admin/mail", label: "Mail" },
  { to: "/admin/team", label: "Users" },
] as const;

function AdminShell() {
  const { user, isPending } = useCurrentUserState();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const q = useQuery({ queryKey: ["admin-state"], queryFn: () => getAdminState(), enabled: Boolean(user) });
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); }, [pathname]);
  if (isPending) return <p className="p-8 text-sm text-mute">Loading…</p>;
  if (!user) return <RedirectToSignIn to="/login" />;
  if (q.data && !q.data.isAdmin) {
    return (
      <div className="p-8 text-sm text-mute">
        Admin access is limited to CARIO and TAJU owners, then to people they invite.
      </div>
    );
  }
  const links = NAV.map((n) => (
    <Link
      key={n.to}
      to={n.to}
      onClick={() => setOpen(false)}
      className={cn("tap flex items-center px-2 text-sm", pathname === n.to ? "text-ink" : "text-mute hover:text-ink")}
    >
      {n.label}
    </Link>
  ));
  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-canvas/90 px-3 py-2 backdrop-blur sm:px-4">
        <div className="flex items-center gap-2">
          <button type="button" className="tap inline-flex items-center justify-center lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}>
            <Menu className="size-5" />
          </button>
          <NorfMark className="h-8 w-auto max-w-[120px] object-contain" />
          <span className="kicker hidden sm:inline">Admin</span>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/overview" className="tap inline-flex items-center text-sm text-mute hover:text-ink">Workspace</Link>
          <UserButton />
        </div>
      </header>
      <div className="flex">
        <nav className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-48 shrink-0 overflow-y-auto border-r border-line p-3 lg:block">
          {links}
        </nav>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8">
          <Outlet />
        </main>
      </div>
      <Drawer open={open} onClose={() => setOpen(false)} side="left" title="Admin">
        {links}
      </Drawer>
    </div>
  );
}
