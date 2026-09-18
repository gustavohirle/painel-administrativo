import { describe, expect, it } from "vitest";

import { baseDemonstracao } from "@/data/geradorPedidos";
import {
  aliquotasEstaduaisIniciais,
  custosIniciais,
  despesasInfluencerIniciais,
  impostosIniciais,
  influencersIniciais,
  OPERACIONAL_MENSAL,
  produtosIniciais,
  taxasPlataformaIniciais,
} from "@/data/seeds";
import { calcularCMV, montarDemonstrativo, ratearDespesas } from "@/lib/costing";
import { apurarImpostos } from "@/lib/impostos";
import { filtrarPorMes, mesesDisponiveis, reconciliar } from "@/lib/metrics";
import { apurarTaxasPlataforma } from "@/lib/plataforma";
import { apurarSimples } from "@/lib/simplesNacional";
import {
  estimarInfluencer,
  montarReferencia,
  regimeSugerido,
} from "@/lib/simulacaoInfluencer";
import { TETO_SIMPLES_NACIONAL } from "@/types/fiscal";

function cenario() {
  const { pedidos } = baseDemonstracao();
  const influencers = influencersIniciais();
  const impostos = impostosIniciais();
  const produtos = produtosIniciais(impostos, influencers);
  const aliquotas = aliquotasEstaduaisIniciais();
  const taxas = taxasPlataformaIniciais();
  const custos = custosIniciais();
  const despesas = despesasInfluencerIniciais();
  const mes = mesesDisponiveis(pedidos)[0]!;
  const pedidosDoMes = filtrarPorMes(pedidos, mes);

  const referencia = montarReferencia({
    mes,
    pedidosDoMes,
    todosOsPedidos: pedidos,
    influencers,
    custos,
    produtos,
    impostos: apurarImpostos(pedidosDoMes, pedidos, produtos, impostos, influencers, aliquotas),
    taxas,
    despesas,
  })!;

  return { pedidos, influencers, impostos, produtos, aliquotas, taxas, custos, despesas, mes, pedidosDoMes, referencia };
}

describe("montarReferencia", () => {
  it("tira as frações médias das marcas atuais", () => {
    const { referencia, pedidosDoMes } = cenario();
    const r = reconciliar(pedidosDoMes);

    // Tudo sem frete: ele e cobrado do cliente por fora.
    expect(referencia.brutoTotal).toBeCloseTo(r.brutoSemFrete, 2);
    expect(referencia.fracaoReceitaReal).toBeCloseTo(r.receitaReal / r.brutoSemFrete, 10);
    expect(referencia.despesasCompartilhadas).toBe(OPERACIONAL_MENSAL);
    expect(referencia.presumido).not.toBeNull();
    expect(referencia.simples).not.toBeNull();
    expect(referencia.coberturaCusto).toBeGreaterThan(0);
    expect(referencia.coberturaCusto).toBeLessThanOrEqual(1);
  });

  it("mês sem venda paga não tem referência", () => {
    const { referencia, ...c } = cenario();
    expect(
      montarReferencia({
        mes: "2020-01",
        pedidosDoMes: [],
        todosOsPedidos: c.pedidos,
        influencers: c.influencers,
        custos: c.custos,
        produtos: c.produtos,
        impostos: apurarImpostos([], c.pedidos, c.produtos, c.impostos, c.influencers, c.aliquotas),
        taxas: c.taxas,
        despesas: c.despesas,
      }),
    ).toBeNull();
    expect(referencia).not.toBeNull();
  });
});

