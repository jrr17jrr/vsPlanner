"use client";

import { useEffect, useState, useTransition } from "react";
import { MessageSquareText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { addCltEntityNoteAction, listCltEntityNotesAction, type CltEntityNote, type NoteTarget } from "@/lib/supabase/clt-notes-actions";

const TITLE: Record<NoteTarget["level"], string> = { campaign: "Anotações da campanha", ad_set: "Anotações do conjunto", ad: "Anotações do anúncio" };

/** "06/11/2026 às 14:32" no fuso de São Paulo. */
export function formatNoteDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const time = d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  return `${date} às ${time}`;
}

/**
 * Histórico de anotações (texto + data e hora). Só acrescenta: anotações
 * anteriores ficam sempre visíveis e nunca são editadas nem apagadas.
 */
export function EntityNotes({ target, defaultOpen = false }: { target: NoteTarget; defaultOpen?: boolean }) {
  const key = `${target.level}:${target.campaignId}:${target.adSetId ?? ""}:${target.creativeId ?? ""}`;
  const [open, setOpen] = useState(defaultOpen);
  const [state, setState] = useState<{ key: string; notes: CltEntityNote[]; error?: string } | null>(null);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const loaded = state?.key === key;

  useEffect(() => {
    if (!open || loaded) return;
    let cancelled = false;
    listCltEntityNotesAction(target).then((r) => !cancelled && setState({ key, notes: r.notes, error: r.error }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key, loaded]);

  function add() {
    const body = text.trim();
    if (!body) return toast.error("Escreva a anotação.");
    start(async () => {
      const r = await addCltEntityNoteAction(target, body);
      if (r.error || !r.note) return void toast.error(r.error ?? "Não foi possível salvar a anotação.");
      setState((s) => ({ key, notes: [r.note!, ...(s?.key === key ? s.notes : [])] }));
      setText("");
      toast.success("Anotação adicionada.");
    });
  }

  const notes = loaded ? state.notes : [];

  return (
    <details open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)} className="rounded-lg border border-border bg-card p-3">
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
        <MessageSquareText className="h-4 w-4 text-primary" /> {TITLE[target.level]}
        {loaded && notes.length > 0 && <span className="text-xs font-normal text-muted-foreground">({notes.length})</span>}
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={4000}
            rows={2}
            placeholder="Ex.: Pausei esta campanha para testar outro público"
            aria-label="Nova anotação"
            disabled={pending}
          />
          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={add} disabled={pending || !text.trim()}>{pending ? "Salvando…" : "Adicionar anotação"}</Button>
          </div>
        </div>
        {!loaded ? (
          <p className="text-xs text-muted-foreground">Carregando anotações…</p>
        ) : state.error ? (
          <p className="text-xs text-warning">{state.error}</p>
        ) : notes.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma anotação ainda.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {notes.map((n) => (
              <li key={n.id} className="rounded-md bg-muted/40 p-2">
                <p className="whitespace-pre-wrap break-words text-sm">{n.body}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {formatNoteDateTime(n.created_at)}
                  {n.author_name ? ` · ${n.author_name}` : ""}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </details>
  );
}
