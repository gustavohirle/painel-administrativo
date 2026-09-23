import { describe, expect, it } from "vitest";

import {
  agruparComissoesPorBase,
  aplicarPercentualNosContratos,
  BASE_SEM_CONTRATO,
  calcularCMV,
  catalogoVendido,
  calcularComissoesPorInfluencer,
  cruzarMarcasComContratos,
  custoUnitarioDe,
  despesasQueCabem,
  indexarCustos,
  montarDemonstrativo,
  rentabilidadePorProduto,
  somarComissoesDeContratos,
  totalComissoes,
} from "@/lib/costing";
import { reconciliar, type LinhaMarca } from "@/lib/metrics";
import { apurarTaxasPlataforma } from "@/lib/plataforma";
import type { TaxaPlataforma } from "@/types/plataforma";
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
    total: "100.00",
    discount: "0.00",
    shipping_cost_customer: "0.00",
    shipping_cost_owner: "0.00",
    gateway_name: "Mercado Pago",
    payment_details: { method: "credit_card", credit_card_company: "visa", installments: 1 },
    cancel_reason: null,
    shipping_address: { province: "SP", city: "Sao Paulo", zipcode: "01000-000", country: "BR" },
    customer: {
      id: 1,
      name: "Cliente Teste",
      email: "cliente@exemplo.com.br",
      total_spent: "100.00",
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
    marca: "Marca Teste",
    ...parcial,
  };
}

