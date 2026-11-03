import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { InstagramFollowersCard } from "./instagram-followers-card";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/supabase/clt-followers-actions", () => ({ addInstagramFollowersAction: vi.fn(), updateInstagramFollowersAction: vi.fn() }));

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("Card de seguidores do Instagram", () => {
  it("mostra atual, anterior, crescimento e percentual (233 → 234)", () => {
    const html = renderToStaticMarkup(<InstagramFollowersCard companyId="c" available records={[
      { id: "1", company_id: "c", followers: 233, recorded_at: "2026-11-02T13:00:00Z" },
      { id: "2", company_id: "c", followers: 234, recorded_at: "2026-11-03T17:05:00Z" },
    ]} />);
    const t = text(html);
    expect(t).toContain("Seguidores atuais 234");
    expect(t).toContain("Seguidores anteriores 233");
    expect(t).toContain("Crescimento +1");
    expect(t).toContain("Crescimento percentual +0,43%");
    expect(t).toContain("Última atualização: 03/11/2026 às 14:05");
    expect(t).toContain("Atualizar seguidores");
  });

  it("queda aparece em vermelho", () => {
    const html = renderToStaticMarkup(<InstagramFollowersCard companyId="c" available records={[
      { id: "1", company_id: "c", followers: 234, recorded_at: "2026-11-02T13:00:00Z" },
      { id: "2", company_id: "c", followers: 230, recorded_at: "2026-11-03T13:00:00Z" },
    ]} />);
    expect(html).toMatch(/text-destructive[^>]*>.*−4/);
  });

  it("sem migration: avisa e não mostra o formulário", () => {
    const t = text(renderToStaticMarkup(<InstagramFollowersCard companyId="c" available={false} records={[]} />));
    expect(t).toContain("migração 20261103110000_clt_instagram_followers.sql pendente");
    expect(t).not.toContain("Atualizar seguidores");
  });
});
