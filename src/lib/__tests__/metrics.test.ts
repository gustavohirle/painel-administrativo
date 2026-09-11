import { describe, expect, it } from "vitest";

import {
  agruparPorMarca,
  agruparPorMetodoPagamento,
  chaveMes,
  classificarPedido,
  compararComissao,
  evolucaoMensal,
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

    expect(c.comissaoSobreBruto).toBeCloseTo(600, 6);
    expect(c.comissaoSobreReal).toBeCloseTo(300, 6);
    expect(c.diferencaMensal).toBeCloseTo(300, 6);
    expect(c.projecaoAnual).toBeCloseTo(3600, 6);
  });

  it("zera a diferenca quando todos os pedidos foram pagos e nao ha frete", () => {
    const r = reconciliar([
      pedido({ total: "1000.00", payment_status: "paid", shipping_cost_customer: "0.00" }),
    ]);
    expect(compararComissao(r, 30).diferencaMensal).toBeCloseTo(0, 6);
  });

  it("acompanha a mudanca de percentual", () => {
    const r = reconciliar([pedido({ total: "1000.00" })]);
    expect(compararComissao(r, 10).comissaoSobreBruto).toBeCloseTo(100, 6);
    expect(compararComissao(r, 50).comissaoSobreBruto).toBeCloseTo(500, 6);
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

  it("tem frete em ~4,7% do recebido", () => {
    const taxa = r.frete / r.recebido;
    expect(taxa).toBeGreaterThan(0.035);
    expect(taxa).toBeLessThan(0.06);
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
