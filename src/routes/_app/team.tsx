import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { inviteMember, listTeam, removeMember } from "@/lib/norr/ops-actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Empty, Pill, Stat } from "@/components/status";
import { formatWhen } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { loc } from "@/lib/content/locale";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/team")({ component: Team });

function Team() {
  const { locale, ta } = useI18n();
  const copy = loc(
    {
      fi: {
        title: "Tiimi",
        body: "Kutsutut näkevät saman työtilan listat, haut ja yritykset. Istuimet riippuvat tilauksesta. Free 1, Starter 3, Pro 10, Unlimited 25.",
        email: "Sähköposti",
        invite: "Kutsu",
        empty: "Ei jäseniä",
        emptyBody: "Olet ainoa käyttäjä. Kutsu kollega, niin listat ja muistiinpanot näkyvät hänelle.",
        seats: "Istuimet",
        ownerOnly: "Vain omistaja voi kutsua.",
        member: "Jäsen",
        admin: "Ylläpitäjä",
      },
      en: {
        title: "Team",
        body: "Invitees see the same lists, searches and companies. Seats follow the plan. Free 1, Starter 3, Pro 10, Unlimited 25.",
        email: "Email",
        invite: "Invite",
        empty: "No members",
        emptyBody: "You are the only user. Invite a colleague so lists and notes are shared.",
        seats: "Seats",
        ownerOnly: "Only the workspace owner can invite.",
        member: "Member",
        admin: "Admin",
      },
      sv: {
        title: "Team",
        body: "Inbjudna ser samma listor, sökningar och bolag. Platser följer planen. Free 1, Starter 3, Pro 10, Unlimited 25.",
        email: "E-post",
        invite: "Bjud in",
        empty: "Inga medlemmar",
        emptyBody: "Du är den enda användaren. Bjud in en kollega så listas och anteckningar delas.",
        seats: "Platser",
        ownerOnly: "Endast ägaren kan bjuda in.",
        member: "Medlem",
        admin: "Admin",
      },
    },
    locale,
  );
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const q = useQuery({ queryKey: ["team"], queryFn: () => listTeam() });
  const invite = useMutation({
    mutationFn: () => inviteMember({ data: { email, role } }),
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error(r.error ?? copy.ownerOnly);
        return;
      }
      setEmail("");
      void qc.invalidateQueries({ queryKey: ["team"] });
      toast.message(copy.invite);
    },
  });
  const members = q.data?.members ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">{copy.title}</h1>
        <p className="mt-1 max-w-2xl text-sm text-mute">{copy.body}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label={copy.seats} value={`${q.data?.seatsUsed ?? 1}/${q.data?.seatCap ?? 1}`} hint={String(q.data?.plan ?? "free")} />
      </div>
      {q.data?.isOwner ? (
        <form
          className="grid gap-3 border border-line bg-panel p-4 sm:grid-cols-[1fr_140px_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            invite.mutate();
          }}
        >
          <Field label={copy.email}>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="Role">
            <select className="h-11 w-full border border-line bg-canvas px-3 text-sm" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="member">{copy.member}</option>
              <option value="admin">{copy.admin}</option>
            </select>
          </Field>
          <div className="self-end">
            <Button type="submit" disabled={invite.isPending || !email.trim()}>
              {copy.invite}
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-mute">{copy.ownerOnly}</p>
      )}
      {members.length === 0 ? (
        <Empty title={copy.empty} body={copy.emptyBody} />
      ) : (
        <div className="border border-line">
          {members.map((m: { id: string; email: string; role: string; status: string; invited_at: string }) => (
            <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2 last:border-0">
              <div>
                <div className="text-sm">{m.email}</div>
                <div className="text-xs text-faint">{formatWhen(m.invited_at, "-", locale)}</div>
              </div>
              <div className="flex items-center gap-2">
                <Pill>{m.role}</Pill>
                <Pill tone={m.status === "active" ? "good" : "mute"}>{m.status}</Pill>
                {q.data?.isOwner ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      void removeMember({ data: { id: m.id } }).then(() => void qc.invalidateQueries({ queryKey: ["team"] }));
                    }}
                  >
                    {ta("remove")}
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
