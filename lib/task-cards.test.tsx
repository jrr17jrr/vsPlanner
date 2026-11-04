import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Subtask } from "./task-schedule";
import type { Task } from "@/types/database.types";

/**
 * Renderização das páginas Tarefas e Meu Dia (SSR, sem navegador): card
 * único por tarefa principal, subtarefas dentro dele, barra de progresso só
 * com subtarefas e agrupamentos do Meu Dia em um card.
 */
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined, push: () => undefined }) }));
const noop = async () => ({});
vi.mock("@/lib/supabase/subtask-actions", () => ({ listSubtasks: noop, saveSubtask: noop, setSubtaskDone: noop, deleteSubtask: noop, moveSubtask: noop, rescheduleSubtaskAction: noop }));
vi.mock("@/lib/supabase/personal-actions", () => new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : noop) }));
vi.mock("@/lib/supabase/clt-actions", () => ({ rescheduleCltTaskAction: noop, toggleCltTaskOccurrenceAction: noop, toggleCltTaskStatusAction: noop }));
vi.mock("@/lib/supabase/work-items-actions", () => ({ updateWorkItemStatusAction: noop }));

const { DayTaskItem } = await import("@/components/tarefas/day-task-item");
const { TarefasPageClient } = await import("@/components/tarefas/tarefas-page-client");
const { MyDayBoardView } = await import("@/components/hoje/my-day-board");
const { buildMyDayBoard } = await import("./my-day-board");
const { todayKeySaoPaulo } = await import("./format");

const TODAY = todayKeySaoPaulo();
const task = (over: Partial<Task> = {}): Task => ({
  id: "t1", space_id: "s", user_id: "u", title: "VS Planner", description: null, kind: "dia", due_date: TODAY, scheduled_time: "18:00:00",
  location: null, priority: "normal", status: "pendente", category: null, notes: null, recurrence: "none", weekdays: [],
  recurrence_start: null, recurrence_until: null, archived_at: null, completed_at: null, created_at: "", updated_at: "", ...over,
});
const sub = (over: Partial<Subtask>): Subtask => ({ id: "s", parent_type: "pessoal", parent_id: "t1", user_id: "u", title: "Sub", due_date: null, is_done: false, position: 0, parent_subtask_id: null, ...over });
const SUBS = [sub({ id: "a", title: "Banco de dados", is_done: true }), sub({ id: "b", title: "Tela de login", position: 1 }), sub({ id: "c", title: "Deploy", position: 2, due_date: "2020-01-01" })];
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;

describe("Tarefas: card único por tarefa", () => {
  const entry = { key: "t1", task: task(), date: TODAY, title: "VS Planner", time: "18:00", location: null, notes: null, important: false, recurring: false, overdue: false, deadlineDate: null, deadlineTime: null, deadlineOverdue: false } as never;

  it("cabeçalho (checkbox, horário, título, ações) e subtarefas no MESMO card", () => {
    const html = renderToStaticMarkup(<DayTaskItem entry={entry} subtasks={SUBS} done={false} onToggle={() => {}} onEdit={() => {}} onDelete={() => {}} />);
    expect(count(html, /<article/g)).toBe(1);
    const article = html.slice(html.indexOf("<article"), html.lastIndexOf("</article>"));
    expect(article).toContain('aria-label="Concluir: VS Planner"');
    expect(article).toContain(">18:00<");
    expect(article).toContain('aria-label="Mais ações: VS Planner"');
    // Contagem concluídas/total, barra discreta e atrasadas — dentro do card.
    expect(article).toContain("1/3");
    expect(article).toContain('role="progressbar"');
    expect(article).toContain("1 atrasada");
    // Sem a caixa antiga de subtarefas (card dentro de card).
    expect(article).not.toContain("rounded-lg border border-border/70 p-2");
  });

  it("sem subtarefas: nada de barra de progresso nem contagem", () => {
    const html = renderToStaticMarkup(<DayTaskItem entry={entry} subtasks={[]} done={false} onToggle={() => {}} />);
    expect(html).not.toContain('role="progressbar"');
    expect(html).not.toContain("0/0");
    expect(html).toContain("Adicionar subtarefas");
  });

  it("página Tarefas: uma tarefa = um card; seções com contagem e espaçamento de 12px", () => {
    const html = renderToStaticMarkup(
      <TarefasPageClient tasks={[task(), task({ id: "t2", title: "Academia", scheduled_time: "07:00:00" })]} occurrences={[]} todayKey={TODAY} subtasksByTask={{ t1: SUBS }} />
    );
    expect(count(html, /<article/g)).toBe(2);
    expect(html).toContain("flex flex-col gap-3");
    expect(html).toMatch(/Hoje<span[^>]*>2<\/span>/);
  });
});

describe("Meu Dia: agrupamentos", () => {
  const view = (b: ReturnType<typeof buildMyDayBoard>, subtasksByTask: Record<string, Subtask[]> = {}) =>
    renderToStaticMarkup(<MyDayBoardView board={b} todayKey={TODAY} subtasksByTask={subtasksByTask} onEditTask={() => {}} />);

  it("tarefa principal + subtarefas de hoje = UM card, subtarefas recuadas com linha lateral", () => {
    const subs = [sub({ id: "x", title: "Tela de login", scheduled_date: TODAY }), sub({ id: "y", title: "Deploy", scheduled_date: TODAY, position: 1 })];
    const b = buildMyDayBoard({ todayKey: TODAY, tasks: [task()], occurrences: [], subtasks: subs, activities: [] });
    const html = view(b, { t1: subs });
    const group = html.slice(html.indexOf('aria-labelledby="meu-dia-hoje"'), html.indexOf('aria-labelledby="meu-dia-atrasadas"'));
    expect(group).toContain('aria-label="Subtarefas de VS Planner"');
    // Os três checkboxes (pai + 2 subtarefas) dentro do mesmo <li> de card.
    const li = group.slice(group.indexOf("<li"), group.lastIndexOf("</li>"));
    expect(count(li, /role="checkbox"/g)).toBe(3);
    expect(li).toContain("border-l-2");
    expect(group).toContain("flex flex-col gap-3");
  });

  it("pai fora da seção aparece só como contexto (tracejado, sem checkbox)", () => {
    const subs = [sub({ id: "x", title: "Tela de login", scheduled_date: TODAY })];
    const b = buildMyDayBoard({ todayKey: TODAY, tasks: [task({ due_date: null, scheduled_time: null, kind: "prazo" })], occurrences: [], subtasks: subs, activities: [] });
    const html = view(b, { t1: subs });
    expect(html).toContain("Contexto · tarefa principal");
    expect(html).toContain("border-dashed");
    expect(html).toContain('aria-label="Concluir: Tela de login"');
    expect(html).not.toContain('aria-label="Concluir: VS Planner"');
  });
});
