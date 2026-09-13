export type Specialization = {
  id: string;
  label: string;
  parent: string;
  needles: string[];
};

export const SPECIALIZATIONS: Specialization[] = [
  { id: "roofing", label: "Roofing contractor", parent: "43", needles: ["kattourako", "kateurako", "roofing", "bitumikate", "peltikatto"] },
  { id: "hvac", label: "HVAC installation", parent: "43", needles: ["lvi-asenn", "ilmastointi", "lämmitysjärjest", "hvac", "lvi-työt"] },
  { id: "electrical", label: "Industrial electrical contractor", parent: "43", needles: ["sähköurako", "sähköasenn", "electrical contractor", "teollisuussähkö"] },
  { id: "solar", label: "Solar installation", parent: "43", needles: ["aurinkopaneel", "solar panel", "aurinkosähkö", "photovolta"] },
  { id: "facade", label: "Facade renovation", parent: "43", needles: ["julkisivukorjaus", "julkisivuremont", "facade renov", "elementtisaumaus"] },
  { id: "earthworks", label: "Earthworks", parent: "43", needles: ["maanrakenn", "earthworks", "kaivuutyöt", "maarakennus"] },
  { id: "concrete", label: "Concrete construction", parent: "41", needles: ["betonirakent", "concrete construction", "elementtirakent"] },
  { id: "datacenter_build", label: "Data-center construction", parent: "41", needles: ["konesali", "data center", "datacenter", "server hall"] },
  { id: "property_maint", label: "Commercial property maintenance", parent: "81", needles: ["kiinteistöhuolto", "property maintenance", "talotekniikan huolto"] },
  { id: "automation", label: "Industrial automation", parent: "33", needles: ["teollisuusautomaatio", "industrial automation", "plc", "scada"] },
  { id: "crm_saas", label: "CRM SaaS", parent: "62", needles: ["crm-järjestelmä", "crm software", "salesforce", "hubspot crm"] },
  { id: "cyber_saas", label: "Cybersecurity SaaS", parent: "62", needles: ["tietoturva", "cybersecurity", "endpoint protection", "soc-palvelu"] },
  { id: "construction_saas", label: "Construction SaaS", parent: "62", needles: ["rakennusalan ohjelmisto", "construction software", "projektinhallinta työmaa"] },
  { id: "erp", label: "ERP", parent: "62", needles: ["erp", "toiminnanohjaus", "netvisor", "sap "] },
  { id: "ai_automation", label: "AI automation", parent: "62", needles: ["tekoälyautomaatio", "ai automation", "rpa", "koneoppiminen"] },
  { id: "hr_software", label: "HR software", parent: "62", needles: ["hr-järjestelmä", "henkilöstöhallinto", "hr software"] },
  { id: "ecommerce_platform", label: "Ecommerce platform", parent: "62", needles: ["verkkokauppa-alusta", "ecommerce platform", "shopify partner"] },
  { id: "iiot", label: "Industrial IoT", parent: "62", needles: ["iot", "teollinen internet", "sensoridata"] },
  { id: "b2g_software", label: "B2G software", parent: "62", needles: ["kunta-asiakka", "public sector software", "hansel", "b2g"] },
];

export function inferSpecializations(blob: string, officialCode?: string | null): string[] {
  const text = blob.toLowerCase();
  const hits: string[] = [];
  for (const spec of SPECIALIZATIONS) {
    if (officialCode && !officialCode.startsWith(spec.parent.slice(0, 2)) && officialCode !== spec.parent) {
      // still allow website-inferred specializations outside the official class
    }
    if (spec.needles.some((n) => text.includes(n))) hits.push(spec.id);
  }
  return [...new Set(hits)].slice(0, 8);
}

export function specializationLabel(id: string): string {
  return SPECIALIZATIONS.find((s) => s.id === id)?.label ?? id;
}
