import { describe, expect, it } from "vitest";
import { formatMoneyPrecise } from "./format";
import { fmtMoney, formatMetric } from "./clt/result-metrics";

const nb = (s: string) => s.replace(/ /g, " ");

describe("formatMoneyPrecise (custo por ThruPlay e afins)", () => {
  it("R$ 155,89 / 39.691 ThruPlays = 0,00393 → R$ 0,004", () => {
    expect(nb(formatMoneyPrecise(155.89 / 39691))).toBe("R$ 0,004");
    expect(nb(fmtMoney(155.89 / 39691))).toBe("R$ 0,004");
    expect(nb(formatMetric(155.89 / 39691, "money"))).toBe("R$ 0,004");
  });
  it("valores a partir de R$ 0,01 não mudam", () => {
    expect(nb(formatMoneyPrecise(0.01))).toBe("R$ 0,01");
    expect(nb(formatMoneyPrecise(1234.5))).toBe("R$ 1.234,50");
    expect(nb(formatMoneyPrecise(0))).toBe("R$ 0,00");
  });
  it("valores bem pequenos ganham casas até aparecer um dígito", () => {
    expect(nb(formatMoneyPrecise(0.00012))).toBe("R$ 0,0001");
    expect(nb(formatMoneyPrecise(0.0095))).toBe("R$ 0,010");
  });
});
