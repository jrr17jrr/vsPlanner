import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SelectableOccurrence, SelectionBar } from "./routine-selection";
import { MyDayBoardView } from "@/components/hoje/my-day-board";
import { buildMyDayBoard } from "@/lib/my-day-board";
import type { Subtask } from "@/lib/task-schedule";
import type { Activity, Task } from "@/types/database.types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/supabase/personal-actions", () => ({}));
vi.mock("@/lib/supabase/subtask-actions", () => ({}));
vi.mock("@/lib/supabase/clt-actions", () => ({}));
vi.mock("@/lib/supabase/work-items-actions", () => ({}));
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const activity: Activity = { id: "a", space_id: "s", user_id: "u", title: "Academia", category: null, weekdays: [1, 3], start_time: "18:00:00", end_time: null, is_active: true, sort_order: 0, notes: null, created_at: "", updated_at: "" };

describe("Minha Rotina — modo Selecionar", () => {
  it("item selecionável: caixa de seleção (não de conclusão), mostra se repete", () => {
    const html = renderToStaticMarkup(<SelectableOccurrence occ={{ activity, date: "2026-11-02", completed: true }} title="Academia" selected onToggle={() => {}} showDate />);
    expect(html).toContain('role="checkbox"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain("Selecionar: Academia (seg, 02/11)");
    expect(text(html)).toContain("Repete: seg, qua");
    expect(html).not.toContain("line-through"); // seleção não risca nem conclui
  });
  it("barra: quantidade, selecionar/desmarcar todas, cancelar e excluir", () => {
    const t = text(renderToStaticMarkup(<SelectionBar count={3} visibleCount={5} allVisibleSelected={false} onSelectAll={() => {}} onClear={() => {}} onCancel={() => {}} onDelete={() => {}} />));
    for (const l of ["3 selecionadas", "Selecionar todas", "Desmarcar todas", "Cancelar", "Excluir selecionadas"]) expect(t).toContain(l);
  });
  it("sem nada selecionado, 'Excluir selecionadas' fica desativado", () => {
    const html = renderToStaticMarkup(<SelectionBar count={0} visibleCount={5} allVisibleSelected={false} onSelectAll={() => {}} onClear={() => {}} onCancel={() => {}} onDelete={() => {}} />);
    expect(html).toMatch(/disabled=""[^>]*>(<svg[\s\S]*?<\/svg>)?\s*Excluir selecionadas/);
  });
});

describe("Meu Dia — agrupamento na tela", () => {
  const task = (over: Partial<Task>): Task => ({ id: "t", space_id: "s", user_id: "u", title: "Tarefa", description: null, kind: "dia", due_date: null, scheduled_time: null, location: null, priority: "normal", status: "pendente", category: null, notes: null, recurrence: "none", weekdays: [], recurrence_start: null, recurrence_until: null, archived_at: null, completed_at: null, created_at: "", updated_at: "", ...over });
  const sub = (over: Partial<Subtask>): Subtask => ({ id: "s", parent_type: "pessoal", parent_id: "vs", user_id: "u", title: "Sub", due_date: null, is_done: false, position: 0, parent_subtask_id: null, ...over });
  const board = buildMyDayBoard({
    todayKey: "2026-11-02", occurrences: [], activities: [],
    tasks: [task({ id: "vs", title: "VS Planner", due_date: "2026-11-30" })],
    subtasks: [sub({ id: "m", title: "Adicionar novos campos para métricas de campanha", scheduled_date: "2026-11-02" })],
  });
  const html = renderToStaticMarkup(<MyDayBoardView board={board} todayKey="2026-11-02" subtasksByTask={{}} onEditTask={() => {}} />);
  const t = text(html);

  it("tarefa principal acima da subtarefa, como agrupamento recolhível", () => {
    expect(t.indexOf("VS Planner")).toBeLessThan(t.indexOf("Adicionar novos campos"));
    expect(t).toContain("Contexto · tarefa principal · 1 subtarefa");
    expect(html).toMatch(/aria-expanded="true" aria-controls="meu-dia-hoje-vs"/);
    expect(html).toContain('id="meu-dia-hoje-vs"');
    expect(t).not.toContain("↳ VS Planner"); // dentro do grupo, sem a linha solta
  });
  it("o agrupamento não tem caixa de concluir e não conta", () => {
    expect(html).not.toContain("Concluir: VS Planner");
    expect(html).toContain("Concluir: Adicionar novos campos para métricas de campanha");
    expect(t).toMatch(/Hoje\s+1\b/);
  });
});
