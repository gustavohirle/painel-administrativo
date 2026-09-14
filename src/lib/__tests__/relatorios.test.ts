import { describe, expect, it } from "vitest";

import {
  filtrarPedidos,
  montarRelatorio,
  ufDoPedido,
  type DadosRelatorio,
} from "@/lib/relatorios";
import { reconciliar } from "@/lib/metrics";
import { montarDemonstrativo } from "@/lib/costing";
import { apurarImpostos } from "@/lib/impostos";
import { apurarTaxasPlataforma } from "@/lib/plataforma";
import type { TaxaPlataforma } from "@/types/plataforma";
import {
  COMBINACOES_PRONTAS,
  FILTROS_VAZIOS,
  metricaDisponivel,
  metricasDisponiveis,
  motivoIndisponivel,
  type ConfiguracaoRelatorio,
} from "@/types/relatorio";
import type { CustoProduto, DespesaInfluencer, Influencer } from "@/types/dominio";
import type { Pedido } from "@/types/nuvemshop";

// ---------------------------------------------------------------------------
// Fabricas
// ---------------------------------------------------------------------------

let sequencia = 1;

function pedido(parcial: Partial<Pedido> = {}): Pedido {
  const id = sequencia++;
  return {
    id,
    number: id,
    created_at: "2026-09-10T12:00:00.000Z",
    paid_at: "2026-09-10T12:05:00.000Z",
    status: "closed",
    payment_status: "paid",
    shipping_status: "fulfilled",
    subtotal: "100.00",
    total: "120.00",
    discount: "0.00",
    shipping_cost_customer: "20.00",
    shipping_cost_owner: "15.00",
    gateway_name: "Mercado Pago",
    payment_details: { method: "credit_card", credit_card_company: "visa", installments: 1 },
    cancel_reason: null,
    shipping_address: { province: "SP", city: "Sao Paulo", zipcode: "01000-000", country: "BR" },
    customer: {
      id: 1,
      name: "Cliente Teste",
      email: "cliente@exemplo.com.br",
      total_spent: "120.00",
      last_order_id: id,
      created_at: "2026-01-01T00:00:00.000Z",
    },
    products: [
      {
        id,
        product_id: 1001,
        variant_id: 100101,
        name: "Produto A",
        price: "100.00",
        quantity: 1,
        sku: "A-1",
      },
    ],
    marca: "Marca Um",
    ...parcial,
  };
}

function custo(parcial: Partial<CustoProduto> = {}): CustoProduto {
  return {
    id: "c1",
    produtoId: 1001,
    varianteId: null,
    sku: "A-1",
    nome: "Produto A",
    custoMateriaPrima: 20,
    custoEmbalagem: 5,
    custoMaoDeObra: 3,
    custoIndireto: 2,
    atualizadoEm: "2026-09-01T00:00:00.000Z",
    ...parcial,
  };
}

function influencer(parcial: Partial<Influencer> = {}): Influencer {
  return {
    id: "i1",
    nome: "Influencer Um",
    marca: "Marca Um",
    // 30 e "30%": o cadastro guarda o numero como se escreve no contrato.
    percentual: 30,
    baseComissao: "bruto",
    regime: "lucro_presumido",
    anexoSimples: "II",
    uf: "GO",
    rbt12Manual: null,
    ativo: true,
    observacao: null,
    atualizadoEm: "2026-09-01T00:00:00.000Z",
    ...parcial,
  };
}

function dados(pedidos: Pedido[], parcial: Partial<DadosRelatorio> = {}): DadosRelatorio {
  return {
    pedidos,
    custos: [custo()],
    produtos: [],
    influencers: [influencer()],
    impostos: [],
    taxasPlataforma: [],
    aliquotasEstaduais: [],
    ...parcial,
  };
}

function configuracao(parcial: Partial<ConfiguracaoRelatorio> = {}): ConfiguracaoRelatorio {
  return {
    agruparPor: "marca",
    depoisPor: null,
    metricas: ["bruto", "recebido", "receitaReal"],
    ordenarPor: "bruto",
    filtros: { ...FILTROS_VAZIOS },
    ...parcial,
  };
}

