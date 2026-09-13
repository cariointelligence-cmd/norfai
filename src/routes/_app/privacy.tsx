import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { addSuppression, createDsar, listDsar, listSuppression, purgeWorkspace } from "@/lib/norr/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Empty } from "@/components/status";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/privacy")({ component: Privacy });

function Privacy() {
  const qc = useQueryClient();
  const sup = useQuery({ queryKey: ["suppression"], queryFn: () => listSuppression() });
  const dsar = useQuery({ queryKey: ["dsar"], queryFn: () => listDsar() });
  const [kind, setKind] = useState("email");
  const [value, setValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [requestType, setRequestType] = useState("access");
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">Privacy & retention</h1>
        <p className="mt-1 text-sm text-mute">Company records and professional people are stored separately. Norf does not contact anyone. Do-not-contact lives on the suppression list.</p>
      </div>
      <section className="max-w-lg space-y-3">
        <h2 className="text-sm font-medium">Suppression / do-not-contact</h2>
        <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); await addSuppression({ data: { kind, value } }); setValue(""); void qc.invalidateQueries({ queryKey: ["suppression"] }); }}>
          <Select value={kind} onChange={(e) => setKind(e.target.value)} className="w-32">
            <option value="email">email</option>
            <option value="phone">phone</option>
            <option value="domain">domain</option>
            <option value="business_id">business_id</option>
          </Select>
          <Input value={value} onChange={(e) => setValue(e.target.value)} required />
          <Button type="submit">Add</Button>
        </form>
        {(sup.data?.rows.length ?? 0) === 0 ? <Empty title="List empty" body="Add addresses, numbers or domains that must never be exported." /> : (
          <div className="border border-line text-sm">
            {(sup.data?.rows as Array<{ id: string; kind: string; value: string }>).map((r) => (
              <div key={r.id} className="flex justify-between border-b border-line px-3 py-2 last:border-0"><span>{r.kind}</span><span className="font-mono text-xs">{r.value}</span></div>
            ))}
          </div>
        )}
      </section>
      <section className="max-w-lg space-y-3">
        <h2 className="text-sm font-medium">Data-subject request</h2>
        <Field label="Subject name"><Input value={subjectName} onChange={(e) => setSubjectName(e.target.value)} /></Field>
        <Field label="Type">
          <Select value={requestType} onChange={(e) => setRequestType(e.target.value)}>
            <option value="access">Access</option>
            <option value="erasure">Erasure</option>
            <option value="rectification">Rectification</option>
            <option value="objection">Objection</option>
          </Select>
        </Field>
        <Button onClick={() => createDsar({ data: { subjectName, requestType } }).then(() => { toast.message("Logged"); void qc.invalidateQueries({ queryKey: ["dsar"] }); })}>Log request</Button>
        <div className="border border-line text-sm">
          {((dsar.data?.rows ?? []) as Array<{ id: string; request_type: string; status: string; subject_name: string | null }>).map((r) => (
            <div key={r.id} className="flex justify-between border-b border-line px-3 py-2 last:border-0">
              <span>{r.request_type} · {r.subject_name ?? "unnamed"}</span>
              <span className="text-mute">{r.status}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="max-w-lg space-y-3">
        <h2 className="text-sm font-medium">Delete workspace data</h2>
        <p className="text-sm text-mute">Soft-delete is used on individual companies. This purge hard-deletes operational records for the signed-in user only.</p>
        <Field label='Type DELETE'>
          <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <Button variant="danger" onClick={() => purgeWorkspace({ data: { confirm } }).then((r) => toast.message(r.ok ? "Purged" : r.error ?? "Failed"))}>Purge</Button>
        <Textarea readOnly value="Norf stores professional B2B data collected from public registers and company-controlled websites. Personal data is limited to names, titles and published work contacts. Automated outreach is out of scope." />
      </section>
    </div>
  );
}
