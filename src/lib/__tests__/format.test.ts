import { describe, expect, it } from "vitest";

import {
  escalaAgradavel,
  inteiro,
  mesAno,
  mesAnoLongo,
  moeda,
  moedaCompacta,
  percentual,
  razaoSegura,
} from "@/lib/format";

/** Os espacos do Intl em pt-BR sao non-breaking; normaliza para comparar. */
const n = (s: string) => s.replace(/ /g, " ");

describe("moeda", () => {
  it("formata em pt-BR com separador de milhar", () => {
    expect(n(moeda(3111477.63))).toBe("R$ 3.111.477,63");
  });

  it("formata negativo com o sinal antes do simbolo", () => {
    expect(n(moeda(-634918.4))).toBe("-R$ 634.918,40");
  });
});

describe("moedaCompacta", () => {
  it("abrevia milhoes e milhares", () => {
    expect(n(moedaCompacta(3111477))).toBe("R$ 3,1 mi");
    expect(n(moedaCompacta(441193))).toBe("R$ 441,2 mil");
  });

  it("mostra valor cheio abaixo de mil", () => {
    expect(n(moedaCompacta(0))).toBe("R$ 0");
  });

  it("preserva o sinal negativo", () => {
    expect(n(moedaCompacta(-3111477))).toBe("-R$ 3,1 mi");
  });
});

describe("percentual", () => {
  it("recebe fracao, nao numero ja multiplicado", () => {
    expect(percentual(0.142)).toBe("14,2%");
  });

  it("nao devolve NaN", () => {
    expect(percentual(Number.NaN)).toBe("0,0%");
  });
});

describe("razaoSegura", () => {
  it("devolve zero em vez de dividir por zero", () => {
    expect(razaoSegura(10, 0)).toBe(0);
  });
});

describe("inteiro", () => {
  it("usa separador de milhar pt-BR", () => {
    expect(n(inteiro(8400))).toBe("8.400");
  });
});

describe("mesAno", () => {
  it('formata a chave "2026-09" como "Set/26"', () => {
    // O `month: "short"` do Intl pt-BR produz "set. de 26", comprido demais
    // para rotulo de eixo -- por isso a formatacao e manual.
    expect(mesAno("2026-09")).toBe("Set/26");
    expect(mesAno("2026-01")).toBe("Jan/26");
    expect(mesAno("2025-12")).toBe("Dez/25");
  });

  it("devolve a entrada quando ela nao e uma chave valida", () => {
    expect(mesAno("")).toBe("");
    expect(mesAno("2026-13")).toBe("2026-13");
  });
});

describe("mesAnoLongo", () => {
  it("escreve o mes por extenso, com inicial maiuscula", () => {
    expect(n(mesAnoLongo("2026-09"))).toBe("Setembro de 2026");
  });
});

describe("escalaAgradavel", () => {
  it("arredonda o passo para valor que o olho ancora", () => {
    // 3.484.855 / 4 = 871.213 -> passo vira 1.000.000
    const escala = escalaAgradavel(3_484_855);
    expect(escala.marcas).toEqual([0, 1_000_000, 2_000_000, 3_000_000, 4_000_000]);
    expect(escala.topo).toBe(4_000_000);
  });

  it("sempre cobre o maximo pedido", () => {
    for (const maximo of [1, 37, 950, 12_345, 999_999, 3_111_478]) {
      expect(escalaAgradavel(maximo).topo).toBeGreaterThanOrEqual(maximo);
    }
  });

  it("comeca no zero e respeita o numero de divisoes", () => {
    const escala = escalaAgradavel(1000, 5);
    expect(escala.marcas[0]).toBe(0);
    expect(escala.marcas).toHaveLength(6);
  });

  it("nao quebra com entrada invalida", () => {
    expect(escalaAgradavel(0).topo).toBe(1);
    expect(escalaAgradavel(Number.NaN).topo).toBe(1);
  });
});
