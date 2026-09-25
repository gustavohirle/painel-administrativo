import { describe, expect, it } from "vitest";

import { baseDemonstracao } from "@/data/geradorPedidos";
import {
  aliquotasEstaduaisIniciais,
  custosIniciais,
  despesasInfluencerIniciais,
  impostosIniciais,
  influencersIniciais,
  produtosIniciais,
  taxasPlataformaIniciais,
} from "@/data/seeds";
import { montarDemonstrativo, ratearDespesas } from "@/lib/costing";
import { lerReais } from "@/lib/format";
import { apurarImpostos } from "@/lib/impostos";
import { filtrarPorMes, mesesDisponiveis, pedidosRecebidos } from "@/lib/metrics";
import { apurarTaxasPlataforma } from "@/lib/plataforma";
import {
  MARGENS_DE_REFERENCIA,
  mesDeReferenciaDoSimulador,
  montarPerfisDeCusto,
  precoComercial,
  precoParaMargem,
  simularPreco,
  type PerfilDeCusto,
} from "@/lib/simulacaoPreco";

function perfil(parcial: Partial<PerfilDeCusto> = {}): PerfilDeCusto {
  return {
    influencerId: "i1",
    nome: "Teste",
    marca: "Marca",
    regime: "lucro_presumido",
    percentualContrato: 30,
    baseComissao: "bruto",
    pedidosPagos: 100,
    unidadesPagas: 200,
    cargaImpostos: 0.1,
    cargaDifal: 0.02,
    recolheDifal: true,
    fracaoInterestadual: 0.6,
    cargaTaxas: 0.03,
    cargaComissao: 0.35,
    taxaForaDaComissao: 0,
    cargaDespesas: 0,
    cargaSocios: 0,
    fretePorPedido: 20,
    unidadesPorPedido: 2,
    fretePorUnidade: 10,
    freteGratis: null,
    impostosNaoConfirmados: false,
    taxasNaoConfirmadas: false,
    ...parcial,
  };
}

// Cenario completo da demonstracao, montado como a pagina monta.
function cenarioDemo() {
  const { pedidos } = baseDemonstracao();
  const influencers = influencersIniciais();
  const impostos = impostosIniciais();
  const produtos = produtosIniciais(impostos, influencers);
  const aliquotas = aliquotasEstaduaisIniciais();
  const taxas = taxasPlataformaIniciais();
  // O operacional semeado e compartilhado: dividido com a base inteira, como a pagina faz.
  const despesas = ratearDespesas(despesasInfluencerIniciais(), pedidos, influencers);
  const custos = custosIniciais();
  const mes = mesesDisponiveis(pedidos)[0]!;
  const pedidosDoMes = filtrarPorMes(pedidos, mes);
  const apuracao = apurarImpostos(pedidosDoMes, pedidos, produtos, impostos, influencers, aliquotas);
  const perfis = montarPerfisDeCusto({
    pedidosDoMes,
    influencers,
    impostos: apuracao,
    taxas,
    despesas,
  });
  return { pedidos, pedidosDoMes, influencers, impostos, produtos, aliquotas, taxas, despesas, custos, perfis };
}

