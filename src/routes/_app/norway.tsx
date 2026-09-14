import { createFileRoute } from "@tanstack/react-router";
import { CountryDesk } from "@/components/country-desk";

export const Route = createFileRoute("/_app/norway")({ component: NorwayDesk });

function NorwayDesk() {
  return (
    <CountryDesk
      country="NO"
      title="Norway"
      body="Brønnøysund only. Finnish YTJ and Finder never run on this desk."
    />
  );
}