// ---------------------------------------------------------------------------

describe("filtrarPedidos", () => {
  it("lista vazia significa todos, nao nenhum", () => {
    const pedidos = [pedido(), pedido({ marca: "Marca Dois" })];
    expect(filtrarPedidos(pedidos, FILTROS_VAZIOS)).toHaveLength(2);
  });

  it("filtra por intervalo de meses, incluindo as pontas", () => {
    const pedidos = [
      pedido({ created_at: "2026-07-05T00:00:00.000Z" }),
      pedido({ created_at: "2026-08-05T00:00:00.000Z" }),
      pedido({ created_at: "2026-09-05T00:00:00.000Z" }),
    ];

    const dentro = filtrarPedidos(pedidos, {
      ...FILTROS_VAZIOS,
      mesInicial: "2026-07",
      mesFinal: "2026-08",
    });

    expect(dentro).toHaveLength(2);
  });

  it("filtra por marca, estado e meio de pagamento ao mesmo tempo", () => {
    const alvo = pedido({
      marca: "Marca Dois",
      shipping_address: { province: "MG", city: "BH", zipcode: "30000-000", country: "BR" },
      payment_details: { method: "pix", credit_card_company: null, installments: 1 },
    });
    const pedidos = [pedido(), alvo, pedido({ marca: "Marca Dois" })];

    const filtrados = filtrarPedidos(pedidos, {
      ...FILTROS_VAZIOS,
      marcas: ["Marca Dois"],
      estados: ["MG"],
      pagamentos: ["pix"],
    });

    expect(filtrados).toEqual([alvo]);
  });

  it("descarta pedido sem estado quando ha filtro de estado", () => {
    const semEndereco = pedido({ shipping_address: null });
    expect(ufDoPedido(semEndereco)).toBeNull();

    const filtrados = filtrarPedidos([semEndereco], {
      ...FILTROS_VAZIOS,
      estados: ["SP"],
    });

    expect(filtrados).toHaveLength(0);
  });

  it("normaliza o estado antes de comparar: 'Sao Paulo' casa com SP", () => {
    const porExtenso = pedido({
      shipping_address: { province: "Sao Paulo", city: "Sao Paulo", zipcode: "01000-000", country: "BR" },
    });

    const filtrados = filtrarPedidos([porExtenso], { ...FILTROS_VAZIOS, estados: ["SP"] });
    expect(filtrados).toHaveLength(1);
  });
});

