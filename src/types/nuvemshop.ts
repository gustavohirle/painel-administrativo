/**
 * Tipos espelhando o formato de resposta REAL da API da Nuvemshop (v1).
 *
 * REGRA DE OURO DESTE PROJETO: as funcoes de calculo em `lib/` consomem
 * exatamente este shape. O gerador de dados ficticios produz este shape.
 * Quando trocarmos o mock pela API real, SO a camada de busca muda --
 * nenhuma regra de negocio e reescrita.
 *
 * Referencia: GET /v1/{store_id}/orders
 * Docs: https://tiendanube.github.io/api-documentation/resources/order
 *
 * ATENCAO: valores monetarios chegam da API como STRING decimal ("5190.00").
 * Nao faca aritmetica em string. Converta na borda com `paraNumero()`.
 */

/** Status geral do pedido. */
export type StatusPedido = "open" | "closed" | "cancelled";

/** Status do pagamento. E o campo que revela o dinheiro que nunca entrou. */
export type StatusPagamento =
  | "pending"
  | "authorized"
  | "paid"
  | "voided"
  | "refunded"
  | "abandoned";

/** Status do envio. */
export type StatusEnvio = "unpacked" | "unfulfilled" | "fulfilled";

/** Meio de pagamento usado pelo cliente. */
export type MetodoPagamento =
  | "credit_card"
  | "boleto"
  | "pix"
  | "debit_card"
  | "wire_transfer"
  | "other";

/** Motivo do cancelamento. */
export type MotivoCancelamento = "customer" | "fraud" | "inventory" | "other";

/** Texto multi-idioma que a Nuvemshop retorna em varios campos. */
export interface TextoMultiIdioma {
  pt?: string;
  es?: string;
  en?: string;
}

/** Cliente vinculado ao pedido. */
export interface Cliente {
  id: number;
  name: string;
  email: string;
  /** Total historico gasto pelo cliente, string decimal. */
  total_spent: string;
  /** Id do ultimo pedido do cliente. Usado para detectar recompra. */
  last_order_id: number | null;
  created_at: string;
}

/** Linha de produto dentro de um pedido. */
export interface ProdutoDoPedido {
  id: number;
  product_id: number;
  variant_id: number;
  name: string;
  /** Preco unitario cobrado, string decimal. */
  price: string;
  quantity: number;
  sku: string | null;
}

/** Detalhes do pagamento. */
export interface DetalhesPagamento {
  method: MetodoPagamento | null;
  credit_card_company: string | null;
  installments: number | null;
}

/**
 * Pedido da Nuvemshop. Contem apenas os campos que este painel usa --
 * a API devolve mais, e ignorar o excedente e proposital.
 */
export interface Pedido {
  id: number;
  number: number;
  /** Data de criacao do pedido (ISO 8601). Agrupa por mes. */
  created_at: string;
  /** Data do pagamento (ISO 8601), null quando nunca foi pago. */
  paid_at: string | null;
  status: StatusPedido;
  payment_status: StatusPagamento;
  shipping_status: StatusEnvio;
  /** Valor dos produtos, sem frete, string decimal. */
  subtotal: string;
  /** Total cobrado do cliente, ja com frete e descontos, string decimal. */
  total: string;
  /** Desconto aplicado, string decimal. */
  discount: string;
  /** Frete cobrado do cliente, string decimal. */
  shipping_cost_customer: string;
  /** Frete que a loja paga a transportadora, string decimal. */
  shipping_cost_owner: string;
  gateway_name: string;
  payment_details: DetalhesPagamento;
  cancel_reason: MotivoCancelamento | null;
  customer: Cliente;
  products: ProdutoDoPedido[];
  /**
   * NAO faz parte da API oficial da Nuvemshop.
   * Cada marca do cliente e uma loja Nuvemshop separada; ao consolidar varias
   * lojas num painel so, carimbamos a origem aqui. Na fase real isso e
   * preenchido pelo `store_id` de cada credencial configurada.
   */
  marca: string;
}

/** Carrinho abandonado (`GET /v1/{store_id}/checkouts`). */
export interface CarrinhoAbandonado {
  id: number;
  created_at: string;
  total: string;
  completed_at: string | null;
  marca: string;
}

/**
 * Converte string decimal da API em numero.
 * Use SEMPRE na borda (ao ler o pedido), nunca no meio de um calculo.
 */
export function paraNumero(valor: string | number | null | undefined): number {
  if (valor === null || valor === undefined) return 0;
  const n = typeof valor === "number" ? valor : Number.parseFloat(valor);
  return Number.isFinite(n) ? n : 0;
}
