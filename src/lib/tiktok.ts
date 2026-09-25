/**
 * Conversao do pedido do TikTok Shop para o `Pedido` do painel (secao 15).
 *
 * Mesma decisao da secao 3: as contas recebem o formato da Nuvemshop, entao
 * quem muda e a borda. Aqui o pedido do TikTok vira exatamente o mesmo objeto
 * que vem da Nuvemshop, e nenhuma funcao de calculo sabe da diferenca.
 *
 * Tres coisas nao tem equivalente direto e estao resolvidas aqui:
 *
 * 1. **Os ids do TikTok nao cabem num numero.** Pedido, produto e SKU vem
 *    como texto de 18 ou 19 digitos -- acima do inteiro seguro do JavaScript,
 *    e muito acima do `Int` do Postgres, onde o cadastro de produto guarda o
 *    `produtoId`. Por isso quem chama passa um `MapaDeIds`, que troca cada id
 *    de texto por um numero proprio e ESTAVEL (`data/idsTikTok.ts`). O id
 *    verdadeiro continua no pedido, no campo `sku` do item e em `gateway_name`.
 * 2. **Frete gratis e custo.** No TikTok o vendedor costuma anunciar frete
 *    gratis: o cliente paga R$ 0 e a loja banca. Isso vai para
 *    `shipping_cost_owner` maior que `shipping_cost_customer`, e a
 *    reconciliacao o trata como `freteAbsorvido` -- custo, e nao repasse
 *    (5.1.1 vale para o frete que o cliente paga).
 * 3. **O cliente e anonimo.** A API devolve dado pessoal, e o painel nao
 *    guarda nenhum: fica so um id negativo proprio, como na Nuvemshop.
 *
 * Funcoes puras.
 */

import { paraHorarioDeBrasilia } from "@/lib/nuvemshop";
import { normalizarUF } from "@/types/estados";
import { normalizarMetodoPagamento, PREFIXO_GATEWAY_TIKTOK } from "@/types/nuvemshop";
import type {
  MetodoPagamento,
  Pedido,
  ProdutoDoPedido,
  StatusPagamento,
  StatusPedido,
} from "@/types/nuvemshop";

/** Troca o id de texto do TikTok por um numero estavel. */
export interface MapaDeIds {
  pedido(idTikTok: string): number;
  produto(idTikTok: string): number;
  variante(idTikTok: string): number;
}

/**
 * Situacoes do pedido no TikTok Shop.
 *
 * `UNPAID` e o que o painel chama de "nao pago" e `CANCELLED` some para
 * "cancelado". O resto ja foi pago -- o TikTok so libera a separacao depois do
 * pagamento --, entao entra como recebido.
 */
interface Traducao {
  status: StatusPedido;
  pagamento: StatusPagamento;
  envio: Pedido["shipping_status"];
}

export function traduzirSituacao(bruto: string): Traducao {
  switch (bruto) {
    case "UNPAID":
      return { status: "open", pagamento: "pending", envio: "unpacked" };
    case "CANCELLED":
      return { status: "cancelled", pagamento: "voided", envio: "unpacked" };
    case "AWAITING_SHIPMENT":
      return { status: "open", pagamento: "paid", envio: "unpacked" };
    case "AWAITING_COLLECTION":
    case "PARTIALLY_SHIPPING":
      return { status: "open", pagamento: "paid", envio: "unfulfilled" };
    case "IN_TRANSIT":
      return { status: "open", pagamento: "paid", envio: "unfulfilled" };
    case "DELIVERED":
    case "COMPLETED":
      return { status: "closed", pagamento: "paid", envio: "fulfilled" };
    default:
      // Situacao nova: conta como recebido, e `situacoesDesconhecidas` acusa.
      return { status: "open", pagamento: "paid", envio: "unpacked" };
  }
}

const texto = (v: unknown): string => (typeof v === "string" ? v : "");
const numero = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(texto(v));
  return Number.isFinite(n) ? n : 0;
};
const dinheiro = (v: unknown): string => numero(v).toFixed(2);

/** Epoch em segundos -> ISO no horario de Brasilia, como a borda da Nuvemshop. */
export function instanteDoTikTok(epoch: unknown): string | null {
  const s = numero(epoch);
  if (s <= 0) return null;
  return paraHorarioDeBrasilia(new Date(s * 1000).toISOString());
}

/** Estado de destino: o TikTok manda o endereco em niveis, e a sigla esta no nivel "state". */
export function ufDoPedido(endereco: unknown): string | null {
  if (typeof endereco !== "object" || endereco === null) return null;
  const niveis = (endereco as { district_info?: unknown }).district_info;
  if (!Array.isArray(niveis)) return null;
  for (const nivel of niveis) {
    if (typeof nivel !== "object" || nivel === null) continue;
    const n = nivel as { address_level_name?: unknown; address_name?: unknown };
    if (texto(n.address_level_name).toLowerCase() === "state") {
      return normalizarUF(texto(n.address_name));
    }
  }
  return null;
}

