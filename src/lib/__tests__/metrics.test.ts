import { describe, expect, it } from "vitest";

import {
  agruparPorMarca,
  agruparPorMetodoPagamento,
  chaveDia,
  chaveMes,
  classificarPedido,
  compararComissao,
  diaDeHoje,
  evolucaoMensal,
  evolucaoPorMarca,
  vendasPorDia,
  filtrarPorDia,
  filtrarPorMes,
  mesesDisponiveis,
  reconciliar,
} from "@/lib/metrics";
import type { Pedido } from "@/types/nuvemshop";
import { gerarBaseDemonstracao } from "@/data/geradorPedidos";

// ---------------------------------------------------------------------------
// Fabrica de pedido para os testes unitarios
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
    shipping_cost_owner: "18.00",
    gateway_name: "Mercado Pago",
    payment_details: {
      method: "credit_card",
      credit_card_company: "visa",
      installments: 1,
    },
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
        name: "Produto Teste",
        price: "100.00",
        quantity: 1,
        sku: "TESTE-001",
      },
    ],
    marca: "Marca Teste",
    ...parcial,
  };
}

// ---------------------------------------------------------------------------
// Classificacao e precedencia
// ---------------------------------------------------------------------------

describe("classificarPedido", () => {
  it("trata cancelado como cancelado, mesmo que o pagamento esteja pendente", () => {
    // Esta e a armadilha do dobro de contagem: sem precedencia, este pedido
    // apareceria em "cancelado" E em "nao pago".
    const p = pedido({ status: "cancelled", payment_status: "pending" });
    expect(classificarPedido(p)).toBe("cancelado");
  });

  it("trata cancelado como cancelado, mesmo que tenha sido estornado", () => {
    const p = pedido({ status: "cancelled", payment_status: "refunded" });
    expect(classificarPedido(p)).toBe("cancelado");
  });

  it("classifica estorno e reembolso como reembolsado", () => {
    expect(classificarPedido(pedido({ payment_status: "refunded" }))).toBe("reembolsado");
    expect(classificarPedido(pedido({ payment_status: "voided" }))).toBe("reembolsado");
  });

  it("classifica pendente e abandonado como nao pago", () => {
    expect(classificarPedido(pedido({ payment_status: "pending" }))).toBe("naoPago");
    expect(classificarPedido(pedido({ payment_status: "abandoned" }))).toBe("naoPago");
  });

  it("classifica pago e autorizado como recebido", () => {
    expect(classificarPedido(pedido({ payment_status: "paid" }))).toBe("recebido");
    expect(classificarPedido(pedido({ payment_status: "authorized" }))).toBe("recebido");
  });
});

// ---------------------------------------------------------------------------
// Reconciliacao -- a cascata precisa FECHAR
// ---------------------------------------------------------------------------

