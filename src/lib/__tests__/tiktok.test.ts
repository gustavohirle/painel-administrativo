import { describe, expect, it } from "vitest";

import { converterPedidoTikTok, traduzirSituacao, ufDoPedido } from "@/lib/tiktok";
import { classificarPedido, reconciliar } from "@/lib/metrics";
import { paraNumero } from "@/types/nuvemshop";

/** Mapa de ids previsivel: o de verdade grava em disco (`data/idsTikTok.ts`). */
function mapa() {
  const dados = { pedido: new Map<string, number>(), produto: new Map<string, number>(), variante: new Map<string, number>() };
  const numerar = (especie: keyof typeof dados, base: number) => (id: string) => {
    const existente = dados[especie].get(id);
    if (existente !== undefined) return existente;
    const novo = base + dados[especie].size + 1;
    dados[especie].set(id, novo);
    return novo;
  };
  return {
    pedido: numerar("pedido", 1_000_000_000),
    produto: numerar("produto", 1_500_000_000),
    variante: numerar("variante", 1_700_000_000),
  };
}

/** O pedido de exemplo da loja real: frete gratis bancado pelo vendedor. */
const cru = {
  id: "585744548141827839",
  status: "DELIVERED",
  create_time: 1787765587,
  paid_time: 1787765594,
  payment_method_name: "CCI",
  payment: {
    currency: "BRL",
    original_shipping_fee: "73.34",
    original_total_product_price: "179",
    platform_discount: "10",
    seller_discount: "20",
    shipping_fee: "0",
    shipping_fee_seller_discount: "73.34",
    sub_total: "149",
    total_amount: "149",
  },
  line_items: [
    {
      id: "585744548141893375",
      product_id: "1736900974475249086",
      sku_id: "1736901003602265534",
      product_name: "Combo Encanto Body Splash",
      sku_name: "Padrão",
      sale_price: "149",
      seller_sku: "",
    },
  ],
  recipient_address: {
    district_info: [
      { address_level_name: "Country", address_name: "Brasil" },
      { address_level_name: "state", address_name: "BA" },
      { address_level_name: "municipality", address_name: "Santo Antônio de Jesus" },
    ],
  },
};

describe("converterPedidoTikTok", () => {
  const pedido = converterPedidoTikTok(cru, "Tha Beauty TikTok", mapa())!;

  it("vira um Pedido do painel, com a marca do canal", () => {
    expect(pedido).toMatchObject({
      marca: "Tha Beauty TikTok",
      status: "closed",
      payment_status: "paid",
      total: "149.00",
      subtotal: "149.00",
      discount: "20.00",
    });
    expect(classificarPedido(pedido)).toBe("recebido");
  });

  it("guarda o id verdadeiro do TikTok, que não cabe num número", () => {
    // 585744548141827839 passa do inteiro seguro: virar Number perderia digito.
    expect(Number.isSafeInteger(Number(cru.id))).toBe(false);
    expect(Number.isSafeInteger(pedido.id)).toBe(true);
    expect(pedido.gateway_name).toContain(cru.id);
  });

  it("frete grátis vira custo da loja, e não frete cobrado do cliente", () => {
    expect(pedido.shipping_cost_customer).toBe("0.00");
    expect(pedido.shipping_cost_owner).toBe("73.34");
    const r = reconciliar([pedido]);
    expect(r.frete).toBe(0);
    expect(r.freteAbsorvido).toBeCloseTo(73.34, 2);
    expect(r.receitaReal).toBeCloseTo(149, 2);
  });

  it("data em horário de Brasília e estado de destino pela sigla", () => {
    expect(pedido.created_at).toMatch(/-03:00$/);
    expect(pedido.shipping_address?.province).toBe("BA");
  });

  it("não guarda dado pessoal do cliente", () => {
    expect(pedido.customer.name).toBe("");
    expect(pedido.customer.email).toBe("");
    expect(pedido.customer.id).toBeLessThan(0);
  });

  it("duas unidades do mesmo SKU viram uma linha com quantidade 2", () => {
    const doisItens = {
      ...cru,
      line_items: [cru.line_items[0], { ...cru.line_items[0], id: "outro" }],
    };
    const p = converterPedidoTikTok(doisItens, "Tha Beauty TikTok", mapa())!;
    expect(p.products).toHaveLength(1);
    expect(p.products[0]!.quantity).toBe(2);
    expect(paraNumero(p.products[0]!.price)).toBe(149);
  });

  it("pedido sem id ou sem data não entra", () => {
    expect(converterPedidoTikTok({ ...cru, id: "" }, "M", mapa())).toBeNull();
    expect(converterPedidoTikTok({ ...cru, create_time: 0 }, "M", mapa())).toBeNull();
    expect(converterPedidoTikTok(null, "M", mapa())).toBeNull();
  });
});

describe("traduzirSituacao", () => {
  it("não pago, cancelado e pago", () => {
    expect(traduzirSituacao("UNPAID")).toMatchObject({ status: "open", pagamento: "pending" });
    expect(traduzirSituacao("CANCELLED")).toMatchObject({ status: "cancelled", pagamento: "voided" });
    expect(traduzirSituacao("COMPLETED")).toMatchObject({ status: "closed", pagamento: "paid" });
  });

  it("situação nova conta como recebido, e o painel a lista como desconhecida", () => {
    expect(traduzirSituacao("SITUACAO_QUE_NAO_EXISTE")).toMatchObject({ pagamento: "paid" });
  });
});

describe("ufDoPedido", () => {
  it("lê a sigla do nível 'state' e ignora o resto", () => {
    expect(ufDoPedido(cru.recipient_address)).toBe("BA");
    expect(ufDoPedido({ district_info: [{ address_level_name: "Country", address_name: "Brasil" }] })).toBeNull();
    expect(ufDoPedido(null)).toBeNull();
  });

  it("aceita o estado por extenso, como o normalizador da Nuvemshop", () => {
    expect(
      ufDoPedido({ district_info: [{ address_level_name: "state", address_name: "São Paulo" }] }),
    ).toBe("SP");
  });
});
