import { Link, Navigate, Outlet, useRouterState } from "@tanstack/react-router";
import { RedirectToSignIn, UserButton } from "@/lib/auth/gates";
import { NorfAssistant } from "@/components/norf-assistant";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { cn } from "@/lib/utils";
import {
  History,
  Activity,
  Bell,
  Building2,
  ClipboardList,
  Database,
  FileDown,
  GitMerge,
  ListFilter,
  LifeBuoy,
  Lock,
  Menu,
  Plug,
  Radar,
  Search,
  Settings,
  Shield,
  ShieldBan,
  SlidersHorizontal,
  Users,
  UsersRound,
  Waypoints,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getBootstrap, findWorkspace } from "@/lib/norr/actions";
import { Drawer } from "@/components/drawer";
import { LangSwitch, NorfMark } from "@/components/marketing";
import { ProgressRailPulse } from "@/components/progress-rail";
import { formatSearchQuota, isUnlimitedQuota } from "@/lib/norr/platform";
import { useEffect, useState, type ComponentType } from "react";
import { useI18n } from "@/lib/i18n";
import { NAV_GROUPS, TAB_ITEMS, type AppMsg } from "@/lib/app-copy";

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  "/overview": Radar,
  "/search/new": Search,
  "/search": History,
  "/companies": Building2,
  "/sweden": Building2,
  "/norway": Building2,
  "/people": Users,
  "/changes": Bell,
  "/accounts": ShieldBan,
  "/team": UsersRound,
  "/integrations": Plug,
  "/profiles": ClipboardList,
  "/schedules": Activity,
  "/lists": ListFilter,
  "/review": GitMerge,
  "/duplicates": GitMerge,
  "/sources": Waypoints,
  "/jobs": Database,
  "/exports": FileDown,
  "/quality": SlidersHorizontal,
  "/audit": Shield,
  "/security": Lock,
  "/billing": SlidersHorizontal,
  "/tickets": LifeBuoy,
  "/settings": Settings,
  "/privacy": Lock,
};

function SessionSplash({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-dvh bg-canvas">
      <aside className="hidden w-56 border-r border-line bg-panel p-4 lg:block">
        <NorfMark className="h-7 w-auto max-w-[108px] object-contain object-left" />
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="border-b border-line px-4 py-3 kicker">{title}</header>
        <main className="space-y-4 px-4 py-6 text-sm text-mute">
          <ProgressRailPulse label={title} />
          <p>{body}</p>
        </main>
      </div>
    </div>
  );
}