describe("simularPreco", () => {
  it("desconta cada carga do preço e a fabricação; o frete é do cliente", () => {
    const r = simularPreco(perfil(), 30, 100);

    // Imposto, DIFAL e taxa incidem sobre o que o cliente paga: 100 + 10 de
    // frete. O frete entrou na base de todo tributo em 18/09/2026 (5.1.1);
    // antes so a taxa o via.
    expect(r.impostos).toBeCloseTo(11);
    expect(r.difal).toBeCloseTo(2.2);
    expect(r.taxas).toBeCloseTo(3.3);
    expect(r.comissao).toBeCloseTo(35);
    expect(r.frete).toBeCloseTo(10);
    expect(r.totalCustos).toBeCloseTo(81.5);
    expect(r.lucro).toBeCloseTo(18.5);
    expect(r.margem).toBeCloseTo(0.185);
  });

  it("dá prejuízo quando os custos passam do preço", () => {
    const r = simularPreco(perfil(), 60, 100);
    expect(r.lucro).toBeCloseTo(-11.5);
    expect(r.margem).toBeCloseTo(-0.115);
  });

  it("o frete não é custo, mas é base: só a comissão não o vê", () => {
    const sem = simularPreco(perfil({ fretePorUnidade: 0, cargaSocios: 0.06 }), 30, 100);
    const com = simularPreco(perfil({ fretePorUnidade: 19, cargaSocios: 0.06 }), 30, 100);

    // A comissao e a unica carga que nao segue o frete (5.1.2).
    expect(com.comissao).toBeCloseTo(sem.comissao, 10);
    // Imposto, DIFAL, taxa e socios seguem.
    expect(sem.lucro - com.lucro).toBeCloseTo(19 * (0.1 + 0.02 + 0.03 + 0.06), 10);
  });

  it("o preço mínimo é exatamente o que zera o resultado", () => {
    const p = perfil();
    const { precoMinimo } = simularPreco(p, 30, 100);

    expect(precoMinimo).not.toBeNull();
    expect(simularPreco(p, 30, precoMinimo!).lucro).toBeCloseTo(0, 8);
  });

  it("contrato sobre o que cai na conta: a comissão não vê a taxa, nem a do frete", () => {
    const p = perfil({ baseComissao: "liquido", taxaForaDaComissao: 0.03 });
    const r = simularPreco(p, 30, 100);

    // Pago = 100 + 10 de frete; a taxa de 3% sobre ele não é base de comissão.
    expect(r.taxas).toBeCloseTo(3.3, 10);
    expect(r.comissao).toBeCloseTo((100 - 3.3) * 0.35, 10);
    expect(simularPreco(p, 30, r.precoMinimo!).lucro).toBeCloseTo(0, 8);
    expect(precoParaMargem(p, 30, 0.15)! * 0.15).toBeCloseTo(
      simularPreco(p, 30, precoParaMargem(p, 30, 0.15)!).lucro,
      8,
    );
  });

  it("contrato sobre o que cai na conta: frete maior devolve a parte da taxa na comissão", () => {
    const base = { baseComissao: "liquido" as const, taxaForaDaComissao: 0.03, cargaSocios: 0.06 };
    const sem = simularPreco(perfil({ ...base, fretePorUnidade: 0 }), 30, 100);
    const com = simularPreco(perfil({ ...base, fretePorUnidade: 19 }), 30, 100);
    expect(sem.lucro - com.lucro).toBeCloseTo(19 * (0.1 + 0.02 + 0.03 + 0.06 - 0.35 * 0.03), 10);
  });

  it("sem preço mínimo quando as cargas proporcionais chegam a 100%", () => {
    const r = simularPreco(perfil({ cargaComissao: 0.85 }), 30, 100);
    expect(r.cargaProporcional).toBeGreaterThanOrEqual(1);
    expect(r.precoMinimo).toBeNull();
  });
});

