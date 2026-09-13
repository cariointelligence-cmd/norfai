import { Link } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { useState } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { loc } from "@/lib/content/locale.ts";
import { LOCALES, useI18n, type Locale } from "@/lib/i18n";
import { Drawer } from "@/components/drawer";
import { cn } from "@/lib/utils";

export function LangSwitch() {
  const { locale, setLocale } = useI18n();
  return (
    <div className="flex items-center" role="group" aria-label="Language">
      {LOCALES.map((l: Locale) => (
        <button
          key={l}
          type="button"
          className={cn(
            "tap min-w-11 px-2 text-xs uppercase tracking-[0.14em]",
            l === locale ? "text-ink" : "text-faint hover:text-ink",
          )}
          onClick={() => setLocale(l)}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

export function NorfMark({ className = "h-8 w-auto", variant = "onDark" }: { className?: string; variant?: "onDark" | "onLight" }) {
  const src = variant === "onLight" ? "/brand/norf-on-light.png" : "/brand/norf-on-dark.png";
  return <img src={src} alt="Norf" className={className} />;
}

function useMarketingLinks() {
  const { t, locale } = useI18n();
  return [
    { to: "/use-cases", label: t("navUseCases") },
    { to: "/pricing", label: t("navPricing") },
    { to: "/tools", label: t("navTools") },
    { to: "/faq", label: t("navFaq") },
    { to: "/about", label: t("navAbout") },
    { to: "/industries", label: loc({ fi: "Toimialat", en: "Industries", sv: "Branscher" }, locale) },
    { to: "/locations", label: loc({ fi: "Sijainnit", en: "Locations", sv: "Platser" }, locale) },
    { to: "/guides", label: loc({ fi: "Oppaat", en: "Guides", sv: "Guider" }, locale) },
  ] as const;
}

export function MarketingHeader() {
  const { t } = useI18n();
  const { user } = useCurrentUserState();
  const links = useMarketingLinks();
  const [open, setOpen] = useState(false);
  const ctaTo = user ? "/overview" : "/login";
  const ctaLabel = user ? t("navApp") : t("heroCta");
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-canvas/90 backdrop-blur">
      <div className="wrap flex h-16 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            className="tap inline-flex items-center justify-center text-ink lg:hidden"
            aria-label="Open menu"
            onClick={() => setOpen(true)}
          >
            <Menu className="size-5" />
          </button>
          <Link to="/" className="flex min-w-0 items-center">
            <NorfMark className="h-8 w-auto max-w-[128px] object-contain object-left sm:h-9 sm:max-w-[140px]" />
          </Link>
        </div>
        <nav className="hidden items-center gap-6 text-sm text-mute lg:flex">
          {links.slice(0, 5).map((l) => (
            <Link key={l.to} to={l.to} className="hover:text-ink">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1 sm:gap-3">
          <div className="hidden sm:block">
            <LangSwitch />
          </div>
          <Link to={ctaTo} className="cta px-3 text-sm sm:px-4">
            {ctaLabel}
          </Link>
        </div>
      </div>
      <Drawer open={open} onClose={() => setOpen(false)} side="left" title="Norf">
        <div className="mb-3 px-1">
          <LangSwitch />
        </div>
        <nav className="grid">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              onClick={() => setOpen(false)}
              className="tap flex items-center px-2 text-sm text-mute hover:text-ink"
            >
              {l.label}
            </Link>
          ))}
          <Link
            to={ctaTo}
            onClick={() => setOpen(false)}
            className="cta mt-4"
          >
            {ctaLabel}
          </Link>
        </nav>
      </Drawer>
    </header>
  );
}

export function MarketingFooter() {
  const { t, locale } = useI18n();
  return (
    <footer className="border-t border-line">
      <div className="wrap grid gap-10 py-12 md:grid-cols-[1.4fr_1fr_1fr_1fr] md:gap-8">
        <div>
          <NorfMark className="h-10 w-auto max-w-[160px] object-contain object-left" />
          <p className="mt-4 max-w-sm text-sm text-mute">{t("tagline")}</p>
          <p className="mt-6 text-sm text-mute">{t("madeBy")}</p>
          <p className="mt-1 text-sm text-mute">
            {t("madeBy2")}{" "}
            <a className="underline decoration-line underline-offset-2" href="https://www.cariointel.com" target="_blank" rel="noreferrer">
              cariointel.com
            </a>
            {" · "}
            <a className="underline decoration-line underline-offset-2" href="https://www.tajupalvelut.com" target="_blank" rel="noreferrer">
              tajupalvelut.com
            </a>
          </p>
        </div>
        <div className="text-sm text-mute">
          <div className="mb-3 kicker">{t("footerProduct")}</div>
          <div className="grid gap-2">
            <Link to="/pricing">{t("navPricing")}</Link>
            <Link to="/use-cases">{t("navUseCases")}</Link>
            <Link to="/tools">{t("navTools")}</Link>
            <Link to="/faq">{t("navFaq")}</Link>
          </div>
        </div>
        <div className="text-sm text-mute">
          <div className="mb-3 kicker">{t("footerExplore")}</div>
          <div className="grid gap-2">
            <Link to="/industries">{loc({ fi: "Toimialat", en: "Industries", sv: "Branscher" }, locale)}</Link>
            <Link to="/locations">{loc({ fi: "Sijainnit", en: "Locations", sv: "Platser" }, locale)}</Link>
            <Link to="/guides">{loc({ fi: "Oppaat", en: "Guides", sv: "Guider" }, locale)}</Link>
            <Link to="/news">{t("navNews")}</Link>
          </div>
        </div>
        <div className="text-sm text-mute">
          <div className="mb-3 kicker">Legal</div>
          <div className="grid gap-2">
            <Link to="/legal">{t("footerLegal")}</Link>
            <Link to="/terms">{t("footerTerms")}</Link>
            <Link to="/support">{t("navSupport")}</Link>
            <Link to="/login">{t("navLogin")}</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <MarketingHeader />
      {children}
      <MarketingFooter />
    </div>
  );
}