export function AppShell() {
  const { user, isPending } = useCurrentUserState();
  const { ta } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [sessionWaited, setSessionWaited] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [findQ, setFindQ] = useState("");
  const find = useQuery({
    queryKey: ["workspace-find", findQ],
    queryFn: () => findWorkspace({ data: { q: findQ } }),
    enabled: findQ.trim().length >= 2,
    staleTime: 8_000,
  });
  const boot = useQuery({
    queryKey: ["bootstrap"],
    queryFn: async () => {
      const r = await fetch("/api/workspace/boot", { credentials: "include", headers: { accept: "application/json" } });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || "boot failed");
      return j;
    },
    enabled: Boolean(user),
    retry: 1,
    staleTime: 8_000,
  });

  useEffect(() => {
    const t = window.setTimeout(() => setSessionWaited(true), 6000);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!user) return;
    const n = boot.data?.counts.jobsRunning ?? 0;
    if (n <= 0) return;
    const t = window.setInterval(() => {
      void boot.refetch();
    }, 4000);
    return () => window.clearInterval(t);
  }, [user, boot.data?.counts.jobsRunning, boot]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  if (isPending && !sessionWaited) {
    return <SessionSplash title={ta("checkingSession")} body={ta("openingWorkspace")} />;
  }
  if (!user) {
    if (isPending) {
      return (
        <div className="norr-grid flex min-h-dvh items-center justify-center bg-canvas px-4">
          <div className="panel max-w-sm p-6 text-center">
            <NorfMark className="mx-auto h-8 w-auto max-w-[140px] object-contain" />
            <p className="mt-4 text-sm text-mute">{ta("sessionSlow")}</p>
            <Link to="/login" className="cta mt-4">
              {ta("signIn")}
            </Link>
          </div>
        </div>
      );
    }
    return (
      <div className="norr-grid flex min-h-dvh items-center justify-center bg-canvas px-4">
        <RedirectToSignIn to="/login" />
        <div className="panel max-w-sm p-6 text-center">
          <div className="mb-2 font-medium">Norf</div>
          <p className="text-sm text-mute">{ta("openingWorkspace")}</p>
        </div>
      </div>
    );
  }
  const onboarded = Boolean(boot.data?.workspace.onboarded_at);
  if (boot.data?.workspace.id && boot.data.workspace.id !== "pending" && !onboarded && pathname !== "/onboarding") {
    return <Navigate to="/onboarding" />;
  }

  const limit = boot.data?.searchesLimit ?? 50;
  const used = boot.data?.searchesUsed ?? 0;
  const quotaLabel = boot.data?.isAdmin || isUnlimitedQuota(limit)
    ? ta("unlimited")
    : `${used}/${formatSearchQuota(limit)}`;

  function navActive(to: string) {
    if (to === "/overview") return pathname === "/overview";
    if (to === "/search/new") return pathname.startsWith("/search/new");
    if (to === "/search") return pathname === "/search" || pathname === "/search/" || /^\/search\/[^/]+$/.test(pathname);
    return pathname.startsWith(to);
  }

  function navLink(item: { to: string; key: AppMsg }) {
    const active = navActive(item.to);
    const Icon = ICONS[item.to] ?? Radar;
    return (
      <Link
        key={item.to}
        to={item.to}
        onClick={() => setMenuOpen(false)}
        className={cn(
          "tap flex items-center gap-2 rounded-[var(--radius-xs)] px-2 text-sm",
          active ? "bg-panel-2 text-ink" : "text-mute hover:bg-panel-2/70 hover:text-ink",
        )}
      >
        <Icon className="size-4 opacity-70" />
        {ta(item.key)}
      </Link>
    );
  }

  const navLinks = (
    <nav className="grid gap-3">
      {NAV_GROUPS.map((g) => (
        <div key={g.key}>
          <div className="px-2 pb-1 text-[10px] uppercase tracking-[0.14em] text-faint">{ta(g.key)}</div>
          <div className="grid gap-0.5">{g.items.map(navLink)}</div>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-dvh bg-canvas">
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-line bg-panel lg:flex">
        <div className="flex items-center gap-2 border-b border-line px-4 py-4">
          <NorfMark className="h-7 w-auto max-w-[108px] object-contain object-left" />
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-3">{navLinks}</div>
        <div className="border-t border-line p-3">
          <div className="mb-2 truncate px-1 text-xs text-faint">{user.primaryEmail ?? user.displayName}</div>
          <UserButton />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-canvas/90 px-3 py-2 backdrop-blur sm:px-4 lg:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              className="tap inline-flex items-center justify-center text-ink lg:hidden"
              aria-label="Open menu"
              onClick={() => setMenuOpen(true)}
            >
              <Menu className="size-5" />
            </button>
            <NorfMark className="h-7 w-auto max-w-[96px] object-contain object-left lg:hidden" />
            <div className="hidden truncate text-xs uppercase tracking-[0.14em] text-faint sm:block">
              {boot.data?.counts.jobsRunning ? `${boot.data.counts.jobsRunning} ${ta("jobsRunning")}` : ta("idle")}
              {boot.data ? ` · ${quotaLabel}` : ""}
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-3">
            <label className="relative hidden min-w-0 md:block">
              <input
                value={findQ}
                onChange={(e) => setFindQ(e.target.value)}
                placeholder={ta("findPlaceholder")}
                className="h-8 w-52 border border-line bg-canvas px-2 text-xs outline-none placeholder:text-faint focus:border-ink lg:w-64"
              />
              {findQ.trim().length >= 2 ? (
                <div className="absolute right-0 top-9 z-30 max-h-96 w-80 overflow-y-auto border border-line bg-canvas p-2 text-sm shadow-lg">
                  {(find.data?.companies ?? []).length ? <div className="px-2 pb-1 text-[10px] uppercase tracking-[0.14em] text-faint">{ta("navCompanies")}</div> : null}
                  {(find.data?.companies ?? []).map((c: { id: string; name: string }) => (
                    <Link key={c.id} to="/companies/$companyId" params={{ companyId: c.id }} className="block px-2 py-1 hover:bg-panel-2" onClick={() => setFindQ("")}>{c.name}</Link>
                  ))}
                  {(find.data?.people ?? []).length ? <div className="px-2 pb-1 pt-2 text-[10px] uppercase tracking-[0.14em] text-faint">{ta("navPeople")}</div> : null}
                  {(find.data?.people ?? []).map((p: { id: string; name: string }) => (
                    <Link key={p.id} to="/people/$personId" params={{ personId: p.id }} className="block px-2 py-1 hover:bg-panel-2" onClick={() => setFindQ("")}>{p.name}</Link>
                  ))}
                  {(find.data?.runs ?? []).length ? <div className="px-2 pb-1 pt-2 text-[10px] uppercase tracking-[0.14em] text-faint">{ta("navHistory")}</div> : null}
                  {(find.data?.runs ?? []).map((r: { id: string; name?: string | null }) => (
                    <Link key={r.id} to="/search/$runId" params={{ runId: r.id }} className="block px-2 py-1 hover:bg-panel-2" onClick={() => setFindQ("")}>{r.name || r.id.slice(0, 8)}</Link>
                  ))}
                  {find.isFetched && !(find.data?.companies ?? []).length && !(find.data?.people ?? []).length && !(find.data?.runs ?? []).length ? (
                    <p className="px-2 py-1 text-xs text-mute">No matches</p>
                  ) : null}
                </div>
              ) : null}
            </label>
            <div className="hidden sm:block">
              <LangSwitch />
            </div>
            {boot.data?.isAdmin ? (
              <Link to="/admin" className="tap hidden items-center px-2 text-xs text-mute hover:text-ink sm:inline-flex">
                {ta("admin")}
              </Link>
            ) : null}
            <Link to="/search/new" className="cta px-3 text-xs sm:text-sm">
              {ta("newSearch")}
            </Link>
          </div>
        </header>
        {boot.isError ? (
          <div className="border-b border-line bg-panel px-4 py-2 text-sm text-mute">
            {ta("contactSupport")}
          </div>
        ) : null}
        <main className="min-w-0 flex-1 overflow-x-hidden px-4 py-5 pb-24 sm:px-5 md:px-6 md:py-6 lg:pb-6">
          <Outlet />
        </main>
        <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-line bg-canvas/95 backdrop-blur lg:hidden safe-bottom">
          {TAB_ITEMS.map((tab) => {
            const active = navActive(tab.to);
            const Icon = ICONS[tab.to] ?? Radar;
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={cn(
                  "flex min-h-12 flex-col items-center justify-center gap-1 py-2 text-[10px] uppercase tracking-[0.12em]",
                  active ? "text-ink" : "text-faint",
                )}
              >
                <Icon className="size-4" />
                {ta(tab.key)}
              </Link>
            );
          })}
        </nav>
      </div>
      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} side="left" title={ta("workspace")}>
        <div className="mb-3 px-1 sm:hidden">
          <LangSwitch />
        </div>
        {navLinks}
        <div className="mt-4 grid gap-2 border-t border-line px-1 pt-4 text-sm">
          {boot.data?.isAdmin ? (
            <Link to="/admin" className="tap flex items-center text-mute hover:text-ink" onClick={() => setMenuOpen(false)}>
              {ta("admin")}
            </Link>
          ) : null}
          <Link to="/" className="tap flex items-center text-mute hover:text-ink" onClick={() => setMenuOpen(false)}>
            norfai.com
          </Link>
          <div className="pt-2">
            <UserButton />
          </div>
        </div>
      </Drawer>
      <NorfAssistant />
    </div>
  );
}