describe("frete grátis (TikTok)", () => {
  // A loja banca R$ 12 de frete por unidade nas vendas com frete gratis; nas
  // outras, o cliente paga R$ 8 por fora.
  const comFreteGratis = (parcial: Partial<PerfilDeCusto> = {}) =>
    perfil({
      freteGratis: { fracaoDosPedidos: 0.8, custoPorUnidade: 12, freteDoClientePorUnidade: 8 },
      ...parcial,
    });

  it("com frete grátis o cliente não paga frete e a loja paga: vira custo", () => {
    const r = simularPreco(comFreteGratis(), 30, 100, true);
    expect(r.frete).toBe(0);
    expect(r.freteDaLoja).toBe(12);
    // Imposto e taxa so sobre o preco: nao houve frete cobrado.
    expect(r.impostos).toBeCloseTo(10, 10);
    expect(r.taxas).toBeCloseTo(3, 10);
    // 100 - (10 + 2 + 3 + 35 + 30 + 12)
    expect(r.lucro).toBeCloseTo(8, 10);
  });

  it("sem frete grátis, o frete do cliente é o das vendas em que ele pagou", () => {
    const r = simularPreco(comFreteGratis(), 30, 100, false);
    expect(r.frete).toBe(8);
    expect(r.freteDaLoja).toBe(0);
    expect(r.impostos).toBeCloseTo(10.8, 10);
  });

  it("contrato sobre o que cai na conta: o frete que a loja bancou sai da base da comissão", () => {
    const p = comFreteGratis({ baseComissao: "liquido", taxaForaDaComissao: 0.03 });
    const r = simularPreco(p, 30, 100, true);
    expect(r.baseDaComissao).toBeCloseTo(100 - 3 - 12, 10);
    expect(r.comissao).toBeCloseTo((100 - 3 - 12) * 0.35, 10);
  });

  it("o preço mínimo e o sugerido fecham com frete grátis, nas duas bases", () => {
    for (const baseComissao of ["bruto", "liquido"] as const) {
      const p = comFreteGratis({ baseComissao, taxaForaDaComissao: baseComissao === "liquido" ? 0.03 : 0 });
      const { precoMinimo } = simularPreco(p, 30, 100, true);
      expect(simularPreco(p, 30, precoMinimo!, true).lucro).toBeCloseTo(0, 8);
      const sugerido = precoParaMargem(p, 30, 0.15, true)!;
      expect(simularPreco(p, 30, sugerido, true).margem).toBeCloseTo(0.15, 8);
    }
  });

  it("frete grátis sobe o preço mínimo", () => {
    const p = comFreteGratis();
    expect(simularPreco(p, 30, 100, true).precoMinimo!).toBeGreaterThan(
      simularPreco(p, 30, 100, false).precoMinimo!,
    );
  });

  it("marca sem frete grátis ignora a opção", () => {
    const p = perfil();
    expect(simularPreco(p, 30, 100, true)).toEqual(simularPreco(p, 30, 100, false));
  });

  it("uma marca toda em frete grátis: simular a média reproduz a DRE", () => {
    // A marca mais vendida da demonstracao, com todo pedido virado para frete
    // gratis: o cliente paga so o produto e a loja paga R$ 19 a transportadora.
    const cenario = cenarioDemo();
    const marca = cenario.perfis[0]!.marca;
    const gratis = (pedidos: typeof cenario.pedidos) =>
      pedidos.map((p) =>
        p.marca !== marca
          ? p
          : {
              ...p,
              total: (Number(p.total) - Number(p.shipping_cost_customer)).toFixed(2),
              shipping_cost_customer: "0.00",
              shipping_cost_owner: "19.00",
              gateway_name: `TikTok Shop ${p.id}`,
            },
      );
    const pedidos = gratis(cenario.pedidos);
    const pedidosDoMes = gratis(cenario.pedidosDoMes);
    const influencers = cenario.influencers.map((i) => ({ ...i, baseComissao: "liquido" as const }));
    const { produtos, impostos, aliquotas, taxas, despesas, custos } = cenario;

    const [p] = montarPerfisDeCusto({
      pedidosDoMes,
      influencers,
      impostos: apurarImpostos(pedidosDoMes, pedidos, produtos, impostos, influencers, aliquotas),
      taxas,
      despesas,
    }).filter((x) => x.marca === marca);
    expect(p!.freteGratis?.fracaoDosPedidos).toBe(1);

    const daMarca = pedidosDoMes.filter((x) => x.marca === marca);
    const dre = montarDemonstrativo(daMarca, custos, influencers, {
      produtos,
      impostos: apurarImpostos(daMarca, pedidos, produtos, impostos, influencers, aliquotas),
      taxasPlataforma: apurarTaxasPlataforma(daMarca, taxas),
      despesasInfluencers: despesas,
    });
    const r = dre.reconciliacao;
    expect(r.freteAbsorvido).toBeGreaterThan(0);

    const simulado = simularPreco(p!, dre.cmv.cmv / p!.unidadesPagas, r.receitaReal / p!.unidadesPagas, true);
    // O frete bancado aparece inteiro como custo, e a comissao bate inteira.
    expect(simulado.freteDaLoja * p!.unidadesPagas).toBeCloseTo(r.freteAbsorvido, 4);
    expect(simulado.comissao * p!.unidadesPagas).toBeCloseTo(dre.totalComissoes, 4);
    const foraDaSimulacao = dre.totalDespesasInfluencers * (1 - r.receitaReal / r.brutoSemFrete);
    expect(
      Math.abs(simulado.lucro * p!.unidadesPagas - dre.lucroOperacional - foraDaSimulacao),
    ).toBeLessThan(0.01);
  });
});

