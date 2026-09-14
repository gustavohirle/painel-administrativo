import { describe, expect, it } from "vitest";

import { apurarTaxasPlataforma, taxaDoPedido } from "@/lib/plataforma";
import { custoDaTransacao, type TaxaPlataforma } from "@/types/plataforma";
import type { Pedido } from "@/types/nuvemshop";

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
    gateway_name: "Nuvem Pago",
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
      { id, product_id: 1001, variant_id: 100101, name: "Produto A", price: "100.00", quantity: 1, sku: "A-1" },
    ],
    marca: "Marca Teste",
    ...parcial,
  };
}

function taxa(parcial: Partial<TaxaPlataforma> = {}): TaxaPlataforma {
  return {
    metodo: "credit_card",
    percentual: 5,
    valorFixo: 0,
    // Os testes existentes falam de cobranca sobre o que foi pago.
    base: "recebido",
    ativa: true,
    confirmadaNaFatura: false,
    observacao: null,
    atualizadoEm: "2026-09-01T00:00:00.000Z",
    ...parcial,
  };
}

describe("custoDaTransacao", () => {
  it("soma o percentual com o valor fixo", () => {
    expect(custoDaTransacao(taxa({ percentual: 5, valorFixo: 3 }), 100)).toBeCloseTo(8, 2);
  });

  it("taxa inativa nao custa nada", () => {
    expect(custoDaTransacao(taxa({ ativa: false, valorFixo: 3 }), 100)).toBe(0);
  });
});