describe("reconciliar", () => {
  it("divide o frete cobrado entre a transportadora e o intermediário, sem mudar o total", () => {
    // O caso real: o cliente paga R$ 15,46, a transportadora recebe R$ 14,73 e
    // a Intelipost fica com R$ 0,73.
    const r = reconciliar([
      pedido({ total: "125.36", shipping_cost_customer: "15.46", shipping_cost_owner: "14.73" }),
      pedido({ total: "70.41", shipping_cost_customer: "20.51", shipping_cost_owner: "19.78" }),
      // Nao pago: nao entra em nenhuma das duas partes.
      pedido({ payment_status: "pending", shipping_cost_customer: "30.00", shipping_cost_owner: "29.27" }),
    ]);
    expect(r.frete).toBeCloseTo(35.97, 10);
    expect(r.freteTransportadora).toBeCloseTo(34.51, 10);
    expect(r.freteIntermediario).toBeCloseTo(1.46, 10);
    expect(r.receitaReal).toBeCloseTo(125.36 + 70.41 - 35.97, 10);
  });

  it("sem o custo da transportadora, o frete inteiro fica com ela", () => {
    // Campo ausente vira "0.00" na borda; jogar tudo no intermediario inventaria custo.
    const r = reconciliar([pedido({ shipping_cost_customer: "19.00", shipping_cost_owner: "0.00" })]);
    expect(r.freteTransportadora).toBe(19);
    expect(r.freteIntermediario).toBe(0);
  });

  it("loja pagando mais do que cobrou não gera intermediário negativo, e a diferença é custo", () => {
    const r = reconciliar([pedido({ shipping_cost_customer: "10.00", shipping_cost_owner: "14.00" })]);
    expect(r.freteTransportadora).toBe(10);
    expect(r.freteIntermediario).toBe(0);
    // Frete gratis (TikTok Shop): a loja bancou R$ 4, e isso e custo.
    expect(r.freteAbsorvido).toBe(4);
  });

  it("frete grátis inteiro: o cliente não paga nada e a loja banca tudo", () => {
    const r = reconciliar([
      pedido({ total: "149.00", shipping_cost_customer: "0.00", shipping_cost_owner: "73.34" }),
      // Nao pago nao entra: o frete dele nunca foi gasto.
      pedido({ payment_status: "pending", shipping_cost_customer: "0.00", shipping_cost_owner: "50.00" }),
    ]);
    expect(r.frete).toBe(0);
    expect(r.freteAbsorvido).toBeCloseTo(73.34, 10);
    expect(r.receitaReal).toBeCloseTo(149, 10);
  });

  it("onde o cliente paga o frete, nada é absorvido", () => {
    const r = reconciliar([pedido({ shipping_cost_customer: "19.00", shipping_cost_owner: "19.00" })]);
    expect(r.freteAbsorvido).toBe(0);
  });

  it("fecha a aritmetica da cascata", () => {
    const pedidos = [
      pedido({ total: "1000.00", payment_status: "paid", shipping_cost_customer: "50.00" }),
      pedido({ total: "300.00", payment_status: "pending" }),
      pedido({ total: "200.00", status: "cancelled" }),
      pedido({ total: "100.00", payment_status: "refunded" }),
    ];

    const r = reconciliar(pedidos);

    expect(r.bruto).toBe(1600);
    expect(r.naoPago).toBe(300);
    expect(r.cancelado).toBe(200);
    expect(r.reembolsado).toBe(100);
    expect(r.recebido).toBe(1000);
    expect(r.recebido).toBe(r.bruto - r.naoPago - r.cancelado - r.reembolsado);
    expect(r.frete).toBe(50);
    expect(r.receitaReal).toBe(950);
  });

  it("soma frete apenas dos pedidos recebidos", () => {
    // Frete de pedido nunca pago nao entra: aquele dinheiro nao circulou.
    const pedidos = [
      pedido({ total: "500.00", payment_status: "paid", shipping_cost_customer: "30.00" }),
      pedido({ total: "500.00", payment_status: "pending", shipping_cost_customer: "30.00" }),
    ];
    expect(reconciliar(pedidos).frete).toBe(30);
  });

  it("nao conta o mesmo pedido em duas categorias", () => {
    const pedidos = [
      pedido({ total: "100.00", status: "cancelled", payment_status: "pending" }),
      pedido({ total: "100.00", status: "cancelled", payment_status: "refunded" }),
    ];
    const r = reconciliar(pedidos);

    expect(r.cancelado).toBe(200);
    expect(r.naoPago).toBe(0);
    expect(r.reembolsado).toBe(0);
    expect(r.quantidade.cancelado).toBe(2);
  });

  it("devolve zeros para lista vazia, sem NaN", () => {
    const r = reconciliar([]);
    expect(r.bruto).toBe(0);
    expect(r.receitaReal).toBe(0);
    expect(Number.isNaN(r.recebido)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Comissao
// ---------------------------------------------------------------------------

describe("compararComissao", () => {
  it("calcula a diferenca entre as duas bases e a projecao anual", () => {
    const r = reconciliar([
      pedido({ total: "1000.00", payment_status: "paid", shipping_cost_customer: "0.00" }),
      pedido({ total: "1000.00", payment_status: "pending" }),
    ]);

    const c = compararComissao(r, 30);

    // Bruto sem frete: 1000 + (1000 - 20 do frete do pendente) = 1980.
    expect(c.comissaoSobreBruto).toBeCloseTo(594, 6);
    expect(c.comissaoSobreReal).toBeCloseTo(300, 6);
    expect(c.diferencaMensal).toBeCloseTo(294, 6);
    expect(c.projecaoAnual).toBeCloseTo(3528, 6);
  });

  it("zera a diferenca quando todos os pedidos foram pagos e nao ha frete", () => {
    const r = reconciliar([
      pedido({ total: "1000.00", payment_status: "paid", shipping_cost_customer: "0.00" }),
    ]);
    expect(compararComissao(r, 30).diferencaMensal).toBeCloseTo(0, 6);
  });

  it("acompanha a mudanca de percentual", () => {
    // Total 1000 com 20 de frete: a base e 980.
    const r = reconciliar([pedido({ total: "1000.00" })]);
    expect(compararComissao(r, 10).comissaoSobreBruto).toBeCloseTo(98, 6);
    expect(compararComissao(r, 50).comissaoSobreBruto).toBeCloseTo(490, 6);
  });
});

// ---------------------------------------------------------------------------
// Por marca
// ---------------------------------------------------------------------------

describe("agruparPorMarca", () => {
  it("soma das linhas bate com o total geral", () => {
    const pedidos = [
      pedido({ marca: "A", total: "1000.00", payment_status: "paid" }),
      pedido({ marca: "A", total: "500.00", payment_status: "pending" }),
      pedido({ marca: "B", total: "800.00", payment_status: "paid" }),
      pedido({ marca: "B", total: "200.00", status: "cancelled" }),
    ];

    const geral = reconciliar(pedidos);
    const linhas = agruparPorMarca(pedidos, 30);

    const somaBruto = linhas.reduce((s, l) => s + l.bruto, 0);
    const somaRecebido = linhas.reduce((s, l) => s + l.recebido, 0);
    const somaReal = linhas.reduce((s, l) => s + l.receitaReal, 0);

    expect(somaBruto).toBeCloseTo(geral.bruto, 6);
    expect(somaRecebido).toBeCloseTo(geral.recebido, 6);
    expect(somaReal).toBeCloseTo(geral.receitaReal, 6);
  });

  it("ordena pela maior diferenca de comissao", () => {
    const pedidos = [
      pedido({ marca: "Pouca", total: "1000.00", payment_status: "paid", shipping_cost_customer: "0.00" }),
      pedido({ marca: "Muita", total: "1000.00", payment_status: "pending" }),
      pedido({ marca: "Muita", total: "1000.00", payment_status: "paid", shipping_cost_customer: "0.00" }),
    ];

    const linhas = agruparPorMarca(pedidos, 30);
    expect(linhas[0]!.marca).toBe("Muita");
  });

  it("marca alerta acima de 20% de nao pagamento", () => {
    const pedidos = [
      pedido({ marca: "Ruim", total: "300.00", payment_status: "pending" }),
      pedido({ marca: "Ruim", total: "700.00", payment_status: "paid" }),
      pedido({ marca: "Boa", total: "100.00", payment_status: "pending" }),
      pedido({ marca: "Boa", total: "900.00", payment_status: "paid" }),
    ];

    const linhas = agruparPorMarca(pedidos, 30);
    expect(linhas.find((l) => l.marca === "Ruim")!.alerta).toBe(true);
    expect(linhas.find((l) => l.marca === "Boa")!.alerta).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Meios de pagamento e evolucao
// ---------------------------------------------------------------------------

describe("agruparPorMetodoPagamento", () => {
  it("calcula participacao e taxa de nao pagamento por metodo", () => {
    const pedidos = [
      pedido({ payment_details: { method: "boleto", credit_card_company: null, installments: 1 }, total: "100.00", payment_status: "pending" }),
      pedido({ payment_details: { method: "boleto", credit_card_company: null, installments: 1 }, total: "100.00", payment_status: "paid" }),
      pedido({ payment_details: { method: "pix", credit_card_company: null, installments: 1 }, total: "100.00", payment_status: "paid" }),
      pedido({ payment_details: { method: "pix", credit_card_company: null, installments: 1 }, total: "100.00", payment_status: "paid" }),
    ];

    const linhas = agruparPorMetodoPagamento(pedidos);
    const boleto = linhas.find((l) => l.metodo === "boleto")!;
    const pix = linhas.find((l) => l.metodo === "pix")!;

    expect(boleto.participacao).toBeCloseTo(0.5, 6);
    expect(boleto.taxaNaoPagamento).toBeCloseTo(0.5, 6);
    expect(pix.taxaNaoPagamento).toBeCloseTo(0, 6);
  });
});

describe("vendasPorDia", () => {
  const base = () => [
    pedido({ created_at: "2026-09-01T10:00:00-03:00", total: "100.00" }),
    pedido({ created_at: "2026-09-01T15:00:00-03:00", total: "50.00", payment_status: "pending", paid_at: null }),
    pedido({ created_at: "2026-09-03T10:00:00-03:00", total: "200.00" }),
    // De outro mes: nao entra.
    pedido({ created_at: "2026-08-31T23:00:00-03:00", total: "999.00" }),
  ];

  it("traz TODOS os dias do mes, com zero onde nao houve venda", () => {
    // Pular o dia sem venda juntaria o dia 1 com o 3 como se fossem vizinhos.
    const v = vendasPorDia(base(), "2026-09");
    expect(v.dias).toHaveLength(30);
    expect(v.dias[0]!.dia).toBe("2026-09-01");
    expect(v.dias[29]!.dia).toBe("2026-09-30");
    expect(v.dias[1]).toEqual({ dia: "2026-09-02", quantidade: 0, bruto: 0, recebido: 0 });
  });

  it("separa o vendido do que ja entrou, pela mesma reconciliar", () => {
    const v = vendasPorDia(base(), "2026-09");
    expect(v.dias[0]).toEqual({ dia: "2026-09-01", quantidade: 2, bruto: 150, recebido: 100 });
    expect(v.dias[2]).toEqual({ dia: "2026-09-03", quantidade: 1, bruto: 200, recebido: 200 });
  });

  it("o total do mes e a soma dos dias -- e nao conta pedido de outro mes", () => {
    const v = vendasPorDia(base(), "2026-09");
    const soma = v.dias.reduce(
      (s, d) => ({ q: s.q + d.quantidade, b: s.b + d.bruto, r: s.r + d.recebido }),
      { q: 0, b: 0, r: 0 },
    );
    expect(v.total).toEqual({ quantidade: soma.q, bruto: soma.b, recebido: soma.r });
    expect(v.total.bruto).toBe(350);
  });

  it("o dia de hoje no grafico bate com o quadro de vendas de hoje", () => {
    // Os dois leem `reconciliar`; se um dia divergirem, alguem passou a somar
    // a mao num dos lados.
    const pedidos = base();
    const dia = vendasPorDia(pedidos, "2026-09").dias[0]!;
    const quadro = reconciliar(filtrarPorDia(pedidos, "2026-09-01"));
    expect(dia.bruto).toBe(quadro.bruto);
    expect(dia.recebido).toBe(quadro.recebido);
    expect(dia.quantidade).toBe(quadro.quantidade.total);
  });

  it("sabe quantos dias tem cada mes, inclusive fevereiro bissexto", () => {
    expect(vendasPorDia([], "2026-02").dias).toHaveLength(28);
    expect(vendasPorDia([], "2028-02").dias).toHaveLength(29);
    expect(vendasPorDia([], "2026-07").dias).toHaveLength(31);
  });

  it("mes sem venda devolve os dias zerados e total zero", () => {
    const v = vendasPorDia([], "2026-09");
    expect(v.total).toEqual({ quantidade: 0, bruto: 0, recebido: 0 });
    expect(v.dias.every((d) => d.quantidade === 0)).toBe(true);
  });
});

describe("evolucaoPorMarca", () => {
  const base = () => [
    pedido({ marca: "Grande", created_at: "2026-07-05T10:00:00.000Z", total: "1000.00" }),
    pedido({ marca: "Grande", created_at: "2026-08-05T10:00:00.000Z", total: "2000.00" }),
    pedido({ marca: "Grande", created_at: "2026-09-05T10:00:00.000Z", total: "3000.00" }),
    pedido({ marca: "Pequena", created_at: "2026-09-05T10:00:00.000Z", total: "500.00" }),
  ];

  it("uma serie por marca, e o total mes a mes", () => {
    const e = evolucaoPorMarca(base());

    expect(e.meses).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(e.series.map((s) => s.marca)).toEqual(["Grande", "Pequena"]);
    expect(e.total).toEqual([1000, 2000, 3500]);
  });

  it("mes sem venda vira ZERO, e nao um buraco na linha", () => {
    /*
     * As lojas novas (Duale e Revenda) so tem venda a partir de julho/2026.
     * Sem o zero, a polilinha ligaria o ultimo mes com venda ao primeiro
     * seguinte e passaria por cima do periodo em que a loja nao existia.
     */
    const e = evolucaoPorMarca(base());
    const pequena = e.series.find((s) => s.marca === "Pequena")!;

    expect(pequena.valores).toEqual([0, 0, 500]);
    expect(pequena.valores).toHaveLength(e.meses.length);
  });

  it("ordena da marca que mais faturou no periodo para a que menos", () => {
    const invertido = [
      pedido({ marca: "A", created_at: "2026-09-05T10:00:00.000Z", total: "10.00" }),
      pedido({ marca: "B", created_at: "2026-09-05T10:00:00.000Z", total: "90.00" }),
    ];
    expect(evolucaoPorMarca(invertido).series.map((s) => s.marca)).toEqual(["B", "A"]);
  });

  it("limita aos meses pedidos, mantendo os mais recentes", () => {
    const e = evolucaoPorMarca(base(), 2);
    expect(e.meses).toEqual(["2026-08", "2026-09"]);
    expect(e.total).toEqual([2000, 3500]);
    expect(e.series.find((s) => s.marca === "Grande")!.valores).toEqual([2000, 3000]);
  });

  it("o total bate com o bruto de `evolucaoMensal` nos mesmos meses", () => {
    // As duas leem `reconciliar`; se um dia divergirem, e porque alguem passou
    // a somar a mao num dos lados.
    const pedidos = base();
    const porMarca = evolucaoPorMarca(pedidos);
    const geral = evolucaoMensal(pedidos, 12);

    expect(porMarca.meses).toEqual(geral.map((p) => p.mes));
    expect(porMarca.total).toEqual(geral.map((p) => p.bruto));
  });

  it("sem pedidos devolve vazio, sem quebrar", () => {
    const e = evolucaoPorMarca([]);
    expect(e.meses).toEqual([]);
    expect(e.series).toEqual([]);
    expect(e.total).toEqual([]);
  });
});

describe("evolucaoMensal", () => {
  it("agrupa por mes de criacao e devolve em ordem cronologica", () => {
    const pedidos = [
      pedido({ created_at: "2026-07-15T10:00:00.000Z", total: "100.00" }),
      pedido({ created_at: "2026-08-15T10:00:00.000Z", total: "200.00" }),
      pedido({ created_at: "2026-09-15T10:00:00.000Z", total: "300.00" }),
    ];

    const pontos = evolucaoMensal(pedidos);
    expect(pontos.map((p) => p.mes)).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(pontos[2]!.bruto).toBe(300);
  });

  it("limita a quantidade de meses pedida, mantendo os mais recentes", () => {
    const pedidos = [
      pedido({ created_at: "2026-05-01T10:00:00.000Z" }),
      pedido({ created_at: "2026-06-01T10:00:00.000Z" }),
      pedido({ created_at: "2026-07-01T10:00:00.000Z" }),
    ];
    expect(evolucaoMensal(pedidos, 2).map((p) => p.mes)).toEqual(["2026-06", "2026-07"]);
  });

  it("chaveMes extrai ano-mes do ISO", () => {
    expect(chaveMes("2026-09-15T10:00:00.000Z")).toBe("2026-09");
  });

  it("mesesDisponiveis vem do mais recente para o mais antigo", () => {
    const pedidos = [
      pedido({ created_at: "2026-07-01T10:00:00.000Z" }),
      pedido({ created_at: "2026-09-01T10:00:00.000Z" }),
    ];
    expect(mesesDisponiveis(pedidos)).toEqual(["2026-09", "2026-07"]);
  });
});

// ---------------------------------------------------------------------------
// Base de demonstracao: os numeros que o cliente vai ver
// ---------------------------------------------------------------------------

describe("base de demonstracao", () => {
  const referencia = new Date(Date.UTC(2026, 8, 15));
  const { pedidos } = gerarBaseDemonstracao(undefined, referencia);
  const meses = mesesDisponiveis(pedidos);
  const mesAtual = filtrarPorMes(pedidos, meses[0]!);
  const r = reconciliar(mesAtual);

  it("e deterministica: mesmo seed, mesmos numeros", () => {
    const a = gerarBaseDemonstracao(undefined, referencia);
    const b = gerarBaseDemonstracao(undefined, referencia);
    expect(reconciliar(a.pedidos).bruto).toBe(reconciliar(b.pedidos).bruto);
    expect(a.pedidos.length).toBe(b.pedidos.length);
  });

  it("tem 6 meses de historico", () => {
    expect(meses).toHaveLength(6);
  });

  it("tem 5 marcas", () => {
    expect(new Set(pedidos.map((p) => p.marca)).size).toBe(5);
  });

  it("tem ~8.400 pedidos no mes mais recente", () => {
    expect(mesAtual.length).toBeGreaterThan(8000);
    expect(mesAtual.length).toBeLessThan(8800);
  });

  it("fatura ~R$ 3,14 milhoes no mes mais recente", () => {
    expect(r.bruto).toBeGreaterThan(2_900_000);
    expect(r.bruto).toBeLessThan(3_400_000);
  });

  it("tem ~14% de nao pago", () => {
    const taxa = r.naoPago / r.bruto;
    expect(taxa).toBeGreaterThan(0.11);
    expect(taxa).toBeLessThan(0.17);
  });

  it("tem ~5% de cancelado", () => {
    const taxa = r.cancelado / r.bruto;
    expect(taxa).toBeGreaterThan(0.035);
    expect(taxa).toBeLessThan(0.065);
  });

  it("tem ~1,3% de reembolsado", () => {
    const taxa = r.reembolsado / r.bruto;
    expect(taxa).toBeGreaterThan(0.008);
    expect(taxa).toBeLessThan(0.02);
  });

  it("cobra R$ 19 de frete por pedido, sem excecao", () => {
    // Afirmacao exata, nao banda: o frete e fixo. Se um pedido passar a ter
    // frete gratis ou proporcional, esta conta quebra na hora -- que e o
    // comportamento desejado, porque mexer no frete mexe no bruto e, por
    // tabela, na comissao de quem tem contrato sobre o bruto.
    expect(r.frete / r.quantidade.recebido).toBeCloseTo(19, 2);
  });

  it("o frete fica perto de 5% do recebido", () => {
    const taxa = r.frete / r.recebido;
    expect(taxa).toBeGreaterThan(0.04);
    expect(taxa).toBeLessThan(0.065);
  });

  it("a receita real continua sendo o valor da mercadoria", () => {
    // O frete maior NAO come o lucro: ele entra no total e sai na deducao.
    // Se um dia a receita real cair junto com esse aumento, o frete passou a
    // ser descontado duas vezes.
    expect(r.receitaReal).toBeGreaterThan(2_100_000);
    expect(r.receitaReal).toBeLessThan(2_700_000);
  });

  it("fecha a cascata na base gerada", () => {
    expect(r.recebido).toBeCloseTo(
      r.bruto - r.naoPago - r.cancelado - r.reembolsado,
      4,
    );
  });

  it("tem exatamente uma marca acima do limite de alerta", () => {
    const linhas = agruparPorMarca(mesAtual, 30);
    expect(linhas.filter((l) => l.alerta)).toHaveLength(1);
  });

  it("boleto tem taxa de nao pagamento muito maior que cartao", () => {
    const linhas = agruparPorMetodoPagamento(mesAtual);
    const boleto = linhas.find((l) => l.metodo === "boleto")!;
    const cartao = linhas.find((l) => l.metodo === "credit_card")!;
    expect(boleto.taxaNaoPagamento).toBeGreaterThan(cartao.taxaNaoPagamento * 3);
  });
});

// ---------------------------------------------------------------------------
// O dia de hoje (5.16, "Vendas de hoje")
// ---------------------------------------------------------------------------

describe("dia de hoje", () => {
  it("corta o dia do created_at, como chaveMes corta o mes", () => {
    expect(chaveDia("2026-09-18T22:30:00.000-03:00")).toBe("2026-09-18");
  });

  it("le o dia em Brasilia, e nao em UTC", () => {
    // 01:30 de 19/09 em UTC ainda e 22:30 de 18/09 aqui. Num servidor em UTC
    // -- que e o caso da producao -- o quadro de vendas de hoje zeraria tres
    // horas antes da meia-noite de quem esta olhando.
    expect(diaDeHoje(new Date("2026-09-19T01:30:00.000Z"))).toBe("2026-09-18");
    expect(diaDeHoje(new Date("2026-09-19T03:30:00.000Z"))).toBe("2026-09-19");
  });

  it("comeca a contar na meia-noite, nao nas ultimas 24 horas", () => {
    const ontemTarde = pedido({ created_at: "2026-09-17T23:59:00.000-03:00" });
    const logoDepoisDaMeiaNoite = pedido({ created_at: "2026-09-18T00:01:00.000-03:00" });
    const hojeANoite = pedido({ created_at: "2026-09-18T23:59:00.000-03:00" });
    const amanha = pedido({ created_at: "2026-09-19T00:00:00.000-03:00" });

    const doDia = filtrarPorDia(
      [ontemTarde, logoDepoisDaMeiaNoite, hojeANoite, amanha],
      "2026-09-18",
    );
    expect(doDia).toEqual([logoDepoisDaMeiaNoite, hojeANoite]);
  });

  it("o valor do dia sai de reconciliar, sem conta propria", () => {
    const doDia = filtrarPorDia(
      [
        pedido({ created_at: "2026-09-18T09:00:00.000-03:00", total: "100.00" }),
        pedido({
          created_at: "2026-09-18T10:00:00.000-03:00",
          total: "50.00",
          payment_status: "pending",
          status: "open",
        }),
        pedido({ created_at: "2026-09-17T10:00:00.000-03:00", total: "999.00" }),
      ],
      "2026-09-18",
    );
    const r = reconciliar(doDia);
    expect(r.quantidade.total).toBe(2);
    expect(r.bruto).toBeCloseTo(150, 2);
    expect(r.recebido).toBeCloseTo(100, 2);
  });
});
