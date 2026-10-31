import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { isMissingDescriptionColumn, normalizeSubtaskDescription, pickImportedDescription, SUBTASK_DESCRIPTION_MAX } from "./subtask-description";
import { ExpandableDescription } from "@/components/shared/expandable-description";
import { ChecklistItem } from "@/components/shared/checklist-item";

const LONG = "Criar um público personalizado com pessoas que interagiram com o Instagram nos últimos 365 dias. Verificar se a conta correta está selecionada e acompanhar o tamanho do público.";

describe("descrição de subtarefas — regras", () => {
  it("undefined não mexe; vazio limpa; texto é aparado", () => {
    expect(normalizeSubtaskDescription(undefined)).toEqual({});
    expect(normalizeSubtaskDescription("   ")).toEqual({ value: null });
    expect(normalizeSubtaskDescription(null)).toEqual({ value: null });
    expect(normalizeSubtaskDescription("  abc \n")).toEqual({ value: "abc" });
  });
  it("aceita textos longos até o limite e recusa acima", () => {
    expect(normalizeSubtaskDescription("x".repeat(SUBTASK_DESCRIPTION_MAX)).value).toHaveLength(SUBTASK_DESCRIPTION_MAX);
    expect(normalizeSubtaskDescription("x".repeat(SUBTASK_DESCRIPTION_MAX + 1)).error).toBeTruthy();
  });
  it("reconhece a coluna ausente (migration pendente) sem confundir com outros erros", () => {
    expect(isMissingDescriptionColumn({ code: "PGRST204", message: "Could not find the 'description' column of 'task_subtasks' in the schema cache" })).toBe(true);
    expect(isMissingDescriptionColumn({ code: "42703", message: "column task_subtasks.description does not exist" })).toBe(true);
    expect(isMissingDescriptionColumn({ code: "42703", message: "column task_subtasks.foo does not exist" })).toBe(false);
    expect(isMissingDescriptionColumn({ code: "23505", message: "description duplicate" })).toBe(false);
    expect(isMissingDescriptionColumn(null)).toBe(false);
  });
  it("JSON de planejamento: aceita description ou descricao; arquivos antigos seguem sem descrição", () => {
    expect(pickImportedDescription({ title: "a", descricao: " texto " })).toBe("texto");
    expect(pickImportedDescription({ title: "a", description: "texto" })).toBe("texto");
    expect(pickImportedDescription({ title: "a" })).toBeUndefined();
    expect(pickImportedDescription("só título")).toBeUndefined();
    expect(pickImportedDescription({ descricao: 12 })).toBeUndefined();
  });
});

describe("descrição expansível — renderização", () => {
  it("sem descrição não renderiza nada", () => {
    expect(renderToStaticMarkup(<ExpandableDescription text={null} />)).toBe("");
    expect(renderToStaticMarkup(<ExpandableDescription text="   " />)).toBe("");
  });
  it("recolhida por padrão: botão com aria-expanded=false e texto oculto", () => {
    const html = renderToStaticMarkup(<ExpandableDescription text={LONG} />);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('type="button"');
    expect(html).not.toContain("365 dias");
  });
  it("no item de checklist, o botão de descrição é separado do checkbox", () => {
    const html = renderToStaticMarkup(<ChecklistItem title="Criar público" done={false} onToggle={() => {}} description={LONG} />);
    expect(html.match(/role="checkbox"/g)).toHaveLength(1);
    expect(html).toContain("Descrição");
    // O checkbox não envolve o botão de descrição.
    expect(html.indexOf('role="checkbox"')).toBeLessThan(html.indexOf("aria-expanded"));
    expect(html).toMatch(/<button[^>]*role="checkbox"[^>]*><\/button>/);
  });
  it("tarefas antigas (sem descrição) continuam iguais", () => {
    const html = renderToStaticMarkup(<ChecklistItem title="Antiga" done={false} onToggle={() => {}} />);
    expect(html).not.toContain("aria-expanded");
  });
});

describe("migration task_subtasks.description (Postgres embutido)", () => {
  it("é aditiva, idempotente e preserva subtarefas antigas", async () => {
    const db = new PGlite();
    await db.exec(`
      create table public.task_subtasks (id uuid primary key default gen_random_uuid(), title text not null, is_done boolean not null default false);
      insert into public.task_subtasks (title, is_done) values ('Antiga', true);
    `);
    const sql = readFileSync(join(__dirname, "../supabase/migrations/20261031100000_task_subtask_description.sql"), "utf8");
    await db.exec(sql);
    await db.exec(sql); // segunda vez não falha
    const old = (await db.query<{ title: string; is_done: boolean; description: string | null }>("select title, is_done, description from task_subtasks")).rows;
    expect(old).toEqual([{ title: "Antiga", is_done: true, description: null }]);
    await db.query("insert into task_subtasks (title, description) values ('Nova', $1)", [LONG]);
    await expect(db.query("insert into task_subtasks (title, description) values ('Grande', $1)", ["x".repeat(10001)])).rejects.toThrow();
    await db.close();
  });
});
