import { describe, expect, it } from "vitest";
import { INFO_FIELDS, type InfoLevel } from "@/lib/clt/registered-info";
import { parseImportInput } from "./parse";
import { parseTaskImport } from "./tasks";
import { AD_FIELDS, AD_SET_FIELDS, CAMPAIGN_FIELDS, RESULT_FIELDS, importTemplates } from "./templates";
import { EXTRA_IMPORT_KEYS, METRIC_KEYS, type ImportBundle } from "./types";

/**
 * Modelos dinâmicos: CADA campo que aparece no modelo precisa ser lido e
 * chegar ao lugar certo (nada aparece no exemplo e é ignorado ao importar),
 * e cada campo aceito pela importação precisa aparecer em algum modelo.
 */
const TODAY = "2026-11-17";
const bundle = (content: string): ImportBundle => {
  const r = parseImportInput(content);
  if (!r.ok) throw new Error(r.error);
  return r.bundle;
};
const IGNORED = /desconhecido|não reconhecid|fora de contexto|ignorado/i;

describe("cobertura: todo campo aceito está num modelo", () => {
  it("todas as informações cadastradas (campanha, conjunto, anúncio)", () => {
    const sources = new Set([...CAMPAIGN_FIELDS, ...AD_SET_FIELDS, ...AD_FIELDS].map((f) => f.source ?? f.saves));
    const skipped = ["campaign.description", "adSet.age_max"]; // Observações (bloco da campanha) e Idade (faixa única)
    for (const level of Object.keys(INFO_FIELDS) as InfoLevel[]) {
      for (const f of INFO_FIELDS[level]) {
        if (skipped.includes(`${level}.${f.column}`)) continue;
        expect(sources.has(`info:${level}.${f.column}`), `${level}.${f.column} fora do modelo`).toBe(true);
      }
    }
  });
  it("todas as métricas (principais, engajamento, vídeo, taxas e tempo médio)", () => {
    const sources = new Set(RESULT_FIELDS.map((f) => f.source));
    for (const k of [...METRIC_KEYS, ...EXTRA_IMPORT_KEYS]) expect(sources.has(`metric:${k}`), `${k} fora do modelo`).toBe(true);
  });
});

describe("campanhas, conjuntos e anúncios: o modelo volta inteiro na leitura", () => {
  for (const t of importTemplates("clt", "campanhas")) {
    for (const format of ["text", "json"] as const) {
      it(`${t.label} (${format})`, () => {
        const b = bundle(format === "text" ? t.text : t.json);
        expect(b.problems.filter((p) => IGNORED.test(p.message))).toEqual([]);
        expect(b.problems.filter((p) => p.level !== "warning")).toEqual([]);
        const c = b.campaigns[0];
        const set = c.adSets[0];
        const ad = set.ads[0];
        expect(c).toMatchObject({ name: "SGIV | WhatsApp | Novembro", metaId: "120210000000000001", objective: "Mensagens no WhatsApp", dailyBudget: 20, startsOn: "2026-11-05", endsOn: "2026-11-30", status: "Ativa", notes: "Campanha de matrículas." });
        for (const f of CAMPAIGN_FIELDS.filter((x) => x.source?.startsWith("info:"))) expect(c.info?.[f.source!.split(".")[1]], f.saves).toBeTruthy();
        if (t.id === "conjuntos") {
          expect(set).toMatchObject({ name: "Engajados 365D | WhatsApp", metaId: "120210000000000002", audienceName: "Engajados 365D" });
          if (format === "json") expect(set.resultType).toBe("mensagens");
          for (const f of AD_SET_FIELDS.filter((x) => x.source?.startsWith("info:"))) {
            const col = f.source!.split(".")[1];
            // Posicionamentos no texto ficam no próprio conjunto (mesma coluna).
            const v = set.info?.[col] ?? (col === "placements" ? set.placements : undefined);
            expect(v, f.saves).toBeTruthy();
          }
        }
        if (t.id === "anuncios") {
          expect(ad).toMatchObject({ name: "Vídeo 01 | Oferta", metaId: "120210000000000003", format: "video" });
          for (const f of AD_FIELDS.filter((x) => x.source?.startsWith("info:"))) expect(ad.info?.[f.source!.split(".")[1]], f.saves).toBeTruthy();
          expect(ad.info?.instagram_url).not.toBe(ad.info?.destination_url);
        }
      });
    }
  }
});

describe("resultados: todas as métricas do modelo são gravadas", () => {
  const [t] = importTemplates("clt", "resultados");
  for (const format of ["text", "json"] as const) {
    it(format, () => {
      const b = bundle(format === "text" ? t.text : t.json);
      expect(b.problems).toEqual([]);
      expect(b.metricsPeriod).toEqual({ start: "2026-11-01", end: "2026-11-07" });
      const ad = b.campaigns[0].adSets[0].ads[0];
      for (const k of METRIC_KEYS) expect(ad.metrics[k], k).not.toBeNull();
      for (const k of EXTRA_IMPORT_KEYS) expect(ad.extraMetrics?.[k], k).not.toBeUndefined();
      expect(ad.extraMetrics).toMatchObject({ hook_rate: 35.75, hold_rate: 12.4, saves: 58, video_p25: 4100, video_p95: 980, avg_watch_time: 6.5, thruplays: 2300 });
    });
  }
});

describe("públicos", () => {
  const [t] = importTemplates("clt", "publicos");
  it.each(["text", "json"] as const)("%s", (format) => {
    const b = bundle(format === "text" ? t.text : t.json);
    expect(b.problems.filter((p) => IGNORED.test(p.message))).toEqual([]);
    expect(b.audiences.map((a) => a.type)).toEqual(["custom", "lookalike", "saved"]);
  });
});

describe("tarefas, subtarefas e checklists (Pessoal e CLT)", () => {
  for (const area of ["pessoal", "clt"] as const) {
    for (const t of importTemplates(area, "tarefas")) {
      for (const format of ["text", "json"] as const) {
        it(`${area} · ${t.label} (${format})`, () => {
          const r = parseTaskImport(format === "text" ? t.text : t.json, "tarefas", TODAY);
          if (!r.ok) throw new Error(r.error);
          expect(r.drafts.flatMap((d) => d.problems)).toEqual([]);
          const d = r.drafts[0];
          expect(d.title).toBe("Fazer posts da Semear");
          if (area === "clt") expect(d.companyName).toBe("SGIV");
          else expect(d.companyName).toBeUndefined();
          expect(d.subtasks.length).toBeGreaterThan(1);
          expect(d.subtasks[0]).toMatchObject({ title: "Editar post", scheduledDate: "2026-11-17" });
          if (t.id !== "subtarefas") expect(d.subtasks[0].children[0]).toMatchObject({ title: "Revisar legenda", priority: "importante" });
          if (t.id === "tarefas_pessoais" || t.id === "tarefas_clt") {
            expect(d).toMatchObject({ priority: "importante", executionDate: "2026-11-17", time: "09:00", deadlineDate: "2026-11-20", description: "Posts de novembro.", notes: "Usar as fotos novas." });
            expect(r.drafts[1].weekdays).toEqual([1, 3, 5]);
          }
        });
      }
    }
  }
});