describe("o que cruza com o que", () => {
  it("comissao, imposto e lucro nao existem por estado nem por meio de pagamento", () => {
    for (const metrica of ["comissao", "impostos", "lucro"] as const) {
      expect(metricaDisponivel("marca", metrica)).toBe(true);
      expect(metricaDisponivel("estado", metrica)).toBe(false);
      expect(metricaDisponivel("pagamento", metrica)).toBe(false);
      expect(motivoIndisponivel("estado", metrica)).toContain("marca");
    }
  });

  it("valor de pedido inteiro nao vale por produto", () => {
    for (const metrica of ["bruto", "frete", "recebido", "ticketMedio"] as const) {
      expect(metricaDisponivel("produto", metrica)).toBe(false);
    }
    expect(metricasDisponiveis("produto")).toEqual([
      "unidades",
      "receitaItens",
      "cmv",
      "margemItens",
      // A taxa e cobrada sobre o pedido, mas rateia por participacao do item
      // na receita -- criterio que nao exige arbitragem, porque a propria
      // cobranca e proporcional ao valor.
      "taxas",
    ]);
    // E o produto NAO ganha comissao nem imposto por tabela.
    expect(metricaDisponivel("produto", "comissao")).toBe(false);
    expect(metricaDisponivel("produto", "impostos")).toBe(false);
  });

  it("metrica de item vale em qualquer dimensao; metrica de pedido nao vale por produto", () => {
    // Itens particionam dentro de qualquer grupo, entao somar os itens de uma
    // marca e legitimo. O inverso nao: o frete do pedido nao e de um produto.
    expect(metricaDisponivel("marca", "receitaItens")).toBe(true);
    expect(metricaDisponivel("estado", "unidades")).toBe(true);
    expect(metricaDisponivel("produto", "receitaReal")).toBe(false);
  });

  it("receita real e receita dos itens sao contas diferentes, nao sinonimos", () => {
    // Uma inclui frete e desconto do pedido, a outra e so preco x quantidade.
    // Se um dia passarem a bater, alguem juntou as duas por engano.
    const resultado = montarRelatorio(
      configuracao({ metricas: ["receitaReal", "receitaItens"], ordenarPor: "receitaReal" }),
      dados([pedido()]),
    );

    expect(resultado.total.receitaReal).toBeCloseTo(100, 2); // 120 - 20 de frete
    expect(resultado.total.receitaItens).toBeCloseTo(100, 2);

    const comDesconto = montarRelatorio(
      configuracao({ metricas: ["receitaReal", "receitaItens"], ordenarPor: "receitaReal" }),
      dados([pedido({ total: "150.00", shipping_cost_customer: "30.00" })]),
    );

    expect(comDesconto.total.receitaReal).toBeCloseTo(120, 2);
    expect(comDesconto.total.receitaItens).toBeCloseTo(100, 2);
  });
});

