import { describe, expect, it } from "vitest";
import { parseImportInput } from "./parse";
import { adInfoRows, normalizeInfoForm } from "@/lib/clt/registered-info";

const bundleOf = (content: string) => {
  const r = parseImportInput(content);
  if (!r.ok) throw new Error(r.error);
  return r.bundle;
};

const TEXT = `Campanha: SGIV | Vídeo
Conjunto: Engajados
Anúncio: Reels 01
Link do Instagram: https://www.instagram.com/p/ABC123/
Link do Reels: https://www.instagram.com/reel/XYZ789/
Link do Facebook: https://www.facebook.com/sgiv/posts/1
URL de destino: https://sgiv.com.br/matriculas
Destino: WhatsApp
Texto principal: Matrículas abertas! 🎉
Garanta sua vaga: 50% de desconto na 1ª mensalidade.

#educação #CaboFrio
Descrição: Últimas vagas
Título: Volta às aulas`;

describe("links e textos das publicações na Importação Inteligente", () => {
  it("texto: cada link vai para o próprio campo (publicação ≠ destino) e o texto longo mantém linhas, emojis e hashtags", () => {
    const b = bundleOf(TEXT);
    const info = b.campaigns[0].adSets[0].ads[0].info!;
    expect(info).toMatchObject({
      instagram_url: "https://www.instagram.com/p/ABC123/",
      reels_url: "https://www.instagram.com/reel/XYZ789/",
      facebook_url: "https://www.facebook.com/sgiv/posts/1",
      destination_url: "https://sgiv.com.br/matriculas",
      destination: "WhatsApp",
      primary_text: "Matrículas abertas! 🎉\nGaranta sua vaga: 50% de desconto na 1ª mensalidade.\n\n#educação #CaboFrio",
      description: "Últimas vagas",
      headline: "Volta às aulas",
    });
    expect(b.problems).toEqual([]);
  });

  it("JSON: mesmos campos", () => {
    const b = bundleOf(JSON.stringify({ campaigns: [{ name: "C", ad_sets: [{ name: "S", ads: [{ name: "A", instagram_url: "https://instagram.com/p/1", reels_url: "https://instagram.com/reel/2", facebook_url: "https://facebook.com/3", destination_url: "https://site.com", primary_text: "Linha 1\nLinha 2 ✨" }] }] }] }));
    expect(b.campaigns[0].adSets[0].ads[0].info).toMatchObject({ instagram_url: "https://instagram.com/p/1", reels_url: "https://instagram.com/reel/2", facebook_url: "https://facebook.com/3", destination_url: "https://site.com", primary_text: "Linha 1\nLinha 2 ✨" });
  });

  it("tela do anúncio: links com Abrir/Copiar e descrição com Copiar", () => {
    const rows = adInfoRows({ name: "A", instagram_url: "https://instagram.com/p/1", destination_url: "https://site.com", description: "Texto" });
    const by = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(by.instagram_url).toMatchObject({ copy: true, href: "https://instagram.com/p/1" });
    expect(by.destination_url).toMatchObject({ label: "URL de destino do anúncio", href: "https://site.com/" });
    expect(by.reels_url.value).toBeNull();
    expect(by.description.copy).toBe(true);
  });

  it("edição manual valida os links", () => {
    expect(normalizeInfoForm("ad", { reels_url: "https://instagram.com/reel/9", facebook_url: "" })).toEqual({ update: { reels_url: "https://instagram.com/reel/9", facebook_url: null } });
    expect(normalizeInfoForm("ad", { instagram_url: "javascript:alert(1)" })).toEqual({ update: { instagram_url: "javascript:alert(1)" } });
  });
});
