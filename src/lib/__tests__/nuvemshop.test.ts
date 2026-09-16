import { describe, expect, it } from "vitest";

import { chaveMes, reconciliar } from "@/lib/metrics";
import {
  converterCarrinho,
  converterPedido,
  converterProduto,
  esperaPeloLimite,
  limitesDoMes,
  mesclarPedidos,
  mesesAte,
  paraHorarioDeBrasilia,
  proximaPaginaDoLink,
  situacoesDesconhecidas,
} from "@/lib/nuvemshop";

/** Pedido no formato do exemplo da documentacao, com os tipos misturados que ela mostra. */
function pedidoCru(extra: Record<string, unknown> = {}) {
  return {
    id: 450361,
    number: 1001,
    created_at: "2026-09-01T02:30:00+0000",
    updated_at: "2026-09-01T03:00:00+0000",
    paid_at: "2026-09-01T02:35:00+0000",
    status: "open",
    payment_status: "paid",
    shipping_status: "unpacked",
    subtotal: "100.00",
    total: "119.00",
    discount: "0.00",
    shipping_cost_customer: 19,
    shipping_cost_owner: "19.00",
    gateway: "mercadopago",
    payment_details: { method: "credit_card", credit_card_company: "visa", installments: "3" },
    customer: {
      id: 9001,
      name: "Maria da Silva",
      email: "maria@exemplo.com",
      phone: "+5511999999999",
      identification: "12345678900",
    },
    shipping_address: {
      province: "São Paulo",
      city: "Campinas",
      zipcode: "13000-000",
      address: "Rua das Flores",
      number: "10",
      country: "BR",
    },
    products: [
      { id: 1, product_id: 55, variant_id: 77, name: "Sérum", price: "50.00", quantity: "2", sku: "SER-1" },
    ],
    ...extra,
  };
}

describe("converterProduto", () => {
  it("vira uma entrada por variante, com o nome em português e o SKU", () => {
    // Formato da loja real (16/09/2026): nome por idioma, variantes com values vazios.
    const itens = converterProduto(
      {
        id: 259902774,
        name: { pt: "Kit maresia: Body Splash + Loção Hidratante" },
        published: true,
        is_kit: false,
        variants: [{ id: 1152820434, sku: "MAR001", values: [], price: "119.90", cost: null }],
      },
      "Loja A",
    );
    expect(itens).toEqual([
      {
        produtoId: 259902774,
        varianteId: 1152820434,
        nome: "Kit maresia: Body Splash + Loção Hidratante",
        sku: "MAR001",
        publicado: true,
        marca: "Loja A",
      },
    ]);
  });

  it("com mais de uma variante, o nome leva os valores dela", () => {
    const itens = converterProduto(
      {
        id: 1,
        name: { pt: "Creme" },
        published: false,
        variants: [
          { id: 11, sku: "C30", values: [{ pt: "30ml" }] },
          { id: 12, sku: "", values: [{ pt: "200ml" }] },
          { sku: "sem-id" },
        ],
      },
      "Loja A",
    );
    expect(itens.map((i) => [i.varianteId, i.nome, i.sku, i.publicado])).toEqual([
      [11, "Creme (30ml)", "C30", false],
      [12, "Creme (200ml)", null, false],
    ]);
  });

  it("produto sem id não vira nada", () => {
    expect(converterProduto({ name: "X", variants: [{ id: 1 }] }, "Loja A")).toEqual([]);
    expect(converterProduto(null, "Loja A")).toEqual([]);
  });
});

