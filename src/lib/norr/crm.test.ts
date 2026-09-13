import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseCrmProvider, tajuEndpointOk, tajuKeyOk, tajuLeadBody, TAJU_DEFAULT_ENDPOINT } from "./crm.ts";

describe("CRM providers", () => {
  it("accepts hubspot, pipedrive and taju and rejects the rest", () => {
    assert.equal(parseCrmProvider("taju"), "taju");
    assert.equal(parseCrmProvider("HubSpot"), "hubspot");
    assert.equal(parseCrmProvider("pipedrive"), "pipedrive");
    assert.equal(parseCrmProvider("salesforce"), null);
    assert.equal(parseCrmProvider(""), null);
  });
});

describe("TAJU CRM inbound payload", () => {
  it("maps a Norf company onto TAJU lead fields and keeps the published webhook host", () => {
    assert.match(TAJU_DEFAULT_ENDPOINT, /^https:\/\/wapvbkhkotroygwmsiee\.supabase\.co\/functions\/v1\/api-webhook$/);
    const body = tajuLeadBody({
      name: "Kaski Creative Oy",
      businessId: "2203605-5",
      website: "https://kaski.fi",
      phone: "+358401234567",
      city: "Helsinki",
      country: "FI",
      personName: "Maija Malli",
      personTitle: "Toimitusjohtaja",
      email: "maija@kaski.fi",
      industry: "Mainostoimistot",
    });
    assert.equal(body.company_name, "Kaski Creative Oy");
    assert.equal(body.contact_person, "Maija Malli");
    assert.equal(body.email, "maija@kaski.fi");
    assert.equal(body.phone, "+358401234567");
    assert.equal(body.website, "https://kaski.fi");
    assert.equal(body.industry, "Mainostoimistot");
    assert.equal(body.status, "new");
    assert.equal(body.source, "Norf");
    assert.equal(body.event, "lead.create");
    assert.match(String(body.notes), /2203605-5/);
    assert.match(String(body.notes), /Helsinki/);
    assert.equal(body.business_id, undefined);
    assert.equal(body.city, undefined);
    assert.equal(body.country, undefined);
    assert.equal(body.data, undefined);
  });

  it("uses the company name as contact when no person is stored", () => {
    const body = tajuLeadBody({ name: "Example Oy" });
    assert.equal(body.contact_person, "Example Oy");
  });

  it("rejects non-https or local endpoints", () => {
    assert.equal(tajuEndpointOk("http://wapvbkhkotroygwmsiee.supabase.co/functions/v1/api-webhook"), null);
    assert.equal(tajuEndpointOk("https://localhost/webhook"), null);
    assert.equal(tajuEndpointOk("not a url"), null);
    assert.equal(
      tajuEndpointOk("https://wapvbkhkotroygwmsiee.supabase.co/functions/v1/api-webhook"),
      "https://wapvbkhkotroygwmsiee.supabase.co/functions/v1/api-webhook",
    );
  });

  it("accepts TAJU keys and rejects a pasted webhook URL", () => {
    assert.equal(tajuKeyOk("taju_abcdefghijklmnopqrstuvwxyz012345"), true);
    assert.equal(tajuKeyOk("https://wapvbkhkotroygwmsiee.supabase.co/functions/v1/api-webhook"), false);
    assert.equal(tajuKeyOk("pat-eu1-hubspot"), false);
    assert.equal(tajuKeyOk("taju_short"), false);
  });
});
