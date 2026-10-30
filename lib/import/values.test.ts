import { describe, expect, it } from "vitest";
import { parseBrDate, parseBrDateTime, parseBrInteger, parseBrNumber, parseBrPeriod, sameName } from "./values";

describe("valores pt-BR", () => {
  it("moeda e números", () => {
    expect(parseBrNumber("R$ 9.360,00")).toBe(9360);
    expect(parseBrNumber("R$ 206,22")).toBe(206.22);
    expect(parseBrNumber("1.234")).toBe(1234);
    expect(parseBrNumber("1.234.567,8")).toBe(1234567.8);
    expect(parseBrNumber("15.5")).toBe(15.5);
    expect(parseBrNumber(37)).toBe(37);
    expect(parseBrNumber("0")).toBe(0);
  });
  it("ausente é null, nunca zero", () => {
    for (const v of [null, undefined, "", "—", "-", "não informado"]) expect(parseBrNumber(v)).toBeNull();
  });
  it("lixo é inválido (undefined)", () => {
    expect(parseBrNumber("abc")).toBeUndefined();
    expect(parseBrNumber("12,3,4")).toBeUndefined();
    expect(parseBrInteger("2,5")).toBeUndefined();
    expect(parseBrInteger("-3")).toBeUndefined();
  });
  it("datas", () => {
    expect(parseBrDate("15/10/26")).toBe("2026-10-15");
    expect(parseBrDate("15/10/2026")).toBe("2026-10-15");
    expect(parseBrDate("2026-10-15T10:20:00")).toBe("2026-10-15");
    expect(parseBrDate("31/02/2026")).toBeUndefined();
    expect(parseBrDateTime("15/10/2026 10:20")).toBe("2026-10-15T10:20:00");
    expect(parseBrDateTime("2026-10-15T10:20:00")).toBe("2026-10-15T10:20:00");
    expect(parseBrPeriod("30/09/2026 a 29/10/2026")).toEqual({ start: "2026-09-30", end: "2026-10-29" });
    expect(parseBrPeriod("29/10/2026 a 30/09/2026")).toBeUndefined();
  });
  it("comparação de nomes é exata (sem aproximação)", () => {
    expect(sameName("Cabo Frio | + | 15/10/26", "cabo frio |+| 15/10/26")).toBe(true);
    expect(sameName("São Pedro", "Sao Pedro")).toBe(true);
    expect(sameName("Cabo Frio", "Cabo Frio 2")).toBe(false);
  });
});