describe("converterPedido", () => {
  it("aceita dinheiro como número e quantidade como texto, que é como a documentação mostra", () => {
    const { pedido, ausentes } = converterPedido(pedidoCru(), "Loja A")!;
    expect(pedido.shipping_cost_customer).toBe("19.00");
    expect(pedido.total).toBe("119.00");
    expect(pedido.products[0]!.quantity).toBe(2);
    expect(pedido.payment_details.installments).toBe(3);
    expect(pedido.marca).toBe("Loja A");
    expect(ausentes).toEqual([]);
  });

  it("não guarda dado pessoal do cliente", () => {
    const { pedido } = converterPedido(pedidoCru(), "Loja A")!;
    const texto = JSON.stringify(pedido);
    for (const pessoal of ["Maria", "maria@", "99999", "12345678900", "Campinas", "13000", "Flores"]) {
      expect(texto).not.toContain(pessoal);
    }
    expect(pedido.customer.id).toBe(9001);
    expect(pedido.shipping_address?.province).toBe("São Paulo");
  });

  it("pedido das 23h30 de 31/08 em Brasília fica em agosto, mesmo sendo setembro em UTC", () => {
    const { pedido } = converterPedido(pedidoCru(), "Loja A")!;
    expect(pedido.created_at).toBe("2026-08-31T23:30:00.000-03:00");
    expect(chaveMes(pedido.created_at)).toBe("2026-08");
    // O instante continua o mesmo.
    expect(new Date(pedido.created_at).getTime()).toBe(Date.parse("2026-09-01T02:30:00Z"));
  });

  it("cliente ausente não vira o cliente zero de todos os anônimos", () => {
    const a = converterPedido(pedidoCru({ id: 1, customer: null }), "Loja A")!;
    const b = converterPedido(pedidoCru({ id: 2, customer: null }), "Loja A")!;
    expect(a.pedido.customer.id).not.toBe(b.pedido.customer.id);
    expect(a.ausentes).toContain("customer.id");
  });

  it("campo que falta entra com zero e fica registrado", () => {
    const { pedido, ausentes } = converterPedido(
      pedidoCru({ shipping_cost_customer: undefined, shipping_address: null, payment_details: null }),
      "Loja A",
    )!;
    expect(pedido.shipping_cost_customer).toBe("0.00");
    expect(pedido.shipping_address).toBeNull();
    expect(pedido.payment_details.method).toBeNull();
    expect(ausentes).toEqual(
      expect.arrayContaining(["shipping_cost_customer", "shipping_address.province", "payment_details.method"]),
    );
  });

  it("sem id ou sem data de criação o pedido é descartado", () => {
    expect(converterPedido(pedidoCru({ id: null }), "Loja A")).toBeNull();
    expect(converterPedido(pedidoCru({ created_at: "ontem" }), "Loja A")).toBeNull();
    expect(converterPedido("lixo", "Loja A")).toBeNull();
  });

  it("nome de produto por idioma vira texto", () => {
    const { pedido } = converterPedido(
      pedidoCru({ products: [{ id: 1, product_id: 1, variant_id: 1, name: { pt: "Kit", es: "Kit ES" }, price: 10, quantity: 1 }] }),
      "Loja A",
    )!;
    expect(pedido.products[0]!.name).toBe("Kit");
    expect(pedido.products[0]!.price).toBe("10.00");
  });

  it("o pedido convertido passa pelas contas do painel: R$ 119 com R$ 19 de frete dá R$ 100 de receita real", () => {
    const { pedido } = converterPedido(pedidoCru(), "Loja A")!;
    const r = reconciliar([pedido]);
    expect(r.bruto).toBe(119);
    expect(r.recebido).toBe(119);
    expect(r.receitaReal).toBe(100);
    expect(r.brutoSemFrete).toBe(100);
  });

  it("status que o painel não conhece aparece na contagem", () => {
    const conhecido = converterPedido(pedidoCru(), "A")!.pedido;
    const estranho = converterPedido(pedidoCru({ id: 2, payment_status: "Partially_Refunded" }), "A")!.pedido;
    expect(estranho.payment_status).toBe("partially_refunded");
    expect(situacoesDesconhecidas([conhecido, estranho])).toEqual({
      "payment_status=partially_refunded": 1,
    });
  });
});