describe("apurarTaxasPlataforma", () => {
  it("cobra so dos pedidos recebidos", () => {
    // Boleto gerado e nunca pago nao gera cobranca do gateway. Somar a taxa
    // dele inventaria um custo que ninguem debitou.
    const r = apurarTaxasPlataforma(
      [
        pedido(),
        pedido({ status: "cancelled" }),
        pedido({ payment_status: "pending", paid_at: null }),
      ],
      [taxa()],
    );

    expect(r.porMetodo[0]!.pedidos).toBe(1);
    expect(r.total).toBeCloseTo(5, 2);
  });

  it("base 'bruto' cobra tambem do que nao foi pago", () => {
    // E o caso do boleto: o emissor costuma tarifar por registro, nao por
    // pagamento. Tres pedidos de R$ 100, so um pago.
    const r = apurarTaxasPlataforma(
      [
        pedido(),
        pedido({ status: "cancelled" }),
        pedido({ payment_status: "pending", paid_at: null }),
      ],
      [taxa({ base: "bruto", percentual: 5 })],
    );

    const linha = r.porMetodo[0]!;
    expect(linha.pedidosNaBase).toBe(3);
    expect(linha.base).toBeCloseTo(300, 2);
    expect(r.total).toBeCloseTo(15, 2);

    // A contagem de pedidos continua sendo a dos pagos: e ela que a tela usa
    // para falar de volume que virou dinheiro.
    expect(linha.pedidos).toBe(1);
  });

  it("a mesma base muda o total em mais de tres vezes", () => {
    const pedidos = [
      pedido(),
      pedido({ status: "cancelled" }),
      pedido({ payment_status: "pending", paid_at: null }),
    ];

    const sobreBruto = apurarTaxasPlataforma(pedidos, [taxa({ base: "bruto", percentual: 5 })]);
    const sobreRecebido = apurarTaxasPlataforma(pedidos, [taxa({ base: "recebido", percentual: 5 })]);

    expect(sobreBruto.total).toBeCloseTo(15, 2);
    expect(sobreRecebido.total).toBeCloseTo(5, 2);
  });

  it("a carga efetiva mede a taxa contra o RECEBIDO, nao contra a base", () => {
    // Cobrada sobre o bruto, a taxa sai assim mesmo do dinheiro que entrou.
    // Medir contra a propria base esconderia o peso real.
    const r = apurarTaxasPlataforma(
      [pedido(), pedido({ payment_status: "pending", paid_at: null })],
      [taxa({ base: "bruto", percentual: 5 })],
    );

    expect(r.total).toBeCloseTo(10, 2); // 5% de 200
    expect(r.cargaSobreRecebido).toBeCloseTo(0.1, 4); // mas sobre 100 recebidos
  });

  it("separa a parcela percentual da parcela fixa", () => {
    // A distincao e o ponto do boleto: num pedido pequeno o fixo pesa mais que
    // qualquer percentual.
    const r = apurarTaxasPlataforma(
      [
        pedido({
          total: "40.00",
          payment_details: { method: "boleto", credit_card_company: null, installments: 1 },
        }),
      ],
      [taxa({ metodo: "boleto", percentual: 1, valorFixo: 3.49 })],
    );

    const linha = r.porMetodo[0]!;
    expect(linha.parcelaPercentual).toBeCloseTo(0.4, 2);
    expect(linha.parcelaFixa).toBeCloseTo(3.49, 2);
    expect(linha.total).toBeCloseTo(3.89, 2);
    // 3,89 sobre 40 e quase 10% -- muito acima do 1% "nominal".
    expect(linha.cargaEfetiva).toBeGreaterThan(0.09);
  });

  it("uma linha por metodo, da maior taxa para a menor", () => {
    const r = apurarTaxasPlataforma(
      [
        pedido(),
        pedido({ payment_details: { method: "pix", credit_card_company: null, installments: 1 } }),
      ],
      [taxa({ metodo: "credit_card", percentual: 5 }), taxa({ metodo: "pix", percentual: 1 })],
    );

    expect(r.porMetodo.map((l) => l.metodo)).toEqual(["credit_card", "pix"]);
    expect(r.total).toBeCloseTo(6, 2);
  });

  it("metodo sem taxa cadastrada vira lacuna declarada, nao some", () => {
    const r = apurarTaxasPlataforma(
      [pedido({ payment_details: { method: "pix", credit_card_company: null, installments: 1 } })],
      [taxa({ metodo: "credit_card" })],
    );

    expect(r.total).toBe(0);
    expect(r.metodosSemTaxa).toEqual(["pix"]);
    expect(r.recebidoSemTaxa).toBeCloseTo(100, 2);
    // A linha continua na tabela, com total zero e sem taxa vinculada.
    expect(r.porMetodo).toHaveLength(1);
    expect(r.porMetodo[0]!.taxa).toBeNull();
  });

  it("taxa desativada tambem conta como lacuna", () => {
    const r = apurarTaxasPlataforma([pedido()], [taxa({ ativa: false })]);
    expect(r.total).toBe(0);
    expect(r.metodosSemTaxa).toEqual(["credit_card"]);
  });

  it("avisa quando alguma taxa ainda nao foi conferida na fatura", () => {
    const naoConfirmada = apurarTaxasPlataforma([pedido()], [taxa({ confirmadaNaFatura: false })]);
    expect(naoConfirmada.temTaxaNaoConfirmada).toBe(true);

    const confirmada = apurarTaxasPlataforma([pedido()], [taxa({ confirmadaNaFatura: true })]);
    expect(confirmada.temTaxaNaoConfirmada).toBe(false);
  });

  it("a carga sobre o recebido e o total dividido pela base", () => {
    const r = apurarTaxasPlataforma([pedido(), pedido()], [taxa({ percentual: 5 })]);
    expect(r.base).toBeCloseTo(200, 2);
    expect(r.cargaSobreRecebido).toBeCloseTo(0.05, 4);
  });

  it("sem pedidos devolve zeros, sem NaN", () => {
    const r = apurarTaxasPlataforma([], [taxa()]);
    expect(r.total).toBe(0);
    expect(r.cargaSobreRecebido).toBe(0);
    expect(r.porMetodo).toEqual([]);
  });

  it("a soma das linhas bate com o total", () => {
    const r = apurarTaxasPlataforma(
      [
        pedido(),
        pedido({ payment_details: { method: "pix", credit_card_company: null, installments: 1 } }),
        pedido({ payment_details: { method: "boleto", credit_card_company: null, installments: 1 } }),
      ],
      [
        taxa({ metodo: "credit_card", percentual: 4.99 }),
        taxa({ metodo: "pix", percentual: 1.99 }),
        taxa({ metodo: "boleto", percentual: 0, valorFixo: 3.49 }),
      ],
    );

    const soma = r.porMetodo.reduce((t, l) => t + l.total, 0);
    expect(soma).toBeCloseTo(r.total, 6);
  });
});

describe("taxaDoPedido", () => {
  it("devolve o custo daquele pedido pelo metodo dele", () => {
    expect(taxaDoPedido(pedido({ total: "200.00" }), [taxa({ percentual: 5 })])).toBeCloseTo(10, 2);
  });

  it("metodo sem cadastro custa zero", () => {
    const p = pedido({ payment_details: { method: "pix", credit_card_company: null, installments: 1 } });
    expect(taxaDoPedido(p, [taxa({ metodo: "credit_card" })])).toBe(0);
  });
});
