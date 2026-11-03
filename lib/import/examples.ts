/**
 * Exemplos editáveis da Central de Importação para campanhas, públicos e
 * resultados (motor do importador inteligente). Testados em
 * lib/import/examples.test.ts — todos passam pela leitura e pela validação.
 */

export type SmartImportType = "campanhas" | "publicos" | "resultados";

const CAMPAIGN_TEXT = `Empresa: SGIV

Público personalizado: Engajados 365D
Retenção: 365

---

Campanha: SGIV | WhatsApp | Novembro
Objetivo: Mensagens no WhatsApp
Orçamento diário: R$ 20,00
Início: 05/11/2026
Fim: 30/11/2026
Status: Ativa

Conjunto: Engajados 365D | WhatsApp
Público: Engajados 365D
Anúncio: Vídeo 01 | Oferta
Formato: Vídeo
Anúncio: Imagem 01 | Depoimento
Formato: Imagem`;

const AUDIENCE_TEXT = `Empresa: SGIV

Público personalizado: Engajados 365D
Origem: Instagram
Retenção: 365

---

Público semelhante: Semelhante 1% Engajados
Origem: Engajados 365D
Porcentagem: 1%

---

Público salvo: Cabo Frio | Amplo
Cidade: Cabo Frio
Raio: 10
Idade: 25-55`;

const RESULTS_TEXT = `Empresa: SGIV
Período: 01/11/2026 a 07/11/2026

Campanha: SGIV | WhatsApp | Novembro
Conjunto: Engajados 365D | WhatsApp
Anúncio: Vídeo 01 | Oferta
Investimento: R$ 140,00
Conversas: 18
Vendas: 3
Faturamento: R$ 2.400,00`;

const CAMPAIGN_JSON = JSON.stringify({
  schema_version: "1.0",
  audiences: [{ external_key: "sgiv_engajados_365", name: "Engajados 365D", type: "custom", retention_days: 365 }],
  campaigns: [
    {
      name: "SGIV | WhatsApp | Novembro",
      objective: "engagement_to_whatsapp",
      daily_budget_brl: 20,
      ad_sets: [
        {
          name: "Engajados 365D | WhatsApp",
          audience_external_key: "sgiv_engajados_365",
          start_at_local: "2026-11-05T09:00:00",
          scheduled_end_at_local: "2026-11-30T23:59:00",
          ads: [{ name: "Vídeo 01 | Oferta", format: "video" }, { name: "Imagem 01 | Depoimento", format: "image" }],
        },
      ],
    },
  ],
}, null, 2);

const AUDIENCE_JSON = JSON.stringify({
  schema_version: "1.0",
  audiences: [
    { external_key: "sgiv_engajados_365", name: "Engajados 365D", type: "custom", retention_days: 365, notes: "Engajou com o Instagram" },
    { external_key: "sgiv_lal_1", name: "Semelhante 1% Engajados", type: "lookalike", source: { audience_external_key: "sgiv_engajados_365", percentage: 1 } },
  ],
}, null, 2);

const RESULTS_JSON = JSON.stringify({
  schema_version: "1.0",
  metrics_period: { start: "2026-11-01", end: "2026-11-07" },
  campaigns: [
    {
      name: "SGIV | WhatsApp | Novembro",
      ad_sets: [
        {
          name: "Engajados 365D | WhatsApp",
          ads: [{ name: "Vídeo 01 | Oferta", metrics: { spend_brl: 140, whatsapp_conversations: 18, sales: 3, revenue_brl: 2400 } }],
        },
      ],
    },
  ],
}, null, 2);

export const SMART_EXAMPLES: Record<SmartImportType, { text: string; json: string }> = {
  campanhas: { text: CAMPAIGN_TEXT, json: CAMPAIGN_JSON },
  publicos: { text: AUDIENCE_TEXT, json: AUDIENCE_JSON },
  resultados: { text: RESULTS_TEXT, json: RESULTS_JSON },
};