describe("montarRelatorio", () => {
  it("uma linha por marca, e as linhas somam o total", () => {
    const pedidos = [
      pedido({ marca: "Marca Um" }),
      pedido({ marca: "Marca Um" }),
      pedido({ marca: "Marca Dois" }),
    ];

    const resultado = montarRelatorio(configuracao(), dados(pedidos));

    expect(resultado.linhas).toHaveLength(2);
    const soma = resultado.linhas.reduce((t, l) => t + (l.valores.bruto ?? 0), 0);
    expect(soma).toBeCloseTo(resultado.total.bruto!, 2);
    expect(resultado.total.bruto).toBeCloseTo(360, 2);
  });

  it("o total bate com reconciliar sobre os mesmos pedidos", () => {
    // A garantia que impede o relatorio de virar uma segunda versao da verdade.
    const pedidos = [
      pedido(),
      pedido({ status: "cancelled" }),
      pedido({ payment_status: "pending", paid_at: null }),
      pedido({ payment_status: "refunded" }),
    ];

    const resultado = montarRelatorio(
      configuracao({ metricas: ["bruto", "naoPago", "cancelado", "reembolsado", "recebido", "frete", "receitaReal"] }),
      dados(pedidos),
    );
    const direto = reconciliar(pedidos);

    expect(resultado.total.bruto).toBeCloseTo(direto.bruto, 2);
    expect(resultado.total.naoPago).toBeCloseTo(direto.naoPago, 2);
    expect(resultado.total.cancelado).toBeCloseTo(direto.cancelado, 2);
    expect(resultado.total.reembolsado).toBeCloseTo(direto.reembolsado, 2);
    expect(resultado.total.recebido).toBeCloseTo(direto.recebido, 2);
    expect(resultado.total.receitaReal).toBeCloseTo(direto.receitaReal, 2);
  });

  it("recusa a metrica invalida e diz por que, em vez de devolver numero errado", () => {
    const resultado = montarRelatorio(
      configuracao({ agruparPor: "estado", metricas: ["recebido", "comissao"] }),
      dados([pedido()]),
    );

    expect(resultado.metricas).toEqual(["recebido"]);
    expect(resultado.recusadas).toHaveLength(1);
    expect(resultado.recusadas[0]!.metrica).toBe("comissao");
    expect(resultado.recusadas[0]!.motivo).toBeTruthy();
  });

  it("filtro de estado derruba comissao mesmo agrupando por marca", () => {
    // O furo mais facil de nao enxergar: a linha diz "Marca Um", mas e so a
    // parte dela que foi para SP. A comissao do contrato nao e divisivel assim.
    const resultado = montarRelatorio(
      configuracao({
        agruparPor: "marca",
        metricas: ["recebido", "comissao"],
        filtros: { ...FILTROS_VAZIOS, estados: ["SP"] },
      }),
      dados([pedido()]),
    );

    expect(resultado.metricas).toEqual(["recebido"]);
    expect(resultado.recusadas.map((r) => r.metrica)).toEqual(["comissao"]);
    // O motivo acompanha a coluna recusada, e nao um aviso solto no rodape:
    // assim a explicacao aparece junto do que ela explica.
    expect(resultado.recusadas[0]!.motivo).toContain("marca inteira");
  });

  it("sem filtro que corte a marca, a comissao aparece", () => {
    const resultado = montarRelatorio(
      configuracao({ agruparPor: "marca", metricas: ["recebido", "comissao"] }),
      dados([pedido()]),
    );

    expect(resultado.metricas).toContain("comissao");
    expect(resultado.linhas[0]!.valores.comissao).toBeGreaterThan(0);
  });

  it("no segundo nivel, a metrica que nao vale ali vira traco e nao zero", () => {
    const resultado = montarRelatorio(
      configuracao({
        agruparPor: "marca",
        depoisPor: "estado",
        metricas: ["recebido", "comissao"],
      }),
      dados([pedido()]),
    );

    const marca = resultado.linhas[0]!;
    expect(marca.valores.comissao).toBeGreaterThan(0);
    // A filha e um pedaco da marca: comissao ali seria rateio inventado.
    expect(marca.filhas[0]!.valores.comissao).toBeNull();
    expect(marca.filhas[0]!.valores.recebido).toBeGreaterThan(0);
  });

  it("produto sem ficha de custo fica com custo nulo, nao zero", () => {
    const semFicha = pedido({
      products: [
        { id: 9, product_id: 7777, variant_id: 777701, name: "Sem ficha", price: "50.00", quantity: 2, sku: "S-1" },
      ],
    });

    const resultado = montarRelatorio(
      configuracao({ agruparPor: "produto", metricas: ["unidades", "receitaItens", "cmv", "margemItens"], ordenarPor: "receitaItens" }),
      dados([semFicha]),
    );

    const linha = resultado.linhas.find((l) => l.rotulo.includes("Sem ficha"))!;
    expect(linha.valores.unidades).toBe(2);
    expect(linha.valores.receitaItens).toBeCloseTo(100, 2);
    expect(linha.valores.cmv).toBeNull();
    expect(linha.valores.margemItens).toBeNull();
  });

  it("linha sem valor de ordenacao vai para o fim, nao para o topo", () => {
    const comFicha = pedido();
    const semFicha = pedido({
      products: [
        { id: 9, product_id: 7777, variant_id: 777701, name: "Sem ficha", price: "500.00", quantity: 1, sku: "S-1" },
      ],
    });

    const resultado = montarRelatorio(
      configuracao({ agruparPor: "produto", metricas: ["unidades", "cmv", "margemItens"], ordenarPor: "margemItens" }),
      dados([comFicha, semFicha]),
    );

    expect(resultado.linhas.at(-1)!.rotulo).toContain("Sem ficha");
  });

  it("so pedidos recebidos entram nas unidades vendidas", () => {
    const resultado = montarRelatorio(
      configuracao({ agruparPor: "marca", metricas: ["unidades"], ordenarPor: "unidades" }),
      dados([pedido(), pedido({ status: "cancelled" }), pedido({ payment_status: "pending", paid_at: null })]),
    );

    expect(resultado.total.unidades).toBe(1);
  });

  it("agrupa por mes com o rotulo em pt-BR", () => {
    const resultado = montarRelatorio(
      configuracao({
        agruparPor: "mes",
        metricas: ["bruto"],
        ordenarPor: "bruto",
      }),
      dados([
        pedido({ created_at: "2026-08-05T00:00:00.000Z" }),
        pedido({ created_at: "2026-09-05T00:00:00.000Z" }),
      ]),
    );

    expect(resultado.linhas).toHaveLength(2);
    expect(resultado.linhas.map((l) => l.rotulo).join(" ")).toMatch(/\/26/);
  });

  it("marca sem influencer vinculado aparece na propria linha", () => {
    const resultado = montarRelatorio(
      configuracao({ agruparPor: "influencer", metricas: ["bruto"], ordenarPor: "bruto" }),
      dados([pedido({ marca: "Marca Orfa" })]),
    );

    expect(resultado.linhas[0]!.rotulo).toContain("Sem influencer");
  });

  it("periodo vazio nao quebra", () => {
    const resultado = montarRelatorio(
      configuracao({ filtros: { ...FILTROS_VAZIOS, mesInicial: "2099-01" } }),
      dados([pedido()]),
    );

    expect(resultado.linhas).toHaveLength(0);
    expect(resultado.pedidosNoPeriodo).toBe(0);
    expect(resultado.periodo).toEqual({ inicio: "", fim: "" });
  });

  it("todas as combinacoes prontas produzem pelo menos uma coluna", () => {
    const base = dados([pedido(), pedido({ marca: "Marca Dois" })]);

    for (const combinacao of COMBINACOES_PRONTAS) {
      const resultado = montarRelatorio(
        { ...combinacao.configuracao, filtros: { ...FILTROS_VAZIOS } },
        base,
      );

      expect(resultado.metricas.length, combinacao.id).toBeGreaterThan(0);
      expect(resultado.recusadas, combinacao.id).toHaveLength(0);
    }
  });
});

