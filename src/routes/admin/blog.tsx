import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import { adminGeneratePost, adminListPosts, adminSavePost } from "@/lib/norr/actions";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/blog")({ component: AdminBlog });

function AdminBlog() {
  const qc = useQueryClient();
  const posts = useQuery({ queryKey: ["admin-posts"], queryFn: () => adminListPosts() });
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [topic, setTopic] = useState("");
  const save = useMutation({
    mutationFn: () => adminSavePost({ data: { title, body, status: "published", excerpt: title } }),
    onSuccess: () => { toast.message("Published"); setTitle(""); setBody(""); void qc.invalidateQueries({ queryKey: ["admin-posts"] }); },
  });
  const gen = useMutation({
    mutationFn: () => adminGeneratePost({ data: { topic: topic || undefined, publish: false } }),
    onSuccess: (r) => {
      if (r.ok) { toast.message(r.title); void qc.invalidateQueries({ queryKey: ["admin-posts"] }); }
      else toast.error(r.error);
    },
  });
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">Write</h1>
        <div className="mt-4 space-y-3">
          <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Textarea rows={12} placeholder="Markdown body" value={body} onChange={(e) => setBody(e.target.value)} />
          <Button onClick={() => save.mutate()} disabled={!title.trim() || !body.trim() || save.isPending}>Publish</Button>
        </div>
        <div className="mt-10 space-y-3 border-t border-line pt-6">
          <h2 className="text-sm font-medium">Draft from a topic</h2>
          <p className="text-xs text-mute">Saved as a draft if the quality gate fails. Nothing is auto-published from here.</p>
          <Input placeholder="Topic (optional)" value={topic} onChange={(e) => setTopic(e.target.value)} />
          <Button variant="secondary" onClick={() => gen.mutate()} disabled={gen.isPending}>
            {gen.isPending ? "Writing" : "Write draft"}
          </Button>
        </div>
      </div>
      <div>
        <h2 className="text-sm font-medium">Posts</h2>
        <div className="mt-3 border border-line">
          {(posts.data?.posts ?? []).map((p: any) => (
            <div key={p.id} className="border-b border-line px-3 py-2 text-sm last:border-0">
              <div>{p.title}</div>
              <div className="text-xs text-mute">{p.status} · {p.locale} · {p.source}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
