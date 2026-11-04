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
ID da campanha: 120210000000000001
Estratégia de lances: Volume mais alto
Tipo de compra: Leilão

Conjunto: Engajados 365D | WhatsApp
ID do conjunto: 120210000000000002
Público: Engajados 365D
Localização: Cabo Frio, RJ
Raio: 10 km
Idade: 25-55
Idioma: Português
Posicionamentos: Feed e Stories do Instagram
Local da conversão: WhatsApp
Objetivo de desempenho: Maximizar o número de conversas

Anúncio: Vídeo 01 | Oferta
ID do anúncio: 120210000000000003
Formato: Vídeo
Link: https://www.instagram.com/p/EXEMPLO1/
Texto principal: Garanta sua vaga com condição especial de novembro.
Título: Oferta de novembro
Chamada para ação: Enviar mensagem
Destino: WhatsApp

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
      meta_campaign_id: "120210000000000001",
      objective: "engagement_to_whatsapp",
      daily_budget_brl: 20,
      bid_strategy: "Volume mais alto",
      buying_type: "Leilão",
      ad_sets: [
        {
          name: "Engajados 365D | WhatsApp",
          meta_adset_id: "120210000000000002",
          audience_external_key: "sgiv_engajados_365",
          start_at_local: "2026-11-05T09:00:00",
          scheduled_end_at_local: "2026-11-30T23:59:00",
          location: "Cabo Frio, RJ",
          radius_km: 10,
          age_range: [25, 55],
          languages: "Português",
          placements: ["Feed do Instagram", "Stories do Instagram"],
          conversion_location: "WhatsApp",
          performance_goal: "Maximizar o número de conversas",
          ads: [
            {
              name: "Vídeo 01 | Oferta",
              meta_ad_id: "120210000000000003",
              format: "video",
              link: "https://www.instagram.com/p/EXEMPLO1/",
              primary_text: "Garanta sua vaga com condição especial de novembro.",
              headline: "Oferta de novembro",
              call_to_action: "Enviar mensagem",
              destination: "WhatsApp",
            },
            { name: "Imagem 01 | Depoimento", format: "image" },
          ],
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