/**
 * Pedido cru do TikTok -> `Pedido`. `null` quando falta id ou data.
 *
 * O `total` e o que o cliente pagou (`total_amount`), como na Nuvemshop: ja
 * com frete e descontos. O desconto do VENDEDOR entra em `discount`; o da
 * plataforma nao, porque quem o paga e o TikTok -- para a loja ele nunca foi
 * receita.
 */
export function converterPedidoTikTok(
  bruto: unknown,
  marca: string,
  ids: MapaDeIds,
): Pedido | null {
  if (typeof bruto !== "object" || bruto === null) return null;
  const p = bruto as Record<string, unknown>;

  const idTikTok = texto(p.id);
  const criadoEm = instanteDoTikTok(p.create_time);
  if (idTikTok === "" || criadoEm === null) return null;

  const pagamento = (typeof p.payment === "object" && p.payment !== null
    ? (p.payment as Record<string, unknown>)
    : {}) as Record<string, unknown>;

  const situacao = traduzirSituacao(texto(p.status));
  const id = ids.pedido(idTikTok);

  const itens = Array.isArray(p.line_items) ? p.line_items : [];
  const porVariante = new Map<string, ProdutoDoPedido>();
  for (const cru of itens) {
    if (typeof cru !== "object" || cru === null) continue;
    const item = cru as Record<string, unknown>;
    const produtoId = texto(item.product_id);
    const skuId = texto(item.sku_id) || produtoId;
    if (produtoId === "") continue;

    // Um item por unidade no TikTok: duas unidades sao duas linhas iguais.
    const existente = porVariante.get(skuId);
    if (existente) {
      existente.quantity += 1;
      continue;
    }
    const nomeSku = texto(item.sku_name);
    porVariante.set(skuId, {
      id: ids.variante(skuId),
      product_id: ids.produto(produtoId),
      variant_id: ids.variante(skuId),
      // "Padrão" e o nome que o TikTok da a variante unica: nao acrescenta nada.
      name:
        nomeSku === "" || nomeSku.toLowerCase() === "padrão"
          ? texto(item.product_name)
          : `${texto(item.product_name)} ${nomeSku}`,
      price: dinheiro(item.sale_price),
      quantity: 1,
      // O SKU verdadeiro do TikTok, que e texto e nao cabe nos ids numericos.
      sku: texto(item.seller_sku) || skuId,
    });
  }

  const frete = numero(pagamento.shipping_fee);
  /*
   * O que a loja paga de frete: o valor cheio menos o que a plataforma banca.
   * Quando o vendedor anuncia frete gratis, `shipping_fee_seller_discount`
   * cobre o que o cliente deixou de pagar -- e e esse pedaco que vira custo.
   */
  const freteDaLoja = Math.max(0, numero(pagamento.shipping_fee_seller_discount));

  return {
    id,
    number: id,
    created_at: criadoEm,
    paid_at: instanteDoTikTok(p.paid_time),
    status: situacao.status,
    payment_status: situacao.pagamento,
    shipping_status: situacao.envio,
    subtotal: dinheiro(pagamento.sub_total),
    total: dinheiro(pagamento.total_amount),
    discount: dinheiro(pagamento.seller_discount),
    shipping_cost_customer: dinheiro(frete),
    shipping_cost_owner: dinheiro(frete + freteDaLoja),
    // O nome do meio de pagamento vem do TikTok ("CCI", "Pix"...): ele aparece
    // na aba de taxas para alguem cadastrar quanto a plataforma retem.
    gateway_name: `${PREFIXO_GATEWAY_TIKTOK}${idTikTok}`,
    payment_details: {
      /*
       * Passa pelo mesmo normalizador da Nuvemshop (5.13.1): nome conhecido
       * vira o meio do painel, e o que ele nao conhece ("CCI", por exemplo)
       * segue com o proprio nome e aparece na aba de taxas como lacuna, para
       * alguem cadastrar quanto o TikTok retem. O `as` existe porque o tipo
       * lista os meios conhecidos e a borda deixa o desconhecido passar.
       */
      method: normalizarMetodoPagamento(texto(p.payment_method_name)) as MetodoPagamento,
      credit_card_company: null,
      installments: 1,
    },
    cancel_reason: situacao.status === "cancelled" ? "other" : null,
    // Sem dado pessoal: so um id proprio, negativo, como no pedido sem cliente.
    customer: {
      id: -id,
      name: "",
      email: "",
      total_spent: "0.00",
      last_order_id: id,
      created_at: criadoEm,
    },
    shipping_address: (() => {
      const uf = ufDoPedido(p.recipient_address);
      return uf ? { province: uf, city: "", zipcode: "", country: "BR" } : null;
    })(),
    products: [...porVariante.values()],
    marca,
  };
}
