import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/shell";

export const Route = createFileRoute("/_app")({
  head: () => ({
    meta: [
      { title: "Norf" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AppShell,
});