describe("mesDeReferenciaDoSimulador", () => {
  const meses = ["2026-09", "2026-08", "2026-07", "2026-01", "2025-12"];

  it("no mês corrente, usa o anterior: o aberto não tem as despesas lançadas", () => {
    expect(mesDeReferenciaDoSimulador("2026-09", "2026-09", meses)).toBe("2026-08");
  });

  it("mês já fechado no cabeçalho vale como está", () => {
    expect(mesDeReferenciaDoSimulador("2026-08", "2026-09", meses)).toBe("2026-08");
    expect(mesDeReferenciaDoSimulador("2026-07", "2026-09", meses)).toBe("2026-07");
  });

  it("janeiro volta para dezembro do ano anterior", () => {
    expect(mesDeReferenciaDoSimulador("2026-01", "2026-01", meses)).toBe("2025-12");
  });

  it("sem o mês anterior na base, fica o do cabeçalho", () => {
    expect(mesDeReferenciaDoSimulador("2025-12", "2025-12", meses)).toBe("2025-12");
  });
});

describe("montarPerfisDeCusto", () => {
  it("simular o preço e o custo médios reproduz a DRE, menos a comissão e as despesas sobre pedido não pago", () => {
    const { pedidosDoMes, pedidos, influencers, impostos, produtos, aliquotas, taxas, despesas, custos, perfis } =
      cenarioDemo();

    expect(perfis.length).toBeGreaterThan(0);

    for (const p of perfis) {
      const daMarca = pedidosDoMes.filter((x) => x.marca === p.marca);
      const dre = montarDemonstrativo(daMarca, custos, influencers, {
        produtos,
        impostos: apurarImpostos(daMarca, pedidos, produtos, impostos, influencers, aliquotas),
        taxasPlataforma: apurarTaxasPlataforma(daMarca, taxas),
        despesasInfluencers: despesas,
      });

      const unidades = p.unidadesPagas;
      // Preço sem frete: o frete o cliente paga por fora.
      const precoMedio = dre.reconciliacao.receitaReal / unidades;
      const custoMedio = dre.cmv.cmv / unidades;
      const simulado = simularPreco(p, custoMedio, precoMedio);

      // Imposto, DIFAL, taxa, frete e fabricação batem com a DRE. A diferença é
      // exatamente o que a simulação deixa de fora por decisão: a comissão e as
      // despesas que incidem sobre o faturamento que nunca virou dinheiro.
      const r = dre.reconciliacao;
      const foraDaSimulacao =
        dre.totalComissoes -
        (p.percentualContrato / 100) * r.receitaReal +
        dre.totalDespesasInfluencers * (1 - r.receitaReal / r.brutoSemFrete);

      expect(
        Math.abs(simulado.lucro * unidades - dre.lucroOperacional - foraDaSimulacao),
      ).toBeLessThan(0.01);
    }
  });

  it("com contratos sobre o que cai na conta, a simulação e a DRE só diferem nas despesas", () => {
    const cenario = cenarioDemo();
    const influencers = cenario.influencers.map((i) => ({ ...i, baseComissao: "liquido" as const }));
    const { pedidosDoMes, pedidos, impostos, produtos, aliquotas, taxas, despesas, custos } = cenario;
    const perfis = montarPerfisDeCusto({
      pedidosDoMes,
      influencers,
      impostos: apurarImpostos(pedidosDoMes, pedidos, produtos, impostos, influencers, aliquotas),
      taxas,
      despesas,
    });
    expect(perfis.length).toBeGreaterThan(0);

    for (const p of perfis) {
      expect(p.taxaForaDaComissao).toBeCloseTo(p.cargaTaxas, 12);
      const daMarca = pedidosDoMes.filter((x) => x.marca === p.marca);
      const dre = montarDemonstrativo(daMarca, custos, influencers, {
        produtos,
        impostos: apurarImpostos(daMarca, pedidos, produtos, impostos, influencers, aliquotas),
        taxasPlataforma: apurarTaxasPlataforma(daMarca, taxas),
        despesasInfluencers: despesas,
      });
      const r = dre.reconciliacao;
      const simulado = simularPreco(p, dre.cmv.cmv / p.unidadesPagas, r.receitaReal / p.unidadesPagas);

      // A comissão bate inteira: a base "o que cai na conta" só tem pedido pago.
      expect(simulado.comissao * p.unidadesPagas).toBeCloseTo(dre.totalComissoes, 4);
      const foraDaSimulacao = dre.totalDespesasInfluencers * (1 - r.receitaReal / r.brutoSemFrete);
      expect(
        Math.abs(simulado.lucro * p.unidadesPagas - dre.lucroOperacional - foraDaSimulacao),
      ).toBeLessThan(0.01);
    }
  });

  it("marca no Simples não carrega DIFAL, e a do Presumido carrega", () => {
    const { perfis } = cenarioDemo();
    const simples = perfis.filter((p) => p.regime === "simples_nacional");
    const presumido = perfis.filter((p) => p.regime === "lucro_presumido");

    expect(simples.length).toBeGreaterThan(0);
    expect(presumido.length).toBeGreaterThan(0);
    for (const p of simples) {
      expect(p.recolheDifal).toBe(false);
      expect(p.cargaDifal).toBe(0);
    }
    for (const p of presumido) expect(p.cargaDifal).toBeGreaterThan(0);
  });

  it("a comissão é o percentual do contrato sobre o preço, sem ajuste", () => {
    const { perfis } = cenarioDemo();

    for (const p of perfis) {
      expect(p.cargaComissao).toBeCloseTo(p.percentualContrato / 100, 10);
      expect(simularPreco(p, 0, 100).comissao).toBeCloseTo(p.percentualContrato, 8);
    }
  });

  it("a participação dos sócios entra como 6% do preço e conta no preço mínimo", () => {
    const { perfis } = cenarioDemo();
    for (const p of perfis) {
      expect(p.cargaSocios).toBeCloseTo(0.06, 10);
      const r = simularPreco(p, 30, 100);
      // 6% do que o cliente paga, frete incluído.
      expect(r.socios).toBeCloseTo(0.06 * (100 + p.fretePorUnidade), 8);
      expect(simularPreco(p, 30, r.precoMinimo!).lucro).toBeCloseTo(0, 8);
    }
  });

  it("todo contrato semeado é sobre o faturamento bruto", () => {
    expect(influencersIniciais().every((i) => i.baseComissao === "bruto")).toBe(true);
  });

  it("frete grátis numa loja que NÃO é do TikTok não liga a opção", () => {
    // Pedido do dono: o calculo novo e so do TikTok. Uma promocao de frete
    // gratis na Nuvemshop nao pode trocar o frete medio de sempre.
    const cenario = cenarioDemo();
    const marca = cenario.perfis[0]!.marca;
    const antes = cenario.perfis[0]!;
    const pedidosDoMes = cenario.pedidosDoMes.map((p, i) =>
      p.marca === marca && i % 3 === 0 ? { ...p, shipping_cost_customer: "0.00", shipping_cost_owner: "19.00" } : p,
    );
    const [depois] = montarPerfisDeCusto({
      pedidosDoMes,
      influencers: cenario.influencers,
      impostos: apurarImpostos(pedidosDoMes, cenario.pedidos, cenario.produtos, cenario.impostos, cenario.influencers, cenario.aliquotas),
      taxas: cenario.taxas,
      despesas: cenario.despesas,
    }).filter((p) => p.marca === marca);
    expect(depois!.freteGratis).toBeNull();
    expect(antes.freteGratis).toBeNull();
  });

  it("na demonstração nenhuma marca banca frete, e a opção de frete grátis não aparece", () => {
    const { perfis } = cenarioDemo();
    expect(perfis.every((p) => p.freteGratis === null)).toBe(true);
  });

  it("frete por unidade é o frete do pedido dividido pelas unidades do pedido", () => {
    const { perfis, pedidosDoMes } = cenarioDemo();
    for (const p of perfis) {
      const pagos = pedidosRecebidos(pedidosDoMes.filter((x) => x.marca === p.marca));
      expect(p.pedidosPagos).toBe(pagos.length);
      expect(p.fretePorUnidade).toBeCloseTo(p.fretePorPedido / p.unidadesPorPedido, 8);
    }
  });

  it("influencer inativo e marca sem venda paga ficam de fora", () => {
    const { pedidosDoMes, influencers, pedidos, produtos, impostos, aliquotas, taxas } = cenarioDemo();
    const [primeiro, ...resto] = influencers;
    const inativo = { ...primeiro!, ativo: false };
    const semVenda = { ...resto[0]!, id: "sem-venda", marca: "Marca que não existe" };
    const lista = [inativo, ...resto, semVenda];

    const perfis = montarPerfisDeCusto({
      pedidosDoMes,
      influencers: lista,
      impostos: apurarImpostos(pedidosDoMes, pedidos, produtos, impostos, lista, aliquotas),
      taxas,
      despesas: [],
    });

    const ids = perfis.map((p) => p.influencerId);
    expect(ids).not.toContain(inativo.id);
    expect(ids).not.toContain("sem-venda");
    expect(ids).toHaveLength(resto.length);
  });
});

