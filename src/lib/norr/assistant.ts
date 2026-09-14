/** In-app Grok helper. Never invents companies, emails or plans. */
import { asUntrustedData } from "./security.ts";

export async function norfAssist(opts: {
  question: string;
  locale?: string;
  isAdmin?: boolean;
  plan?: string;
}): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const apiKey = process.env.XAI_API_KEY?.trim();
  if (!apiKey) return { ok: false, error: "Assistant is not connected." };
  const q = opts.question.trim().slice(0, 800);
  if (q.length < 2) return { ok: false, error: "Ask a short question." };
  const locale = opts.locale === "en" || opts.locale === "sv" ? opts.locale : "fi";
  const prompt = [
    "You are Norf, a B2B company-search assistant for norfai.com.",
    "Help the signed-in user use search, lists, export, billing and integrations.",
    "Never invent companies, emails, phones, financials or that a search finished.",
    "Never claim HubSpot/TAJU is connected unless they say so.",
    `User plan: ${opts.isAdmin ? "admin unlimited" : opts.plan || "free"}. Stay inside that quota.`,
    `Reply in ${locale === "en" ? "English" : locale === "sv" ? "Swedish" : "Finnish"}. Short, practical.`,
    "DATA: " + asUntrustedData(q, 800),
  ].join("\n");
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12_000);
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "grok-4.5",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: 420,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return { ok: false, error: "Assistant busy. Try again." };
    const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = (body.choices?.[0]?.message?.content ?? "").trim();
    if (!text) return { ok: false, error: "Empty reply." };
    return { ok: true, text: text.slice(0, 2500) };
  } catch {
    return { ok: false, error: "Assistant timed out." };
  }
}
