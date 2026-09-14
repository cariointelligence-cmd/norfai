import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { askNorfAssistant } from "@/lib/norr/actions";
import { useI18n } from "@/lib/i18n";

export function NorfAssistant() {
  const { locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [log, setLog] = useState<Array<{ role: "you" | "norf"; text: string }>>([]);
  const ask = useMutation({
    mutationFn: () => askNorfAssistant({ data: { question: q, locale } }),
    onSuccess: (r) => {
      if (!r.ok) {
        setLog((p) => [...p, { role: "norf", text: r.error }]);
        return;
      }
      setLog((p) => [...p, { role: "norf", text: r.text }]);
      setQ("");
    },
  });
  return (
    <>
      <button
        type="button"
        className="fixed bottom-20 right-4 z-30 grid size-11 place-items-center rounded-full border border-line bg-panel text-sm shadow-panel lg:bottom-6"
        onClick={() => setOpen((v) => !v)}
        aria-label="Norf assistant"
      >
        ?
      </button>
      {open ? (
        <div className="fixed bottom-32 right-4 z-30 w-[min(92vw,22rem)] border border-line bg-canvas p-3 shadow-panel lg:bottom-20">
          <p className="text-xs uppercase tracking-[0.14em] text-faint">Norf</p>
          <div className="mt-2 max-h-56 space-y-2 overflow-y-auto text-sm">
            {log.length === 0 ? <p className="text-mute">Ask how to search, export or connect CRM.</p> : null}
            {log.map((m, i) => (
              <p key={i} className={m.role === "you" ? "text-ink" : "text-mute"}>{m.text}</p>
            ))}
          </div>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!q.trim() || ask.isPending) return;
              setLog((p) => [...p, { role: "you", text: q }]);
              ask.mutate();
            }}
          >
            <input
              className="min-w-0 flex-1 border border-line bg-panel px-2 py-1 text-sm"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="…"
            />
            <button className="cta px-3 text-xs" type="submit" disabled={ask.isPending}>OK</button>
          </form>
        </div>
      ) : null}
    </>
  );
}
