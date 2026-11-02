"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReminderOffsetsPicker } from "@/components/shared/reminder-offsets-picker";
import { saveNotificationPreferencesAction, type NotificationCategory } from "@/lib/supabase/notification-preferences-actions";
import { DIGEST_TIMES, resolveNotificationPrefs, type NotificationPrefs } from "@/lib/notification-prefs";

const CATEGORIES: Array<{ key: NotificationCategory; label: string; description: string }> = [
  { key: "tasks", label: "Tarefas e subtarefas", description: "Tarefas pessoais e suas subtarefas." },
  { key: "routine", label: "Rotina", description: "Atividades da Minha Rotina com lembrete configurado." },
  { key: "meetings", label: "Reuniões", description: "Avisos de reuniões agendadas." },
  { key: "finance", label: "Financeiro", description: "Contas a pagar, receber e vencimentos." },
  { key: "clt", label: "Trabalho / CLT", description: "Tarefas e compromissos do trabalho." },
];

const TYPES: Array<{ key: "execution" | "deadline" | "overdue"; label: string; description: string }> = [
  { key: "execution", label: "Lembretes de execução", description: "No horário programado e com a antecedência escolhida." },
  { key: "deadline", label: "Lembretes de prazo", description: "Na véspera (“termina amanhã”) e no último dia." },
  { key: "overdue", label: "Alertas de atraso", description: "No dia seguinte ao prazo, depois de 3 e de 7 dias. Param ao concluir." },
];

function Toggle({ label, description, checked, onChange, disabled }: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-lg border border-border p-3 ${disabled ? "opacity-50" : ""}`}>
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
      <input type="checkbox" className="h-5 w-5 shrink-0 accent-primary" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function NotificationPreferencesPanel({ initial, canAccessClt }: { initial: unknown; canAccessClt: boolean }) {
  const [value, setValue] = useState<NotificationPrefs>(() => resolveNotificationPrefs(initial));
  const [pending, startTransition] = useTransition();
  const set = (patch: Partial<NotificationPrefs>) => setValue((v) => ({ ...v, ...patch }));
  const off = !value.enabled;

  return (
    <Card className="p-4">
      <h2 className="mb-1 text-sm font-medium">O que quero receber</h2>
      <p className="mb-4 text-xs text-muted-foreground">
        Os avisos são enviados pelo servidor, mesmo com o VS Planner fechado. É preciso ativar o push em cada aparelho (acima).
      </p>

      <div className="space-y-3">
        <Toggle label="Ativar notificações" description="Desligue para pausar todos os avisos." checked={value.enabled} onChange={(v) => set({ enabled: v })} />

        <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tipos de aviso</p>
        {TYPES.map((t) => (
          <Toggle key={t.key} label={t.label} description={t.description} checked={value[t.key]} disabled={off} onChange={(v) => set({ [t.key]: v })} />
        ))}

        <div className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Antecedência padrão</Label>
            <p className="text-[11px] text-muted-foreground">Usada em tarefas com horário sem lembrete escolhido.</p>
            <ReminderOffsetsPicker value={value.defaultOffsets} onChange={(v) => set({ defaultOffsets: v })} disabled={off || !value.execution} hasTime />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Horário dos avisos de prazo e atraso</Label>
            <Select value={value.digestTime} onValueChange={(v) => set({ digestTime: v })} disabled={off}>
              <SelectTrigger className="h-10 w-full" aria-label="Horário dos avisos de prazo e atraso"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DIGEST_TIMES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Áreas</p>
        {CATEGORIES.filter((o) => o.key !== "clt" || canAccessClt).map((o) => (
          <Toggle key={o.key} label={o.label} description={o.description} checked={value[o.key]} disabled={off} onChange={(v) => set({ [o.key]: v })} />
        ))}
      </div>

      <Button
        className="mt-4 h-10"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await saveNotificationPreferencesAction(value);
            if (result.error) toast.error(result.error);
            else toast.success(result.success);
          })
        }
      >
        {pending ? "Salvando..." : "Salvar preferências"}
      </Button>
    </Card>
  );
}
