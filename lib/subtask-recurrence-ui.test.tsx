import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Subtask } from "./task-schedule";
import type { Task } from "@/types/database.types";

/**
 * Telas (SSR, sem navegador) da atualização de subtarefas: checklist
 * expansível no Meu Dia, card ÚNICO por tarefa recorrente na página
 * Tarefas, seção de organizadoras e pendências com data dentro do card.
 * Interações em navegador real (toque no iPhone) ficam como verificação manual.
 */
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined, push: () => undefined }) }));
const noop = async () => ({});
vi.mock("@/lib/supabase/subtask-actions", () => ({ listSubtasks: noop, saveSubtask: noop, setSubtaskDone: noop, setSubtaskOccurrenceDone: noop, setSubtaskPriority: noop, deleteSubtask: noop, moveSubtask: noop, rescheduleSubtaskAction: noop }));
vi.mock("@/lib/supabase/personal-actions", () => new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : noop) }));
vi.mock("@/lib/supabase/clt-actions", () => ({ rescheduleCltTaskAction: noop, toggleCltTaskOccurrenceAction: noop, toggleCltTaskStatusAction: noop }));
vi.mock("@/lib/supabase/work-items-actions", () => ({ updateWorkItemStatusAction: noop }));

const { MyDayBoardView } = await import("@/components/hoje/my-day-board");
const { TarefasPageClient } = await import("@/components/tarefas/tarefas-page-client");
const { SubtaskChecklist } = await import("@/components/shared/subtask-checklist");
const { Subtasks } = await import("@/components/shared/subtasks");
const { buildMyDayBoard } = await import("./my-day-board");
const { todayKeySaoPaulo } = await import("./format");
const { addDaysToKey, weekdayOfKey } = await import("./tasks");

const TODAY = todayKeySaoPaulo();
const WD = weekdayOfKey(TODAY);
const task = (over: Partial<Task> = {}): Task => ({
  id: "vs", space_id: "s", user_id: "u", title: "VS Planner", description: null, kind: "organizadora", due_date: null, scheduled_time: null,
  location: null, priority: "normal", status: "pendente", category: null, notes: null, recurrence: "none", weekdays: [],
  recurrence_start: null, recurrence_until: null, archived_at: null, completed_at: null, created_at: "", updated_at: "", ...over,
});
const sub = (over: Partial<Subtask>): Subtask => ({ id: "s", parent_type: "pessoal", parent_id: "vs", user_id: "u", title: "Sub", due_date: null, is_done: false, position: 0, parent_subtask_id: null, ...over });
const routine = sub({ id: "rotina", title: "Verificar e atualizar o VS Planner", recurrence: "weekly", weekdays: [WD], recurrence_start: addDaysToKey(TODAY, -7), occurrences: [] });
const etapa = sub({ id: "melhorias", title: "Atualizações pendentes do VS Planner", position: 1, scheduled_date: TODAY });
const items = [
  sub({ id: "c1", parent_subtask_id: "melhorias", title: "Corrigir duplicações", is_done: true, position: 0 }),
  sub({ id: "c2", parent_subtask_id: "melhorias", title: "Expandir todas", position: 1 }),
  sub({ id: "c3", parent_subtask_id: "melhorias", title: "Prioridade nos itens", priority: "importante", position: 2 }),
];
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;

describe("10–12. checklist da subtarefa no Meu Dia", () => {
  const all = [routine, etapa, ...items];
  const board = buildMyDayBoard({ todayKey: TODAY, tasks: [task()], occurrences: [], subtasks: [routine, etapa], activities: [] });
  const html = renderToStaticMarkup(<MyDayBoardView board={board} todayKey={TODAY} subtasksByTask={{ vs: all }} onEditTask={() => {}} />);

  it("subtarefa com checklist mostra o progresso (1/3) e tem botão de expandir separado do checkbox", () => {
    expect(html).toContain("Checklist <span class=\"tabular-nums text-foreground\">1/3</span> concluídos");
    expect(html).toContain("Ver detalhes");
    expect(html).toContain("Concluir: Atualizações pendentes do VS Planner");
  });
  it("rotina recorrente aparece hoje dentro do VS Planner (sem checklist) e Expandir/Recolher todas existem", () => {
    expect(html).toContain("Verificar e atualizar o VS Planner");
    expect(html).toContain("Subtarefas de VS Planner");
    expect(html).toContain("Expandir todas");
    expect(html).toContain("Recolher todas");
    expect(html).toContain("Também ficou pendente em");
  });
  it("checklist expandido: itens com checkbox, importantes primeiro, progresso e itens pendentes destacados", () => {
    const list = renderToStaticMarkup(<SubtaskChecklist parentType="pessoal" parentId="vs" items={items} blocking={["c2", "c3"]} />);
    expect(list).toContain("1/3 concluídos");
    expect(list.indexOf("Prioridade nos itens")).toBeLessThan(list.indexOf("Corrigir duplicações"));
    expect(count(list, /type="checkbox"/g)).toBe(3);
    expect(count(list, />Falta</g)).toBe(2);
    expect(list).toContain("Só importantes");
  });
});

describe("13–14. página Tarefas: card único e pendências legítimas com data", () => {
  const recurringParent = task({ kind: "dia", recurrence: "weekly", weekdays: [0, 1, 2, 3, 4, 5, 6], recurrence_start: addDaysToKey(TODAY, -3) });
  const html = renderToStaticMarkup(<TarefasPageClient tasks={[recurringParent]} occurrences={[]} todayKey={TODAY} subtasksByTask={{}} />);
  it("recorrente com 3 dias pendentes + hoje = UM card, com as 3 datas pendentes dentro (cada uma com checkbox)", () => {
    expect(count(html, /<article/g)).toBe(1);
    expect(html).toContain("Execuções anteriores pendentes");
    expect(count(html, /aria-label="Concluir VS Planner de /g)).toBe(3);
    expect(html).toContain("+3 dias pendentes");
    expect(html).toContain("Ver histórico de execuções");
    expect(html).toContain("Expandir todas");
  });
  it("organizadora fica na seção Organizadoras, sem checkbox e sem 'atrasada'", () => {
    const org = renderToStaticMarkup(<TarefasPageClient tasks={[task()]} occurrences={[]} todayKey={TODAY} subtasksByTask={{ vs: [routine, etapa, ...items] }} />);
    expect(org).toContain("Organizadoras");
    expect(org).toContain("Organizadora · sem dia fixo");
    expect(org).not.toContain("Concluir: VS Planner");
    expect(org).not.toMatch(/Atrasadas<\/h2>/);
  });
});

describe("subtarefa recorrente no componente de subtarefas", () => {
  it("mostra os dias da repetição, o dia pendente com a própria data e o botão de histórico", () => {
    const html = renderToStaticMarkup(<Subtasks parentType="pessoal" parentId="vs" initialItems={[routine, etapa, ...items]} initialOpen />);
    expect(html).toContain("Pendente:");
    expect(html).toContain(`Concluir Verificar e atualizar o VS Planner de `);
    expect(html).toContain("Ver histórico de execuções");
  });
  it("sem destaques do dia, a lista completa abre com o filtro de prioridade dos checklists", () => {
    const html = renderToStaticMarkup(<Subtasks parentType="pessoal" parentId="vs" initialItems={[{ ...etapa, scheduled_date: null }, ...items]} initialOpen />);
    expect(html).toContain("Importantes primeiro");
    expect(html).toContain("Importantes</button>");
    expect(html).toContain("Checklist <span class=\"tabular-nums\">1/3</span>");
  });
});
