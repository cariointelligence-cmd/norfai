/** Pair decision-makers with their published mailbox and phone. Never invent. */
import type { ContactHit, PersonHit } from "../types.ts";
import { emailMatchesPerson, inferPersonMailbox, isJunkEmail } from "../contacts.ts";
import { normalizeDomain } from "../normalize.ts";

const EXEC = /toimitusjohtaja|verkställande|vd\b|ceo\b|managing director|daglig leder|administrerende|chair|puheenjohtaja|cfo|talousjohtaja|myyntijohtaja|sales director|cio\b|cto\b/i;

export function isDecisionTitle(title?: string | null): boolean {
  return Boolean(title && EXEC.test(title));
}

export function attachDecisionContacts(opts: {
  people: PersonHit[];
  emails: ContactHit[];
  phones: ContactHit[];
  website?: string | null;
}): PersonHit[] {
  const domain = opts.website ? normalizeDomain(opts.website) : null;
  const emails = opts.emails.filter((e) => e.value && !isJunkEmail(e.value));
  return opts.people.map((p) => {
    const next = { ...p };
    if (!next.workEmail) {
      const named = emails.find((e) => emailMatchesPerson(e.value, p.fullName));
      if (named) next.workEmail = named.value;
      else if (domain && isDecisionTitle(p.title)) {
        const inferred = inferPersonMailbox(p.fullName, domain);
        if (inferred?.value && emails.some((e) => e.value === inferred.value)) next.workEmail = inferred.value;
      }
    }
    if (!next.workPhone && opts.phones.length === 1 && isDecisionTitle(p.title)) {
      next.workPhone = opts.phones[0]?.value;
    }
    if (isDecisionTitle(p.title) && !next.seniority) next.seniority = "executive";
    return next;
  });
}
