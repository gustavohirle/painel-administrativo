import { describe, expect, it } from "vitest";

import {
  aplicarPercentualNosContratos,
  BASE_SEM_CONTRATO,
  calcularCMV,
  calcularComissoesPorInfluencer,
  cruzarMarcasComContratos,
  custoUnitarioDe,
  indexarCustos,
  montarDemonstrativo,
  rentabilidadePorProduto,
  somarComissoesDeContratos,
  totalComissoes,
} from "@/lib/costing";
import { reconciliar, type LinhaMarca } from "@/lib/metrics";
import type { CustoProduto, Influencer } from "@/types/dominio";
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
  // bruto = 2000 | recebido = 1000 | frete = 100 | receitaReal = 900

  it("aplica o percentual sobre o bruto", () => {
    const [linha] = calcularComissoesPorInfluencer(pedidos, [influencer({ baseComissao: "bruto" })]);
    expect(linha!.valorBase).toBe(2000);
    expect(linha!.valorComissao).toBeCloseTo(600, 6);
    expect(linha!.diferencaParaBruto).toBeCloseTo(0, 6);
  });

  it("aplica o percentual sobre o recebido", () => {
    const [linha] = calcularComissoesPorInfluencer(pedidos, [influencer({ baseComissao: "recebido" })]);
    expect(linha!.valorBase).toBe(1000);
    expect(linha!.valorComissao).toBeCloseTo(300, 6);
    expect(linha!.diferencaParaBruto).toBeCloseTo(300, 6);
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
    expect(totalComissoes(linhas)).toBeCloseTo(800, 6);
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
    expect(dre.totalComissoes).toBeCloseTo(100, 6); // 10% de 1000 (bruto)
    expect(dre.lucroOperacional).toBeCloseTo(500, 6);
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

/** Linha por marca com valores redondos, para a conta ser conferivel a olho. */
function linhaMarca(parcial: Partial<LinhaMarca> = {}): LinhaMarca {
  return {
    marca: "Marca Teste",
    bruto: 1000,
    naoPago: 200,
    recebido: 800,
    receitaReal: 700,
    taxaNaoPago: 0.2,
    comissaoSobreBruto: 300,
    comissaoSobreReal: 210,
    diferenca: 90,
    alerta: false,
    quantidadePedidos: 10,
    ...parcial,
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

  it("marca sem influencer assume a base bruta, que e a praticada hoje", () => {
    // Assumir a base mais favoravel a empresa mostraria uma comissao MENOR do
    // que a que o cliente efetivamente paga.
    const [linha] = cruzarMarcasComContratos([linhaMarca()], []);

    expect(linha!.baseComissao).toBe("bruto");
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

  it("cada marca incide sobre a base do proprio contrato", () => {
    expect(por("SobreBruto").valorBase).toBe(1000);
    expect(por("SobreRecebido").valorBase).toBe(800);
    expect(por("SobreReal").valorBase).toBe(700);
  });

  it("a comissao e o percentual do simulador sobre essa base", () => {
    expect(por("SobreBruto").comissao).toBeCloseTo(100, 6);
    expect(por("SobreRecebido").comissao).toBeCloseTo(80, 6);
    expect(por("SobreReal").comissao).toBeCloseTo(70, 6);
  });

  it("contrato ja sobre a receita real nao tem diferenca de base", () => {
    expect(por("SobreReal").aMaisQueSobreReceitaReal).toBeCloseTo(0, 6);
  });

  it("sobre o recebido, a diferenca e exatamente o frete", () => {
    // recebido 800 - receita real 700 = 100 de frete; 10% disso e 10.
    expect(por("SobreRecebido").aMaisQueSobreReceitaReal).toBeCloseTo(10, 6);
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

    // A paga sobre 1000, B paga sobre 1400.
    expect(total.comissao).toBeCloseTo(100 + 140, 6);
    // Se as duas fossem sobre a receita real: 700 e 1400.
    expect(total.comissaoSeSobreReceitaReal).toBeCloseTo(70 + 140, 6);
    expect(total.aMaisQueSobreReceitaReal).toBeCloseTo(30, 6);
    expect(total.projecaoAnual).toBeCloseTo(360, 6);
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