describe("converterCarrinho", () => {
  it("converte data e total", () => {
    const c = converterCarrinho(
      { id: 5, created_at: "2026-09-10T12:00:00+0000", total: 80, completed_at: null, contact_email: "x@y.z" },
      "Loja A",
    )!;
    expect(c).toEqual({
      id: 5,
      created_at: "2026-09-10T09:00:00.000-03:00",
      total: "80.00",
      completed_at: null,
      marca: "Loja A",
    });
  });
});

describe("datas", () => {
  it("horário de Brasília recusa texto que não é data", () => {
    expect(paraHorarioDeBrasilia(null)).toBeNull();
    expect(paraHorarioDeBrasilia("")).toBeNull();
    expect(paraHorarioDeBrasilia("2026-13-45")).toBeNull();
  });

  it("limites do mês cobrem o mês inteiro de Brasília", () => {
    expect(limitesDoMes("2026-09")).toEqual({
      inicio: "2026-09-01T03:00:00.000Z",
      fim: "2026-10-01T02:59:59.000Z",
    });
    expect(limitesDoMes("2026-12").fim).toBe("2027-01-01T02:59:59.000Z");
  });

  it("meses até hoje, contando o mês de Brasília", () => {
    // 1h de 1/out em UTC ainda é 30/set no Brasil.
    expect(mesesAte(new Date("2026-10-01T01:00:00Z"), 3)).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(mesesAte(new Date("2026-02-15T12:00:00Z"), 13)[0]).toBe("2025-02");
  });
});

describe("mesclarPedidos", () => {
  const base = (id: number, marca: string, criado: string, total = "10.00") =>
    converterPedido(pedidoCru({ id, created_at: criado, total }), marca)!.pedido;

  it("a versão nova substitui a antiga, e o mesmo id em lojas diferentes são pedidos diferentes", () => {
    const antigo = base(1, "A", "2026-09-05T12:00:00+0000", "10.00");
    const novo = base(1, "A", "2026-09-05T12:00:00+0000", "20.00");
    const outraLoja = base(1, "B", "2026-09-05T12:00:00+0000", "30.00");
    const resultado = mesclarPedidos([antigo, outraLoja], [novo]);
    expect(resultado).toHaveLength(2);
    expect(resultado.find((p) => p.marca === "A")!.total).toBe("20.00");
  });

  it("tira o que foi criado antes da janela e ordena por criação", () => {
    const velho = base(1, "A", "2025-01-05T12:00:00+0000");
    const b = base(3, "A", "2026-09-07T12:00:00+0000");
    const a = base(2, "A", "2026-09-06T12:00:00+0000");
    const resultado = mesclarPedidos([velho, b], [a], "2026-01-01T03:00:00.000Z");
    expect(resultado.map((p) => p.id)).toEqual([2, 3]);
  });
});

describe("paginação e limite", () => {
  it("segue o rel=next do cabeçalho Link", () => {
    const link =
      '<https://api.nuvemshop.com.br/2025-03/1/orders?page=3&per_page=200>; rel="next", <https://api.nuvemshop.com.br/2025-03/1/orders?page=9>; rel="last"';
    expect(proximaPaginaDoLink(link)).toBe("https://api.nuvemshop.com.br/2025-03/1/orders?page=3&per_page=200");
    expect(proximaPaginaDoLink('<https://x/orders?page=9>; rel="last"')).toBeNull();
    expect(proximaPaginaDoLink(null)).toBeNull();
  });

  it("o reset do limite vem em milissegundos", () => {
    expect(esperaPeloLimite(429, "0", "1500")).toBe(1500);
    // Nunca horas: a primeira versão lia o valor como segundos.
    expect(esperaPeloLimite(429, "0", "20000")).toBe(10_000);
    expect(esperaPeloLimite(429, null, null)).toBe(2_000);
    expect(esperaPeloLimite(200, "30", "500")).toBe(0);
    expect(esperaPeloLimite(200, "2", "19000")).toBe(500);
  });
});
