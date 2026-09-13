import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { DEMO_FILTERS, LANDING } from "@/lib/content/landing.ts";
import { loc } from "@/lib/content/locale.ts";
import { useI18n } from "@/lib/i18n";
import { hivePulse } from "@/lib/norr/public";

export function SearchDemo() {
  const { locale } = useI18n();
  const [on, setOn] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(DEMO_FILTERS.map((f) => [f.id, true])),
  );
  const [pulse, setPulse] = useState<{ ok: boolean; detail: string } | null>(null);
  useEffect(() => {
    let live = true;
    void hivePulse().then((r) => {
      if (live) setPulse({ ok: r.ok, detail: r.detail });
    });
    return () => {
      live = false;
    };
  }, []);
  const active = DEMO_FILTERS.filter((f) => on[f.id]).length;

  return (
    <section id="example" className="border-b border-line">
      <div className="wrap section">
        <p className="kicker">{loc(LANDING.demoKicker, locale)}</p>
        <h2 className="title mt-3 max-w-2xl">{loc(LANDING.demoTitle, locale)}</h2>
        <div className="mt-8 grid gap-8 lg:grid-cols-[1.4fr_0.8fr]">
          <div>
            <p className="mb-3 kicker">{loc({ fi: "Löydä yritykset, joilla on", en: "Find companies with", sv: "Hitta bolag med" }, locale)}</p>
            <div className="flex flex-wrap gap-2">
              {DEMO_FILTERS.map((f) => {
                const activeChip = on[f.id];
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setOn((s) => ({ ...s, [f.id]: !s[f.id] }))}
                    className={
                      activeChip
                        ? "tap border border-line-strong bg-panel-2 px-3 text-sm"
                        : "tap border border-line px-3 text-sm text-mute"
                    }
                  >
                    {loc(f.label, locale)}
                  </button>
                );
              })}
            </div>
            <p className="mt-4 text-xs text-faint">{loc(LANDING.demoCaption, locale)}</p>
          </div>
          <div className="panel p-6">
            <div className="kicker">{loc(LANDING.demoResult, locale)}</div>
            <div className="mt-3 font-mono text-2xl tracking-tight">
              {pulse
                ? pulse.ok
                  ? pulse.detail
                  : loc({ fi: "YTJ ei vastaa juuri nyt", en: "YTJ is not answering right now", sv: "YTJ svarar inte just nu" }, locale)
                : loc({ fi: "Kutsuu YTJ:tä…", en: "Calling YTJ…", sv: "Anropar YTJ…" }, locale)}
            </div>
            <p className="mt-2 text-sm text-mute">
              {loc(
                {
                  fi: `${active} kriteeriä valittu. Määrä lasketaan rekisteristä haun aikana, ei tästä esimerkistä.`,
                  en: `${active} filters on. The count is calculated from the register at search time, not from this example.`,
                  sv: `${active} filter valda. Antalet räknas från registret vid sökning, inte här.`,
                },
                locale,
              )}
            </p>
            <Link to="/login" className="cta mt-6">
              {loc(LANDING.demoCta, locale)}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
