import { createFileRoute } from "@tanstack/react-router";
import { CountryDesk } from "@/components/country-desk";

export const Route = createFileRoute("/_app/sweden")({ component: SwedenDesk });

function SwedenDesk() {
  return (
    <CountryDesk
      country="SE"
      title="Sweden"
      body="Bolagsverket / Allabolag only. Finnish YTJ and Finder never run on this desk."
    />
  );
}