function custo(parcial: Partial<CustoProduto> = {}): CustoProduto {
  return {
    id: "c1",
    produtoId: 1001,
    varianteId: 100101,
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

function taxaCartao(percentual: number): TaxaPlataforma {
  return {
    metodo: "credit_card",
    percentual,
    valorFixo: 0,
    base: "recebido",
    ativa: true,
    confirmadaNaFatura: false,
    observacao: null,
    atualizadoEm: "2026-09-01T00:00:00.000Z",
  };
}

function influencer(parcial: Partial<Influencer> = {}): Influencer {
  return {
    id: "i1",
    nome: "Influencer Teste",
    marca: "Marca Teste",
    percentual: 30,
    baseComissao: "bruto",
    regime: "simples_nacional",
    anexoSimples: "II",
    uf: "GO",
    cnpj: null,
    inicioAtividade: null,
    rbt12Manual: null,
    ativo: true,
    observacao: null,
    atualizadoEm: "2026-09-01T00:00:00.000Z",
    ...parcial,
  };
}

// ---------------------------------------------------------------------------
// Indice de custos
// ---------------------------------------------------------------------------

describe("indexarCustos / custoUnitarioDe", () => {
  it("soma os quatro componentes do custo", () => {
    const indice = indexarCustos([custo()]);
    expect(custoUnitarioDe(indice, 1001, 100101)).toBe(30);
  });

  it("ficha com varianteId null vale para todas as variantes", () => {
    const indice = indexarCustos([custo({ varianteId: null })]);
    expect(custoUnitarioDe(indice, 1001, 100101)).toBe(30);
    expect(custoUnitarioDe(indice, 1001, 100199)).toBe(30);
  });

  it("ficha de variante tem precedencia sobre a do produto inteiro", () => {
    // Um creme de 30ml e um de 200ml nao custam a mesma coisa.
    const indice = indexarCustos([
      custo({ id: "geral", varianteId: null, custoMateriaPrima: 20 }),
      custo({ id: "especifica", varianteId: 100102, custoMateriaPrima: 60 }),
    ]);
    expect(custoUnitarioDe(indice, 1001, 100102)).toBe(70);
    expect(custoUnitarioDe(indice, 1001, 100101)).toBe(30);
  });

  it("devolve null quando o produto nao tem ficha", () => {
    expect(custoUnitarioDe(indexarCustos([]), 9999, 1)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CMV
// ---------------------------------------------------------------------------

describe("calcularCMV", () => {
  it("multiplica custo unitario pela quantidade vendida", () => {
    const p = pedido({
      products: [
        { id: 1, product_id: 1001, variant_id: 100101, name: "A", price: "100.00", quantity: 3, sku: "A-1" },
      ],
    });
    expect(calcularCMV([p], [custo()]).cmv).toBe(90);
  });

  it("ignora pedidos que nao foram recebidos", () => {
    // Boleto nunca pago normalmente nem chega a ser produzido: somar o custo
    // dele inflaria o CMV e esconderia a margem real.
    const pagos = pedido();
    const naoPago = pedido({ payment_status: "pending" });
    const cancelado = pedido({ status: "cancelled" });

    expect(calcularCMV([pagos, naoPago, cancelado], [custo()]).cmv).toBe(30);
  });

  it("separa receita com e sem ficha de custo e calcula a cobertura", () => {
    const comCusto = pedido();
    const semCusto = pedido({
      products: [
        { id: 2, product_id: 7777, variant_id: 777701, name: "Sem ficha", price: "100.00", quantity: 1, sku: "X" },
      ],
    });

    const r = calcularCMV([comCusto, semCusto], [custo()]);

    expect(r.receitaComCusto).toBe(100);
    expect(r.receitaSemCusto).toBe(100);
    expect(r.cobertura).toBeCloseTo(0.5, 6);
    expect(r.produtosSemCusto).toBe(1);
    expect(r.idsProdutosSemCusto).toEqual([7777]);
  });

  it("cobertura zero sem NaN quando nao ha nenhuma venda", () => {
    const r = calcularCMV([], []);
    expect(r.cobertura).toBe(0);
    expect(Number.isNaN(r.cmv)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Comissoes
// ---------------------------------------------------------------------------

describe("calcularComissoesPorInfluencer", () => {
  const pedidos = [
    pedido({ total: "1000.00", payment_status: "paid", shipping_cost_customer: "100.00" }),
    pedido({ total: "1000.00", payment_status: "pending" }),
  ];
  // bruto = 2000 | frete = 100 | bruto sem frete = 1900 | recebido = 1000 | receitaReal = 900
  // O frete fica fora de TODA base de comissao: e cobrado do cliente por fora.

  it("aplica o percentual sobre o bruto, sem o frete", () => {
    const [linha] = calcularComissoesPorInfluencer(pedidos, [influencer({ baseComissao: "bruto" })]);
    expect(linha!.valorBase).toBe(1900);
    expect(linha!.valorComissao).toBeCloseTo(570, 6);
    expect(linha!.diferencaParaBruto).toBeCloseTo(0, 6);
  });

  it("aplica o percentual sobre o recebido, sem o frete -- igual a receita real", () => {
    const [linha] = calcularComissoesPorInfluencer(pedidos, [influencer({ baseComissao: "recebido" })]);
    expect(linha!.valorBase).toBe(900);
    expect(linha!.valorComissao).toBeCloseTo(270, 6);
    expect(linha!.diferencaParaBruto).toBeCloseTo(300, 6);
  });

  it("produto de R$ 100 com R$ 19 de frete comissiona sobre R$ 100", () => {
    // O exemplo do cliente: o cliente paga R$ 119, o influencer ganha sobre R$ 100.
    const venda = [pedido({ total: "119.00", payment_status: "paid", shipping_cost_customer: "19.00" })];
    for (const base of ["bruto", "recebido", "receitaReal"] as const) {
      const [linha] = calcularComissoesPorInfluencer(venda, [influencer({ baseComissao: base, percentual: 30 })]);
      expect(linha!.valorBase).toBeCloseTo(100, 6);
      expect(linha!.valorComissao).toBeCloseTo(30, 6);
    }
  });

  it("aplica o percentual sobre o que cai na conta: receita real menos as taxas da marca", () => {
    const [linha] = calcularComissoesPorInfluencer(
      pedidos,
      [influencer({ baseComissao: "liquido" })],
      { "Marca Teste": 45, "Outra Marca": 999 },
    );
    expect(linha!.valorBase).toBe(855);
    expect(linha!.valorComissao).toBeCloseTo(256.5, 6);
  });

  it("o exemplo do cliente: R$ 100 + R$ 19 de frete, com 5% de taxa sobre os R$ 119", () => {
    // O que cai na conta sem o frete: 119 - 5,95 de taxa - 19 de frete = 94,05.
    const venda = [pedido({ total: "119.00", payment_status: "paid", shipping_cost_customer: "19.00" })];
    const taxas = apurarTaxasPlataforma(venda, [taxaCartao(5)]);
    const [linha] = calcularComissoesPorInfluencer(
      venda,
      [influencer({ baseComissao: "liquido", percentual: 25 })],
      taxas.porMarca,
    );
    expect(linha!.valorBase).toBeCloseTo(94.05, 6);
    expect(linha!.valorComissao).toBeCloseTo(23.5125, 6);
  });

  it("sem as taxas, o que cai na conta sai igual a receita real", () => {
    const [linha] = calcularComissoesPorInfluencer(pedidos, [influencer({ baseComissao: "liquido" })]);
    expect(linha!.valorBase).toBe(900);
  });

  it("aplica o percentual sobre a receita real", () => {
    const [linha] = calcularComissoesPorInfluencer(pedidos, [influencer({ baseComissao: "receitaReal" })]);
    expect(linha!.valorBase).toBe(900);
    expect(linha!.valorComissao).toBeCloseTo(270, 6);
  });

  it("ignora influencer inativo", () => {
    expect(calcularComissoesPorInfluencer(pedidos, [influencer({ ativo: false })])).toHaveLength(0);
  });

  it("ignora influencer de marca sem venda no periodo", () => {
    expect(calcularComissoesPorInfluencer(pedidos, [influencer({ marca: "Outra" })])).toHaveLength(0);
  });

  it("soma varios influencers da mesma marca", () => {
    const linhas = calcularComissoesPorInfluencer(pedidos, [
      influencer({ id: "i1", percentual: 30 }),
      influencer({ id: "i2", nome: "Segundo", percentual: 10 }),
    ]);
    expect(linhas).toHaveLength(2);
    expect(totalComissoes(linhas)).toBeCloseTo(760, 6); // 40% de 1900
  });
});

// ---------------------------------------------------------------------------
// DRE
// ---------------------------------------------------------------------------

describe("montarDemonstrativo", () => {
  it("encadeia receita real -> margem de contribuicao -> lucro operacional", () => {
    const pedidos = [
      pedido({
        total: "1000.00",
        payment_status: "paid",
        shipping_cost_customer: "100.00",
        products: [
          { id: 1, product_id: 1001, variant_id: 100101, name: "A", price: "900.00", quantity: 10, sku: "A-1" },
        ],
      }),
    ];

    const dre = montarDemonstrativo(pedidos, [custo()], [influencer({ percentual: 10 })]);

    expect(dre.reconciliacao.bruto).toBe(1000);
    expect(dre.reconciliacao.receitaReal).toBe(900);
    expect(dre.cmv.cmv).toBe(300); // 10 unidades x R$ 30
    expect(dre.margemContribuicao).toBe(600);
    expect(dre.margemContribuicaoPercentual).toBeCloseTo(600 / 900, 6);
    expect(dre.totalComissoes).toBeCloseTo(90, 6); // 10% de 900 (bruto sem o frete de 100)
    expect(dre.participacaoSocios).toBeCloseTo(60, 6); // 6% de 1000 (recebido)
    expect(dre.lucroOperacional).toBeCloseTo(450, 6);
  });

  it("com contrato sobre o que cai na conta, a comissao desconta a mesma taxa que a DRE", () => {
    const pedidos = [
      pedido({ total: "1000.00", payment_status: "paid", shipping_cost_customer: "100.00" }),
      pedido({ total: "500.00", payment_status: "paid", marca: "Outra Marca" }),
    ];
    const taxasPlataforma = apurarTaxasPlataforma(pedidos, [taxaCartao(4)]);
    const dre = montarDemonstrativo(pedidos, [], [influencer({ baseComissao: "liquido", percentual: 25 })], {
      taxasPlataforma,
    });

    // Marca Teste: receita real 900, taxa 4% de 1000 = 40. A taxa da outra marca nao entra.
    expect(taxasPlataforma.total).toBeCloseTo(60, 6);
    expect(dre.comissoes[0]!.valorBase).toBeCloseTo(860, 6);
    expect(dre.totalComissoes).toBeCloseTo(215, 6);
  });

  it("participacao dos socios e 6% do RECEBIDO, nao do bruto", () => {
    const pedidos = [
      pedido({ total: "1000.00", payment_status: "paid" }),
      pedido({ total: "500.00", payment_status: "pending" }),
    ];
    const dre = montarDemonstrativo(pedidos, [], []);

    expect(dre.reconciliacao.bruto).toBe(1500);
    expect(dre.percentualParticipacaoSocios).toBe(6);
    expect(dre.participacaoSocios).toBeCloseTo(60, 6);
  });

  it("o percentual dos socios pode ser trocado, e zero tira a linha da conta", () => {
    const pedidos = [pedido({ total: "1000.00", payment_status: "paid" })];
    const seis = montarDemonstrativo(pedidos, [], []);
    const zero = montarDemonstrativo(pedidos, [], [], { percentualParticipacaoSocios: 0 });

    expect(zero.participacaoSocios).toBe(0);
    expect(zero.lucroOperacional - seis.lucroOperacional).toBeCloseTo(60, 6);
  });

  it("expoe a incerteza quando ha produto sem ficha de custo", () => {
    const pedidos = [
      pedido(),
      pedido({
        products: [
          { id: 9, product_id: 7777, variant_id: 777701, name: "Sem ficha", price: "100.00", quantity: 1, sku: "X" },
        ],
      }),
    ];

    const dre = montarDemonstrativo(pedidos, [custo()], []);
    expect(dre.incertezaPorFaltaDeCusto).toBeCloseTo(0.5, 6);
  });

  it("nao produz NaN sem nenhum cadastro", () => {
    const dre = montarDemonstrativo([pedido()], [], []);
    expect(Number.isNaN(dre.lucroOperacional)).toBe(false);
    expect(dre.incertezaPorFaltaDeCusto).toBe(1);
  });

  it("usa a mesma reconciliacao de metrics.ts", () => {
    const pedidos = [pedido({ total: "500.00" }), pedido({ total: "300.00", payment_status: "pending" })];
    expect(montarDemonstrativo(pedidos, [], []).reconciliacao).toEqual(reconciliar(pedidos));
  });
});

// ---------------------------------------------------------------------------
// Rentabilidade por produto
// ---------------------------------------------------------------------------

describe("rentabilidadePorProduto", () => {
  it("calcula margem e mantem visivel o produto sem ficha", () => {
    const pedidos = [
      pedido({
        products: [
          { id: 1, product_id: 1001, variant_id: 100101, name: "Produto A", price: "100.00", quantity: 2, sku: "A-1" },
          { id: 2, product_id: 7777, variant_id: 777701, name: "Produto B", price: "50.00", quantity: 1, sku: "B-1" },
        ],
      }),
    ];

    const linhas = rentabilidadePorProduto(pedidos, [custo()]);
    const a = linhas.find((l) => l.produtoId === 1001)!;
    const b = linhas.find((l) => l.produtoId === 7777)!;

    expect(a.unidadesVendidas).toBe(2);
    expect(a.receita).toBe(200);
    expect(a.custoTotal).toBe(60);
    expect(a.margem).toBe(140);
    expect(a.margemPercentual).toBeCloseTo(0.7, 6);
    expect(a.precoMedio).toBe(100);

    // Sumir com o produto sem ficha esconderia exatamente o que falta cadastrar.
    expect(b.temCusto).toBe(false);
    expect(b.custoTotal).toBeNull();
    expect(b.margem).toBeNull();
  });

  it("ordena por receita, maior primeiro", () => {
    const pedidos = [
      pedido({
        products: [
          { id: 1, product_id: 1, variant_id: 1, name: "Pequeno", price: "10.00", quantity: 1, sku: null },
          { id: 2, product_id: 2, variant_id: 2, name: "Grande", price: "900.00", quantity: 1, sku: null },
        ],
      }),
    ];
    expect(rentabilidadePorProduto(pedidos, [])[0]!.nome).toBe("Grande");
  });
});

// ---------------------------------------------------------------------------
// 5.3 Comissao por marca, na base do contrato
// ---------------------------------------------------------------------------

/**
 * Linha por marca com valores redondos, para a conta ser conferivel a olho.
 *
 * Sem `brutoSemFrete` explicito, supoe que so os pedidos pagos tinham frete:
 * bruto sem frete = bruto - (recebido - receita real). Com os padroes, 900.
 */
function linhaMarca(parcial: Partial<LinhaMarca> = {}): LinhaMarca {
  const base = {
    marca: "Marca Teste",
    bruto: 1000,
    naoPago: 200,
    recebido: 800,
    receitaReal: 700,
    taxaNaoPago: 0.2,
    comissaoSobreBruto: 270,
    comissaoSobreReal: 210,
    diferenca: 60,
    alerta: false,
    quantidadePedidos: 10,
    ...parcial,
  };
  return {
    ...base,
    brutoSemFrete: parcial.brutoSemFrete ?? base.bruto - (base.recebido - base.receitaReal),
  };
}

describe("cruzarMarcasComContratos", () => {
  it("traz o nome, o percentual e a base do contrato de cada marca", () => {
    const [linha] = cruzarMarcasComContratos(
      [linhaMarca({ marca: "Aurora" })],
      [influencer({ marca: "Aurora", nome: "Bia", percentual: 25, baseComissao: "recebido" })],
    );

    expect(linha!.influencerNome).toBe("Bia");
    expect(linha!.percentualContrato).toBe(25);
    expect(linha!.baseComissao).toBe("recebido");
  });

  it("ignora influencer inativo", () => {
    // Inativo nao entra em calculo nenhum, nem de comissao nem de imposto.
    const [linha] = cruzarMarcasComContratos(
      [linhaMarca({ marca: "Aurora" })],
      [influencer({ marca: "Aurora", baseComissao: "receitaReal", ativo: false })],
    );

    expect(linha!.influencerNome).toBeNull();
    expect(linha!.baseComissao).toBe(BASE_SEM_CONTRATO);
  });

  it("com dois na mesma marca, o primeiro ATIVO manda", () => {
    const [linha] = cruzarMarcasComContratos(
      [linhaMarca({ marca: "Aurora" })],
      [
        influencer({ id: "a", marca: "Aurora", nome: "Inativa", ativo: false }),
        influencer({ id: "b", marca: "Aurora", nome: "Ativa", baseComissao: "recebido" }),
        influencer({ id: "c", marca: "Aurora", nome: "Terceira", baseComissao: "receitaReal" }),
      ],
    );

    expect(linha!.influencerNome).toBe("Ativa");
    expect(linha!.baseComissao).toBe("recebido");
  });

  it("marca sem influencer assume a base praticada: o que cai na conta, sem frete", () => {
    const [linha] = cruzarMarcasComContratos([linhaMarca()], []);

    expect(linha!.baseComissao).toBe("liquido");
    expect(linha!.influencerNome).toBeNull();
    expect(linha!.percentualContrato).toBeNull();
  });
});

describe("aplicarPercentualNosContratos", () => {
  const marcas = [
    linhaMarca({ marca: "SobreBruto", bruto: 1000, recebido: 800, receitaReal: 700 }),
    linhaMarca({ marca: "SobreRecebido", bruto: 1000, recebido: 800, receitaReal: 700 }),
    linhaMarca({ marca: "SobreReal", bruto: 1000, recebido: 800, receitaReal: 700 }),
  ];

  const contratos = [
    influencer({ id: "1", marca: "SobreBruto", baseComissao: "bruto" }),
    influencer({ id: "2", marca: "SobreRecebido", baseComissao: "recebido" }),
    influencer({ id: "3", marca: "SobreReal", baseComissao: "receitaReal" }),
  ];

  const linhas = aplicarPercentualNosContratos(
    cruzarMarcasComContratos(marcas, contratos),
    10,
  );
  const por = (marca: string) => linhas.find((l) => l.marca === marca)!;

  it("cada marca incide sobre a base do proprio contrato, sem frete", () => {
    expect(por("SobreBruto").valorBase).toBe(900);
    expect(por("SobreRecebido").valorBase).toBe(700);
    expect(por("SobreReal").valorBase).toBe(700);
  });

  it("a comissao e o percentual do simulador sobre essa base", () => {
    expect(por("SobreBruto").comissao).toBeCloseTo(90, 6);
    expect(por("SobreRecebido").comissao).toBeCloseTo(70, 6);
    expect(por("SobreReal").comissao).toBeCloseTo(70, 6);
  });

  it("contrato ja sobre a receita real nao tem diferenca de base", () => {
    expect(por("SobreReal").aMaisQueSobreReceitaReal).toBeCloseTo(0, 6);
  });

  it("sobre o recebido nao ha diferenca: o frete ja ficou de fora", () => {
    // Antes, recebido 800 - receita real 700 = 100 de frete dava 10 a mais.
    expect(por("SobreRecebido").aMaisQueSobreReceitaReal).toBeCloseTo(0, 6);
  });

  it("ordena pela maior distancia entre as bases", () => {
    expect(linhas.map((l) => l.marca)).toEqual([
      "SobreBruto",
      "SobreRecebido",
      "SobreReal",
    ]);
  });

  it("percentual zero zera tudo sem produzir NaN", () => {
    const zeradas = aplicarPercentualNosContratos(
      cruzarMarcasComContratos(marcas, contratos),
      0,
    );
    for (const l of zeradas) {
      expect(l.comissao).toBe(0);
      expect(l.aMaisQueSobreReceitaReal).toBe(0);
    }
  });
});

describe("somarComissoesDeContratos", () => {
  it("soma cada marca na sua base e projeta a diferenca em 12 meses", () => {
    const linhas = aplicarPercentualNosContratos(
      cruzarMarcasComContratos(
        [
          linhaMarca({ marca: "A", bruto: 1000, recebido: 800, receitaReal: 700 }),
          linhaMarca({ marca: "B", bruto: 2000, recebido: 1500, receitaReal: 1400 }),
        ],
        [
          influencer({ id: "1", marca: "A", baseComissao: "bruto" }),
          influencer({ id: "2", marca: "B", baseComissao: "receitaReal" }),
        ],
      ),
      10,
    );

    const total = somarComissoesDeContratos(linhas);

    // A paga sobre 900 (bruto sem frete), B paga sobre 1400.
    expect(total.comissao).toBeCloseTo(90 + 140, 6);
    // Se as duas fossem sobre a receita real: 700 e 1400.
    expect(total.comissaoSeSobreReceitaReal).toBeCloseTo(70 + 140, 6);
    expect(total.aMaisQueSobreReceitaReal).toBeCloseTo(20, 6);
    expect(total.projecaoAnual).toBeCloseTo(240, 6);
  });

  it("a soma das linhas bate com os totais gerais", () => {
    // O criterio de pronto exige isso: se a tabela nao fechar, o cliente ve.
    const linhas = aplicarPercentualNosContratos(
      cruzarMarcasComContratos(
        [
          linhaMarca({ marca: "A", bruto: 1000, naoPago: 200, recebido: 800, receitaReal: 700 }),
          linhaMarca({ marca: "B", bruto: 2000, naoPago: 500, recebido: 1500, receitaReal: 1400 }),
        ],
        [],
      ),
      30,
    );

    const total = somarComissoesDeContratos(linhas);

    expect(total.bruto).toBe(3000);
    expect(total.naoPago).toBe(700);
    expect(total.recebido).toBe(2300);
    expect(total.receitaReal).toBe(2100);
  });

  it("sem nenhuma marca devolve zeros, sem NaN", () => {
    const total = somarComissoesDeContratos([]);
    expect(total.comissao).toBe(0);
    expect(total.projecaoAnual).toBe(0);
  });
});

describe("agruparComissoesPorBase", () => {
  const marcas = [
    linhaMarca({ marca: "Bruto A", bruto: 1000, recebido: 800, receitaReal: 700 }),
    linhaMarca({ marca: "Bruto B", bruto: 2000, recebido: 1600, receitaReal: 1400 }),
    linhaMarca({ marca: "Recebido A", bruto: 1000, recebido: 800, receitaReal: 700 }),
  ];

  const contratos = [
    influencer({ id: "1", marca: "Bruto A", baseComissao: "bruto" }),
    influencer({ id: "2", marca: "Bruto B", baseComissao: "bruto" }),
    influencer({ id: "3", marca: "Recebido A", baseComissao: "recebido" }),
  ];

  const grupos = agruparComissoesPorBase(
    aplicarPercentualNosContratos(cruzarMarcasComContratos(marcas, contratos), 10),
  );
  const por = (base: string) => grupos.find((g) => g.base === base)!;

  it("uma entrada por base em uso, na ordem canonica", () => {
    expect(grupos.map((g) => g.base)).toEqual(["bruto", "recebido"]);
  });

  it("base que nenhum contrato usa nao vira cartao de zero", () => {
    // Um cartao "Sobre a receita real -- R$ 0,00" afirmaria que existe uma
    // modalidade rendendo nada, quando o que existe e nenhuma marca nela.
    expect(grupos.find((g) => g.base === "receitaReal")).toBeUndefined();
  });

  it("soma a comissao e a base de cada modalidade", () => {
    // Bruto sem frete: 900 + 1800. Recebido sem frete: 700.
    expect(por("bruto").comissao).toBeCloseTo(270, 2);
    expect(por("bruto").valorDaBase).toBeCloseTo(2700, 2);
    expect(por("recebido").comissao).toBeCloseTo(70, 2);
    expect(por("recebido").valorDaBase).toBeCloseTo(700, 2);
  });

  it("a participacao das modalidades fecha em 100%", () => {
    const soma = grupos.reduce((t, g) => t + g.participacao, 0);
    expect(soma).toBeCloseTo(1, 6);
  });

  it("a soma das modalidades bate com o total geral", () => {
    // Se divergir, alguma linha ficou fora de todos os grupos.
    const linhas = aplicarPercentualNosContratos(
      cruzarMarcasComContratos(marcas, contratos),
      10,
    );
    const total = somarComissoesDeContratos(linhas);
    const soma = grupos.reduce((t, g) => t + g.comissao, 0);

    expect(soma).toBeCloseTo(total.comissao, 2);
    expect(grupos.flatMap((g) => g.marcas)).toHaveLength(linhas.length);
  });

  it("lista as marcas de cada modalidade em ordem alfabetica", () => {
    expect(por("bruto").marcas).toEqual(["Bruto A", "Bruto B"]);
  });

  it("mostra quanto cada base acrescenta sobre a receita real", () => {
    // 10% de 2700 = 270 contra 10% de 2100 = 210.
    expect(por("bruto").comissaoSeSobreReceitaReal).toBeCloseTo(210, 2);
    expect(por("bruto").aMaisQueSobreReceitaReal).toBeCloseTo(60, 2);
  });

  it("contrato ja sobre a receita real nao acrescenta nada", () => {
    const grupo = agruparComissoesPorBase(
      aplicarPercentualNosContratos(
        cruzarMarcasComContratos(
          [linhaMarca({ marca: "Real", bruto: 1000, recebido: 800, receitaReal: 700 })],
          [influencer({ id: "9", marca: "Real", baseComissao: "receitaReal" })],
        ),
        10,
      ),
    );

    expect(grupo[0]!.aMaisQueSobreReceitaReal).toBeCloseTo(0, 6);
  });

  it("sem contrato nenhum devolve lista vazia, sem NaN", () => {
    expect(agruparComissoesPorBase([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Despesas de influencer
// ---------------------------------------------------------------------------

function despesa(parcial: Partial<DespesaInfluencer> = {}): DespesaInfluencer {
  return {
    id: "d1",
    influencerId: "i1",
    data: "2026-09-15",
    categoria: "outros",
    descricao: "Passagem",
    valor: 50,
    atualizadoEm: "2026-09-15T00:00:00.000Z",
    ...parcial,
  };
}

describe("despesasQueCabem", () => {
  // Os pedidos de fabrica sao de setembro de 2026 e da "Marca Teste", a mesma
  // marca do influencer "i1".
  const pedidos = [pedido()];
  const influencers = [influencer()];

  it("entra a despesa do mes e da marca dos pedidos", () => {
    expect(despesasQueCabem([despesa()], pedidos, influencers)).toHaveLength(1);
  });

  it("despesa de outro mes nao entra", () => {
    expect(despesasQueCabem([despesa({ data: "2026-08-31" })], pedidos, influencers)).toEqual([]);
  });

  it("despesa do dia primeiro fica no proprio mes, sem escorregar pelo fuso", () => {
    // Por new Date, "2026-09-01" viraria meia-noite UTC -- ainda 31 de agosto
    // no Brasil -- e a despesa cairia no mes anterior.
    expect(despesasQueCabem([despesa({ data: "2026-09-01" })], pedidos, influencers)).toHaveLength(1);
  });

  it("despesa de influencer de outra marca nao entra nos pedidos desta", () => {
    const comOutro = [influencer(), influencer({ id: "i2", marca: "Outra Marca" })];
    expect(despesasQueCabem([despesa({ influencerId: "i2" })], pedidos, comOutro)).toEqual([]);
  });

  it("despesa apontando para influencer que nao existe nao entra", () => {
    expect(despesasQueCabem([despesa({ influencerId: "fantasma" })], pedidos, influencers)).toEqual([]);
  });

  it("sem pedidos nao ha despesa a considerar", () => {
    expect(despesasQueCabem([despesa()], [], influencers)).toEqual([]);
  });
});

describe("montarDemonstrativo com despesas de influencer", () => {
  const pedidos = () => [
    pedido({
      total: "1000.00",
      payment_status: "paid",
      shipping_cost_customer: "100.00",
      products: [
        { id: 1, product_id: 1001, variant_id: 100101, name: "A", price: "900.00", quantity: 10, sku: "A-1" },
      ],
    }),
  ];

  it("a despesa sai do lucro, ao lado da comissao", () => {
    const sem = montarDemonstrativo(pedidos(), [custo()], [influencer({ percentual: 10 })]);
    const com = montarDemonstrativo(pedidos(), [custo()], [influencer({ percentual: 10 })], {
      despesasInfluencers: [despesa({ valor: 120 })],
    });

    expect(sem.lucroOperacional).toBeCloseTo(450, 6);
    expect(com.lucroOperacional).toBeCloseTo(330, 6);
    expect(com.totalDespesasInfluencers).toBe(120);
    // A comissao continua sendo so a comissao: o simulador e o relatorio usam
    // este campo e nao podem passar a contar despesa como se fosse contrato.
    expect(com.totalComissoes).toBeCloseTo(90, 6);
    expect(com.totalInfluencers).toBeCloseTo(210, 6);
  });

  it("despesa de outro mes nao mexe no lucro deste", () => {
    const com = montarDemonstrativo(pedidos(), [custo()], [influencer({ percentual: 10 })], {
      despesasInfluencers: [despesa({ data: "2026-07-10", valor: 9999 })],
    });
    expect(com.lucroOperacional).toBeCloseTo(450, 6);
    expect(com.despesasInfluencers).toEqual([]);
  });

  it("a pizza continua fechando: as parcelas somam exatamente o bruto", () => {
    // Secao 5.1. A fatia "Influencers" carrega comissao + despesas; se ela
    // carregasse so a comissao, faltaria exatamente o valor das despesas.
    const dre = montarDemonstrativo(pedidos(), [custo()], [influencer({ percentual: 10 })], {
      despesasInfluencers: [despesa({ valor: 120 }), despesa({ id: "d2", valor: 35 })],
    });
    const r = dre.reconciliacao;
    const soma =
      r.naoPago + r.cancelado + r.reembolsado + r.frete +
      dre.totalImpostos + dre.totalTaxasPlataforma + dre.cmv.cmv +
      dre.totalInfluencers + dre.participacaoSocios + dre.lucroOperacional;

    expect(soma).toBeCloseTo(r.bruto, 6);
  });

  it("separa marketing das outras despesas, e as duas fecham no total", () => {
    const dre = montarDemonstrativo(pedidos(), [custo()], [influencer({ percentual: 10 })], {
      despesasInfluencers: [
        despesa({ id: "d1", categoria: "marketing", descricao: "Tha Beauty - Marketing", valor: 120 }),
        despesa({ id: "d2", categoria: "marketing", descricao: "Anúncio", valor: 30 }),
        despesa({ id: "d3", categoria: "outros", descricao: "Passagem", valor: 35 }),
      ],
    });

    expect(dre.totalDespesasMarketing).toBeCloseTo(150, 6);
    expect(dre.totalDespesasOutras).toBeCloseTo(35, 6);
    expect(dre.totalDespesasMarketing + dre.totalDespesasOutras).toBeCloseTo(
      dre.totalDespesasInfluencers,
      6,
    );
  });

  it("a pizza fecha com as TRES fatias de influencer no lugar de uma", () => {
    /*
     * A fatia unica virou comissao + marketing + outras (23/09/2026). Se uma
     * das tres ficasse de fora, ou se `totalDespesasOutras` deixasse de ser o
     * resto, a soma nao bateria no bruto -- e a pizza e o primeiro lugar onde
     * isso apareceria.
     */
    const dre = montarDemonstrativo(pedidos(), [custo()], [influencer({ percentual: 10 })], {
      despesasInfluencers: [
        despesa({ id: "d1", categoria: "marketing", descricao: "Marketing", valor: 120 }),
        despesa({ id: "d2", categoria: "outros", descricao: "Folha", valor: 35 }),
      ],
    });
    const r = dre.reconciliacao;
    const soma =
      r.naoPago + r.cancelado + r.reembolsado + r.frete +
      dre.totalImpostos + dre.totalTaxasPlataforma + dre.cmv.cmv +
      dre.totalComissoes + dre.totalDespesasMarketing + dre.totalDespesasOutras +
      dre.participacaoSocios + dre.lucroOperacional;

    expect(soma).toBeCloseTo(r.bruto, 6);
  });

  it("categoria fora das duas cai em 'outras', e a soma continua fechando", () => {
    // O repositorio ja normaliza na leitura, mas a DRE nao pode depender
    // disso: `totalDespesasOutras` e o RESTO, nao uma segunda soma.
    const dre = montarDemonstrativo(pedidos(), [custo()], [influencer({ percentual: 10 })], {
      despesasInfluencers: [
        despesa({ id: "d1", categoria: "viagem" as never, descricao: "Viagem", valor: 40 }),
      ],
    });

    expect(dre.totalDespesasMarketing).toBe(0);
    expect(dre.totalDespesasOutras).toBeCloseTo(40, 6);
    expect(dre.totalDespesasInfluencers).toBeCloseTo(40, 6);
  });
});

describe("brinde a R$ 0", () => {
  const brinde = { id: 9, product_id: 2002, variant_id: 200201, name: "Beauty Balm Sortido", price: "0.00", quantity: 3, sku: null };
  const pedidos = [pedido({ products: [pedido().products[0]!, brinde] })];

  it("sem ficha, fica fora do custo, da rentabilidade e da lista de vendidos", () => {
    const cmv = calcularCMV(pedidos, [custo()]);
    expect(cmv).toMatchObject({ produtosSemCusto: 0, cobertura: 1, cmv: 30 });
    expect(rentabilidadePorProduto(pedidos, [custo()]).map((l) => l.produtoId)).toEqual([1001]);
    expect(catalogoVendido(pedidos, [custo()]).map((p) => p.produtoId)).toEqual([1001]);
  });

  it("com ficha, o custo dele é real e sai da margem", () => {
    const fichaBrinde = custo({ id: "c2", produtoId: 2002, varianteId: 200201, custoMateriaPrima: 4, custoEmbalagem: 0, custoMaoDeObra: 0, custoIndireto: 0 });
    const cmv = calcularCMV(pedidos, [custo(), fichaBrinde]);
    expect(cmv.cmv).toBe(30 + 12);
    expect(rentabilidadePorProduto(pedidos, [custo(), fichaBrinde])).toHaveLength(2);
  });

  it("produto vendido com preço e sem ficha continua sendo apontado", () => {
    expect(calcularCMV(pedidos, []).produtosSemCusto).toBe(1);
  });
});
