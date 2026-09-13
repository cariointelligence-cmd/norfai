import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Drawer({
  open,
  onClose,
  side = "left",
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  side?: "left" | "right";
  title: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="drawer-scrim" aria-label="Close menu" onClick={onClose} />
      <div className="drawer-panel safe-bottom" data-side={side}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <p className="kicker">{title}</p>
          <button
            type="button"
            onClick={onClose}
            className="tap inline-flex items-center justify-center text-mute hover:text-ink"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className={cn("min-h-0 flex-1 overflow-y-auto px-3 py-3")}>{children}</div>
      </div>
    </div>
  );
}
