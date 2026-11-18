"use client";

import { useState } from "react";
import { ClipboardCopy, Eye, FileInput } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { copyText } from "@/components/trabalho/registered-info";
import type { ImportTemplate } from "@/lib/import/templates";

/**
 * Modelos da Central de Importação: Ver modelo (campos aceitos, tipo e onde
 * cada um é gravado), Copiar modelo e Inserir modelo no campo de conteúdo.
 * Os modelos vêm de lib/import/templates.ts — os mesmos campos da importação.
 */
export function TemplateBar({ templates, format, current, onInsert }: { templates: ImportTemplate[]; format: "text" | "json"; current: string; onInsert: (content: string) => void }) {
  const [id, setId] = useState(templates[0]?.id);
  const [open, setOpen] = useState(false);
  const t = templates.find((x) => x.id === id) ?? templates[0];
  if (!t) return null;
  const content = format === "json" ? t.json : t.text;

  async function copy() {
    if (await copyText(content)) toast.success("Modelo copiado.");
    else toast.error("Não foi possível copiar. Use “Ver modelo” e copie manualmente.");
  }
  function insert() {
    const filled = current.trim() && !templates.some((x) => x.text === current || x.json === current);
    if (filled && !window.confirm("Substituir o conteúdo atual do campo pelo modelo? (Nada é gravado até você confirmar a importação.)")) return;
    onInsert(content);
  }

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-border p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Modelo</span>
        {templates.length > 1 && (
          <select aria-label="Escolher modelo" className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm sm:flex-none" value={t.id} onChange={(e) => setId(e.target.value as ImportTemplate["id"])}>
            {templates.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
        )}
        <div className="flex w-full flex-wrap gap-1.5 sm:w-auto">
          <Button type="button" variant="outline" size="sm" className="h-9 flex-1 sm:flex-none" onClick={() => setOpen(true)}><Eye className="h-4 w-4" />Ver modelo</Button>
          <Button type="button" variant="outline" size="sm" className="h-9 flex-1 sm:flex-none" onClick={copy}><ClipboardCopy className="h-4 w-4" />Copiar modelo</Button>
          <Button type="button" variant="outline" size="sm" className="h-9 flex-1 sm:flex-none" onClick={insert}><FileInput className="h-4 w-4" />Inserir modelo</Button>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">{t.description} Formato: {format === "json" ? "JSON" : "texto"}.</p>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader><DialogTitle>Modelo — {t.label} ({format === "json" ? "JSON" : "texto"})</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">Todos os campos abaixo são lidos e gravados pela importação. Campo não reconhecido aparece como aviso na prévia — nada é descartado em silêncio.</p>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead className="bg-muted/40 text-muted-foreground"><tr><th className="p-2">Campo (texto)</th><th className="p-2">Chave (JSON)</th><th className="p-2">Tipo</th><th className="p-2">Onde grava</th></tr></thead>
              <tbody>
                {t.fields.map((f, i) => (
                  <tr key={i} className="border-t align-top">
                    <td className="p-2 font-medium">{f.text ?? <span className="text-muted-foreground">só JSON</span>}{f.note && <span className="mt-0.5 block font-normal text-muted-foreground">{f.note}</span>}</td>
                    <td className="p-2 font-mono">{f.json ?? "—"}</td>
                    <td className="p-2">{f.type}</td>
                    <td className="p-2 font-mono text-[11px] text-muted-foreground">{f.saves}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 text-xs">{content}</pre>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="h-10" onClick={copy}><ClipboardCopy className="h-4 w-4" />Copiar modelo</Button>
            <Button type="button" className="h-10" onClick={() => { insert(); setOpen(false); }}><FileInput className="h-4 w-4" />Inserir modelo</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