describe("sugestão de preço", () => {
  it("o preço sugerido entrega exatamente a margem pedida", () => {
    const p = perfil();
    for (const margem of [0.1, 0.15, 0.2, 0.33]) {
      const preco = precoParaMargem(p, 30, margem)!;
      expect(simularPreco(p, 30, preco).margem).toBeCloseTo(margem, 10);
    }
  });

  it("margem zero é o preço mínimo", () => {
    const p = perfil();
    expect(precoParaMargem(p, 30, 0)).toBeCloseTo(simularPreco(p, 30, 100).precoMinimo!, 10);
  });

  it("sem preço quando cargas e margem somam 100%", () => {
    // cargas do perfil de teste: 10 + 2 + 3 + 35 = 50%
    expect(precoParaMargem(perfil(), 30, 0.5)).toBeNull();
    expect(precoParaMargem(perfil(), 30, 0.49)).not.toBeNull();
  });

  it("mais margem, preço maior", () => {
    const precos = MARGENS_DE_REFERENCIA.map((r) => precoParaMargem(perfil(), 30, r.margem)!);
    expect([...precos].sort((a, b) => a - b)).toEqual(precos);
    expect(MARGENS_DE_REFERENCIA.map((r) => r.margem)).toEqual([0.1, 0.15, 0.2]);
  });

  it("preço comercial sobe até o próximo ,90 e nunca desce", () => {
    expect(precoComercial(152.14)).toBe(152.9);
    expect(precoComercial(152.9)).toBe(152.9);
    expect(precoComercial(152.91)).toBe(153.9);
    expect(precoComercial(152.95)).toBe(153.9);
    expect(precoComercial(0.5)).toBe(0.9);
    expect(precoComercial(99.9)).toBe(99.9);
    for (const valor of [12.01, 45.555, 89.9001, 1234.56]) {
      expect(precoComercial(valor)).toBeGreaterThanOrEqual(valor - 1e-9);
      expect(precoComercial(valor) - valor).toBeLessThan(1);
    }
  });

  it("arredondar para ,90 não tira margem da sugestão", () => {
    const p = perfil();
    for (const r of MARGENS_DE_REFERENCIA) {
      const comercial = precoComercial(precoParaMargem(p, 30, r.margem)!);
      expect(simularPreco(p, 30, comercial).margem).toBeGreaterThanOrEqual(r.margem - 1e-12);
    }
  });
});

describe("lerReais", () => {
  it("entende o jeito brasileiro de escrever dinheiro", () => {
    expect(lerReais("1.234,56")).toBeCloseTo(1234.56);
    expect(lerReais("R$ 1.234,56")).toBeCloseTo(1234.56);
    expect(lerReais("49,90")).toBeCloseTo(49.9);
    expect(lerReais("1234.56")).toBeCloseTo(1234.56);
    expect(lerReais("12")).toBe(12);
  });

  it("campo vazio ou texto não vira zero", () => {
    expect(lerReais("")).toBeNull();
    expect(lerReais("   ")).toBeNull();
    expect(lerReais("abc")).toBeNull();
  });
});
