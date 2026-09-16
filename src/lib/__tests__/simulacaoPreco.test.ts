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

    expect(r.impostos).toBeCloseTo(10);
    expect(r.difal).toBeCloseTo(2);
    // A taxa incide sobre o que o cliente paga: 100 + 10 de frete.
    expect(r.taxas).toBeCloseTo(3.3);
    expect(r.comissao).toBeCloseTo(35);
    expect(r.frete).toBeCloseTo(10);
    expect(r.totalCustos).toBeCloseTo(80.3);
    expect(r.lucro).toBeCloseTo(19.7);
    expect(r.margem).toBeCloseTo(0.197);
  });

  it("dá prejuízo quando os custos passam do preço", () => {
    const r = simularPreco(perfil(), 60, 100);
    expect(r.lucro).toBeCloseTo(-10.3);
    expect(r.margem).toBeCloseTo(-0.103);
  });

  it("o frete não é custo: mudar o frete só mexe na taxa e nos sócios", () => {
    const sem = simularPreco(perfil({ fretePorUnidade: 0, cargaSocios: 0.06 }), 30, 100);
    const com = simularPreco(perfil({ fretePorUnidade: 19, cargaSocios: 0.06 }), 30, 100);

    expect(com.impostos).toBeCloseTo(sem.impostos, 10);
    expect(com.comissao).toBeCloseTo(sem.comissao, 10);
    expect(sem.lucro - com.lucro).toBeCloseTo(19 * (0.03 + 0.06), 10);
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
    expect(sem.lucro - com.lucro).toBeCloseTo(19 * (0.03 + 0.06 - 0.35 * 0.03), 10);
  });

  it("sem preço mínimo quando as cargas proporcionais chegam a 100%", () => {
    const r = simularPreco(perfil({ cargaComissao: 0.85 }), 30, 100);
    expect(r.cargaProporcional).toBeGreaterThanOrEqual(1);
    expect(r.precoMinimo).toBeNull();
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
