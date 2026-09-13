import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { MarketingPage } from "@/components/marketing-page";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { useI18n } from "@/lib/i18n";
import { pageByPath } from "@/lib/seo/catalog.ts";
import { marketingHead } from "@/lib/seo/head.ts";
import { SITE_EMAIL, SITE_EMAIL_ALT } from "@/lib/seo/site.ts";
import { createPublicTicket } from "@/lib/norr/support-actions";
import { toast } from "sonner";

const meta = pageByPath("/support")!;

export const Route = createFileRoute("/support")({
  head: () => marketingHead({ title: meta.title, description: meta.description, path: "/support" }),
  component: Support,
});

function Support() {
  const { t, locale } = useI18n();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [website, setWebsite] = useState("");
  const send = useMutation({
    mutationFn: () => createPublicTicket({ data: { email, name, subject, body, website, locale } }),
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.message("Ticket opened. Check your email for the thread.");
      setSubject("");
      setBody("");
    },
  });
  return (
    <MarketingPage
      crumbs={[{ label: "Norf", to: "/" }, { label: t("navSupport") }]}
      title={t("supportTitle")}
      lead={t("supportBody")}
    >
      <form
        className="space-y-3 border border-line bg-panel p-5"
        onSubmit={(e) => {
          e.preventDefault();
          send.mutate();
        }}
      >
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </Field>
        <Field label="Email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </Field>
        <Field label="Subject">
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} required minLength={4} />
        </Field>
        <Field label="Message">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} required minLength={8} />
        </Field>
        <div className="hidden" aria-hidden="true">
          <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </div>
        <Button type="submit" disabled={send.isPending}>Send</Button>
        <p className="text-xs text-faint">
          Signed-in users can also follow tickets in the workspace under Support.
          Direct mail: <a className="underline" href={`mailto:${SITE_EMAIL}`}>{SITE_EMAIL}</a>
          {" · "}
          <a className="underline" href={`mailto:${SITE_EMAIL_ALT}`}>{SITE_EMAIL_ALT}</a>
        </p>
        <Link to="/login" className="block text-sm text-mute hover:text-ink">Sign in to see open tickets</Link>
      </form>
    </MarketingPage>
  );
}