describe("lucro do relatorio igual ao do painel", () => {
  it("com taxa da plataforma e despesa de influencer, por marca", () => {
    /*
     * Antes, a DRE do relatorio nao recebia a taxa da plataforma: o lucro por
     * marca saia maior que o da tela inicial para os mesmos pedidos. Este
     * teste monta a DRE como o painel monta e exige o mesmo numero.
     */
    const pedidos = [pedido(), pedido({ total: "200.00" })];
    const taxas: TaxaPlataforma[] = [
      {
        metodo: "credit_card",
        percentual: 5,
        valorFixo: 0,
        base: "recebido",
        ativa: true,
        confirmadaNaFatura: false,
        observacao: null,
        atualizadoEm: "2026-09-01T00:00:00.000Z",
      },
    ];
    const despesas: DespesaInfluencer[] = [
      {
        id: "d1",
        influencerId: "i1",
        data: "2026-09-20",
        categoria: "viagem",
        descricao: "Passagem",
        valor: 15,
        atualizadoEm: "2026-09-20T00:00:00.000Z",
      },
      {
        id: "d2",
        influencerId: "i1",
        data: "2026-08-20",
        categoria: "cache",
        descricao: "Do mes anterior",
        valor: 999,
        atualizadoEm: "2026-08-20T00:00:00.000Z",
      },
    ];

    const resultado = montarRelatorio(
      configuracao({ agruparPor: "marca", metricas: ["lucro"], ordenarPor: "lucro" }),
      dados(pedidos, { taxasPlataforma: taxas, despesasInfluencer: despesas }),
    );

    const painel = montarDemonstrativo(pedidos, [custo()], [influencer()], {
      produtos: [],
      impostos: apurarImpostos(pedidos, pedidos, [], [], [influencer()], []),
      taxasPlataforma: apurarTaxasPlataforma(pedidos, taxas),
      despesasInfluencers: despesas,
    });

    expect(painel.totalTaxasPlataforma).toBeGreaterThan(0);
    expect(painel.totalDespesasInfluencers).toBe(15); // a de agosto ficou de fora
    expect(resultado.linhas[0]!.valores.lucro).toBeCloseTo(painel.lucroOperacional, 6);
  });
});

