import { describe, expect, it } from "vitest";

import type { DemonstrativoResultado } from "@/lib/costing";
import { fecharMes, lerReais } from "@/lib/fechamento";

/** So o que `fecharMes` le da DRE. */
function dre(): DemonstrativoResultado {
  return {
    reconciliacao: { freteTransportadora: 50_000, receitaReal: 500_000, bruto: 1_000_000 },
    totalImpostos: 80_000,
    impostos: { difal: { total: 30_000 } },
    lucroOperacional: 100_000,
  } as unknown as DemonstrativoResultado;
}

describe("fecharMes", () => {
  it("sem fechamento, tudo é o calculado", () => {
    const f = fecharMes(dre(), null);
    expect(f.calculado).toEqual({ impostos: 50_000, difal: 30_000, frete: 50_000 });
    expect(f.usado).toEqual(f.calculado);
    expect(f).toMatchObject({ ajuste: 0, lucroOperacional: 100_000, totalImpostos: 80_000, temInformado: false });
    expect(f.margemOperacionalPercentual).toBeCloseTo(0.2);
  });

  it("o informado substitui o calculado e a diferença sai do lucro", () => {
    const f = fecharMes(dre(), { impostos: 60_000, difal: null, frete: 45_000 });
    expect(f.usado).toEqual({ impostos: 60_000, difal: 30_000, frete: 45_000 });
    expect(f.calculado.impostos).toBe(50_000);
    expect(f.ajuste).toBe(5_000);
    expect(f.lucroOperacional).toBe(95_000);
    expect(f.totalImpostos).toBe(90_000);
    expect(f.temInformado).toBe(true);
  });

  it("a pizza continua fechando no bruto: o que sobe numa fatia desce no lucro", () => {
    const base = fecharMes(dre(), null);
    const fechado = fecharMes(dre(), { impostos: 72_345.67, difal: 12_000, frete: 61_000 });
    const soma = (f: typeof base) => f.usado.impostos + f.usado.difal + f.usado.frete + f.lucroOperacional;
    expect(soma(fechado)).toBeCloseTo(soma(base), 6);
  });

  it("zero informado vale como informado, não como vazio", () => {
    const f = fecharMes(dre(), { impostos: null, difal: 0, frete: null });
    expect(f.usado.difal).toBe(0);
    expect(f.lucroOperacional).toBe(130_000);
  });

  it("fechamento pode virar o lucro em prejuízo", () => {
    const f = fecharMes(dre(), { impostos: 200_000, difal: null, frete: null });
    expect(f.lucroOperacional).toBe(-50_000);
  });
});

describe("lerReais", () => {
  it.each([
    ["12.345,67", 12345.67],
    ["12345,67", 12345.67],
    ["R$ 12.345", 12345],
    ["12345.67", 12345.67],
    ["12.345", 12345],
    ["1.234.567,8", 1234567.8],
    ["0", 0],
    [" 7 ", 7],
  ])("%s vira %s", (texto, esperado) => {
    expect(lerReais(texto)).toBe(esperado);
  });

  it("vazio é nulo; texto que não é número é NaN", () => {
    expect(lerReais("")).toBeNull();
    expect(lerReais("  ")).toBeNull();
    expect(lerReais("doze")).toBeNaN();
    expect(lerReais("12,34,56")).toBeNaN();
  });
});
