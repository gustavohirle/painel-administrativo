import { describe, expect, it } from "vitest";

import { baseDemonstracao } from "@/data/geradorPedidos";
import { despesasInfluencerIniciais, influencersIniciais, OPERACIONAL_MENSAL } from "@/data/seeds";
import { despesasQueCabem, ratearDespesas } from "@/lib/costing";
import { filtrarPorMes, mesesDisponiveis } from "@/lib/metrics";
import type { DespesaInfluencer, Influencer } from "@/types/dominio";
import type { Pedido } from "@/types/nuvemshop";

// O rateio so le data, marca e total do pedido.
function pedido(marca: string, total: number, created_at = "2026-09-10T12:00:00.000Z"): Pedido {
  return { marca, total: total.toFixed(2), created_at } as unknown as Pedido;
}

function influencer(id: string, marca: string, ativo = true): Influencer {
  return {
    id,
    nome: id,
    marca,
    percentual: 30,
    baseComissao: "bruto",
    regime: "lucro_presumido",
    anexoSimples: "II",
    uf: "GO",
    rbt12Manual: null,
    ativo,
    observacao: null,
    atualizadoEm: "2026-09-01T00:00:00.000Z",
  };
}

function despesa(parcial: Partial<DespesaInfluencer> = {}): DespesaInfluencer {
  return {
    id: "d1",
    influencerId: null,
    data: "2026-09-01",
    categoria: "outros",
    descricao: "Operacional",
    valor: 60_000,
    atualizadoEm: "2026-09-01T00:00:00.000Z",
    ...parcial,
  };
}

const soma = (lista: Array<{ valor: number }>) => lista.reduce((s, d) => s + d.valor, 0);

describe("ratearDespesas", () => {
  it("despesa própria passa igual, sem rateio", () => {
    const [unica] = ratearDespesas(
      [despesa({ influencerId: "a", valor: 500 })],
      [pedido("A", 100)],
      [influencer("a", "A")],
    );

    expect(unica).toMatchObject({ id: "d1", influencerId: "a", valor: 500, rateio: null });
  });

  it("compartilhada é dividida pelo faturamento bruto de cada marca", () => {
    const partes = ratearDespesas(
      [despesa()],
      [pedido("A", 300), pedido("A", 450), pedido("B", 250)],
      [influencer("a", "A"), influencer("b", "B")],
    );

    const a = partes.find((p) => p.influencerId === "a")!;
    const b = partes.find((p) => p.influencerId === "b")!;
    expect(a.valor).toBe(45_000); // 750 de 1.000
    expect(b.valor).toBe(15_000); // 250 de 1.000
    expect(a.rateio).toEqual({ despesaId: "d1", total: 60_000, fracao: 0.75 });
    expect(a.id).toBe("d1:a");
    expect(soma(partes)).toBe(60_000);
  });

  it("a soma das partes fecha no centavo, mesmo quando a divisão não é exata", () => {
    const partes = ratearDespesas(
      [despesa({ valor: 100 })],
      [pedido("A", 10), pedido("B", 10), pedido("C", 10)],
      [influencer("a", "A"), influencer("b", "B"), influencer("c", "C")],
    );

    expect(partes.map((p) => p.valor).sort()).toEqual([33.33, 33.33, 33.34]);
    expect(Math.round(soma(partes) * 100)).toBe(10_000);
  });

  it("usa o faturamento do mês da despesa, não o de outros meses", () => {
    const partes = ratearDespesas(
      [despesa()],
      [pedido("A", 100), pedido("B", 100), pedido("B", 10_000, "2026-08-10T12:00:00.000Z")],
      [influencer("a", "A"), influencer("b", "B")],
    );

    expect(partes.map((p) => p.valor)).toEqual([30_000, 30_000]);
  });

  it("influencer inativo, marca sem venda no mês e segundo influencer da marca não recebem parte", () => {
    const partes = ratearDespesas(
      [despesa()],
      [pedido("A", 100), pedido("B", 100), pedido("C", 100)],
      [
        influencer("a", "A"),
        influencer("a2", "A"), // mesma marca: o primeiro ativo manda
        influencer("b", "B", false),
        influencer("d", "D"), // marca sem venda
      ],
    );

    expect(partes.map((p) => p.influencerId)).toEqual(["a"]);
    expect(partes[0]!.valor).toBe(60_000);
  });

  it("mês sem faturamento não gera parte nenhuma", () => {
    expect(ratearDespesas([despesa()], [], [influencer("a", "A")])).toEqual([]);
  });

  it("compartilhada não dividida fica de fora das contas", () => {
    expect(despesasQueCabem([despesa()], [pedido("A", 100)], [influencer("a", "A")])).toEqual([]);
  });
});

describe("operacional semeado", () => {
  it("é só o operacional compartilhado, um por mês da base", () => {
    const { pedidos } = baseDemonstracao();
    const semeadas = despesasInfluencerIniciais();

    expect(semeadas.every((d) => d.influencerId === null && d.valor === OPERACIONAL_MENSAL)).toBe(true);
    expect(new Set(semeadas.map((d) => d.data.slice(0, 7)))).toEqual(new Set(mesesDisponiveis(pedidos)));
  });

  it("dividido entre as marcas, soma R$ 60 mil no mês e cada marca leva a sua parte", () => {
    const { pedidos } = baseDemonstracao();
    const influencers = influencersIniciais();
    const mes = mesesDisponiveis(pedidos)[0]!;
    const doMes = filtrarPorMes(pedidos, mes);
    const partes = ratearDespesas(despesasInfluencerIniciais(), pedidos, influencers);

    // O mês inteiro: exatamente o total cadastrado.
    expect(soma(despesasQueCabem(partes, doMes, influencers))).toBeCloseTo(OPERACIONAL_MENSAL, 2);

    // Por marca: as partes somam o mesmo total -- o relatório por marca fecha com o painel.
    const marcas = [...new Set(doMes.map((p) => p.marca))];
    const porMarca = marcas.map((marca) =>
      soma(despesasQueCabem(partes, doMes.filter((p) => p.marca === marca), influencers)),
    );
    expect(porMarca.reduce((s, v) => s + v, 0)).toBeCloseTo(OPERACIONAL_MENSAL, 2);
    expect(porMarca.every((v) => v > 0)).toBe(true);
  });
});