describe("estimarInfluencer", () => {
  it("estimar o faturamento de uma marca do Presumido reproduz a DRE dela", () => {
    const c = cenario();
    // O simulador usa a base praticada (o que cai na conta); o contrato da
    // conferencia precisa usar a mesma, senao as duas contas comparam bases.
    const aurora = {
      ...c.influencers.find((i) => i.id === "influencer-aurora")!,
      baseComissao: "liquido" as const,
    };
    const lista = [aurora];
    const doMes = c.pedidosDoMes.filter((p) => p.marca === aurora.marca);
    const historico = c.pedidos.filter((p) => p.marca === aurora.marca);
    const apuracao = apurarImpostos(doMes, c.pedidos, c.produtos, c.impostos, lista, c.aliquotas);

    const referencia = montarReferencia({
      mes: c.mes,
      pedidosDoMes: doMes,
      todosOsPedidos: historico,
      influencers: lista,
      custos: c.custos,
      produtos: c.produtos,
      impostos: apuracao,
      taxas: c.taxas,
      despesas: c.despesas,
    })!;

    const dre = montarDemonstrativo(doMes, c.custos, lista, {
      produtos: c.produtos,
      impostos: apuracao,
      taxasPlataforma: apurarTaxasPlataforma(doMes, c.taxas),
      despesasInfluencers: ratearDespesas(c.despesas, historico, lista),
    });

    // Com a marca sozinha, o operacional inteiro e dela: nao ha "outros" para
    // dividir. Por isso o bruto dos outros vai a zero nesta conferencia.
    const estimativa = estimarInfluencer(
      { ...referencia, brutoTotal: 0 },
      { percentual: aurora.percentual, faturamento: dre.reconciliacao.brutoSemFrete, regime: "lucro_presumido" },
    );

    // A unica diferenca e deliberada: o custo dos itens sem ficha, estimado
    // pela mesma proporcao dos que tem.
    const cmv = calcularCMV(doMes, c.custos, c.produtos);
    const custoEstimadoDosSemFicha = cmv.cmv / cmv.cobertura - cmv.cmv;

    expect(estimativa.recebido).toBeCloseTo(dre.reconciliacao.recebido, 4);
    expect(estimativa.receitaReal).toBeCloseTo(dre.reconciliacao.receitaReal, 4);
    expect(estimativa.impostos + estimativa.difal).toBeCloseTo(dre.totalImpostos, 4);
    expect(estimativa.comissao).toBeCloseTo(dre.totalComissoes, 4);
    expect(estimativa.lucro).toBeCloseTo(dre.lucroOperacional - custoEstimadoDosSemFicha, 2);
  });

  it("no Simples a guia sai da faixa do porte informado, sem DIFAL", () => {
    const { referencia } = cenario();
    const pequena = estimarInfluencer(referencia, { percentual: 30, faturamento: 50_000, regime: "simples_nacional" });
    const media = estimarInfluencer(referencia, { percentual: 30, faturamento: 300_000, regime: "simples_nacional" });

    // A guia sai do RECEBIDO, com o frete dentro (5.1.1, 18/09/2026).
    expect(pequena.impostos).toBeCloseTo(apurarSimples(pequena.recebido * 12, pequena.recebido).valorDAS, 6);
    // O frete soma no que o cliente paga, e agora tambem na base do imposto.
    expect(pequena.recebido).toBeCloseTo(pequena.receitaReal + pequena.frete, 6);
    expect(pequena.difal).toBe(0);
    expect(pequena.aliquotaImpostos).toBeLessThan(media.aliquotaImpostos);
    expect(pequena.acimaDoTetoSimples).toBe(false);
  });

  it("o regime sugerido troca exatamente no teto do Simples", () => {
    const { referencia } = cenario();
    const noTeto = TETO_SIMPLES_NACIONAL / 12 / referencia.fracaoReceitaReal;

    expect(regimeSugerido(referencia, noTeto * 0.99)).toBe("simples_nacional");
    expect(regimeSugerido(referencia, noTeto * 1.01)).toBe("lucro_presumido");
    expect(
      estimarInfluencer(referencia, { percentual: 30, faturamento: noTeto * 1.01, regime: "simples_nacional" })
        .acimaDoTetoSimples,
    ).toBe(true);
  });

  it("a comissão máxima sem prejuízo zera o lucro", () => {
    const { referencia } = cenario();
    const base = estimarInfluencer(referencia, { percentual: 30, faturamento: 400_000, regime: "lucro_presumido" });

    expect(base.comissaoMaximaSemPrejuizo).not.toBeNull();
    const noLimite = estimarInfluencer(referencia, {
      percentual: base.comissaoMaximaSemPrejuizo!,
      faturamento: 400_000,
      regime: "lucro_presumido",
    });
    expect(noLimite.lucro).toBeCloseTo(0, 6);
  });

  it("cada ponto de comissão custa 1% do que cai na conta, sem frete", () => {
    const { referencia } = cenario();
    const a = estimarInfluencer(referencia, { percentual: 20, faturamento: 250_000, regime: "lucro_presumido" });
    const b = estimarInfluencer(referencia, { percentual: 30, faturamento: 250_000, regime: "lucro_presumido" });
    // O que cai na conta: receita real menos a taxa, que incide sobre o valor pago.
    expect(a.baseComissao).toBeCloseTo(a.receitaReal - a.taxas, 6);
    expect(a.baseComissao).toBeLessThan(250_000);
    expect(a.lucro - b.lucro).toBeCloseTo(a.baseComissao * 0.1, 6);
  });

  it("a comissão máxima sem prejuízo zera o lucro, na mesma base", () => {
    const { referencia } = cenario();
    const e = estimarInfluencer(referencia, { percentual: 10, faturamento: 250_000, regime: "lucro_presumido" });
    const limite = estimarInfluencer(referencia, {
      percentual: e.comissaoMaximaSemPrejuizo!,
      faturamento: 250_000,
      regime: "lucro_presumido",
    });
    expect(limite.lucro).toBeCloseTo(0, 6);
  });

  it("a participação dos sócios é 6% do recebido estimado", () => {
    const { referencia } = cenario();
    const e = estimarInfluencer(referencia, { percentual: 30, faturamento: 200_000, regime: "lucro_presumido" });
    expect(e.percentualSocios).toBe(6);
    expect(e.socios).toBeCloseTo(e.recebido * 0.06, 6);
  });

  it("o novo influencer divide o operacional com as marcas atuais, pelo bruto", () => {
    const { referencia } = cenario();
    const e = estimarInfluencer(referencia, { percentual: 30, faturamento: 200_000, regime: "lucro_presumido" });
    expect(e.parteCompartilhada).toBeCloseTo(
      (OPERACIONAL_MENSAL * 200_000) / (referencia.brutoTotal + 200_000),
      6,
    );
  });
});
