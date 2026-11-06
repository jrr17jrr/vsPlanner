import { describe, expect, it } from "vitest";
import { activeLinksIndex, canPayWithPersonalAccounts, findPersonalDuplicateCandidates } from "./personal-link";
import type { FinancialPersonalLink } from "@/types/database.types";

describe("canPayWithPersonalAccounts", () => {
  const biz = { owner_id: "jr", type: "business" as const };
  it("libera para o dono do espaço e para o perfil do Ricardo Júnior", () => {
    expect(canPayWithPersonalAccounts({ id: "jr", name: "Qualquer" }, biz)).toBe(true);
    expect(canPayWithPersonalAccounts({ id: "x", name: "Ricardo Júnior" }, biz)).toBe(true);
  });
  it("não mostra contas pessoais para outros membros nem no próprio Pessoal", () => {
    expect(canPayWithPersonalAccounts({ id: "g", name: "Guilherme" }, biz)).toBe(false);
    expect(canPayWithPersonalAccounts({ id: "jr", name: "Júnior" }, { owner_id: "jr", type: "personal" })).toBe(false);
  });
});

describe("findPersonalDuplicateCandidates", () => {
  const pays = [
    { id: "a", amount: 103.4, payment_date: "2026-11-06", account_id: "nubank" },
    { id: "b", amount: 103.4, payment_date: "2026-11-01", account_id: "nubank" },
    { id: "c", amount: 103.4, payment_date: "2026-11-06", account_id: "inter" },
    { id: "d", amount: 103.41, payment_date: "2026-11-06", account_id: "nubank" },
    { id: "e", amount: 103.4, payment_date: "2026-10-01", account_id: "nubank" },
    { id: "f", amount: 103.4, payment_date: "2026-11-07", account_id: "nubank" },
  ];
  it("acha mesma conta + mesmo valor + data próxima, sem os já vinculados, do mais próximo ao mais distante", () => {
    const r = findPersonalDuplicateCandidates({ amount: 103.4, payment_date: "2026-11-06" }, "nubank", pays, new Set(["f"]));
    expect(r.map((p) => p.id)).toEqual(["a", "b"]);
  });
});

describe("activeLinksIndex", () => {
  it("indexa só vínculos ativos", () => {
    const base = { business_payment_id: "bp", personal_payment_id: "pp" } as FinancialPersonalLink;
    const idx = activeLinksIndex([{ ...base, id: "1", status: "estornado" }, { ...base, id: "2", status: "ativo" }]);
    expect(idx.byBusinessPayment.get("bp")?.id).toBe("2");
    expect(idx.byPersonalPayment.get("pp")?.id).toBe("2");
    expect(activeLinksIndex([{ ...base, id: "1", status: "desvinculado" }]).byBusinessPayment.size).toBe(0);
  });
});
