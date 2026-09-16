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

/**
 * Chave usada quando o pedido nao informa meio de pagamento.
 *
 * Vale um valor proprio, e nao `other`: "nao informado" e uma lacuna de dado,
 * enquanto `other` e uma escolha de pagamento. Misturar os dois cobraria a
 * taxa de "outros" sobre um pedido do qual nao se sabe nada.
 */
export const METODO_NAO_INFORMADO = "nao_informado";

/**
 * Apelidos conhecidos -> metodo canonico.
 *
 * A API devolve `payment_details.method` como texto livre, e o painel nunca
 * viu o payload real do cliente. Variacao de caixa e de separador e resolvida
 * pela normalizacao; as equivalencias SEMANTICAS abaixo sao hipotese razoavel,
 * nao fato verificado -- ao ligar `FONTE_DADOS=live`, confira a aba de taxas:
 * metodo que chegar com nome desconhecido aparece la, com a taxa em branco.
 * E o unico lugar a mexer quando isso acontecer.
 */
const APELIDOS_DE_METODO: Record<string, MetodoPagamento> = {
  credit: "credit_card",
  creditcard: "credit_card",
  debit: "debit_card",
  debitcard: "debit_card",
  // A Nuvemshop ja chamou boleto de "ticket" em versoes antigas da API.
  ticket: "boleto",
  bank_slip: "boleto",
  bankslip: "boleto",
  transfer: "wire_transfer",
  bank_transfer: "wire_transfer",
  banktransfer: "wire_transfer",
  cash: "other",
};

const METODOS_CANONICOS = new Set<string>([
  "credit_card",
  "boleto",
  "pix",
  "debit_card",
  "wire_transfer",
  "other",
]);

/**
 * Meio de pagamento do pedido, normalizado.
 *
 * Mesmo papel que `normalizarUF` faz para o estado (secao 5.10.1): a API varia
 * a grafia e, sem um lugar unico para resolver isso, o mesmo meio viraria
 * varias linhas no relatorio e varias taxas no calculo.
 *
 * Valor desconhecido NAO vira `other`. Ele passa adiante com o proprio nome,
 * normalizado, para aparecer na tabela de taxas como lacuna declarada. Dobrar
 * para `other` cobraria a taxa de "outros" sobre um meio que ninguem cadastrou
 * -- um numero plausivel e inventado, que e o que a secao 8 proibe.
 */
export function normalizarMetodoPagamento(
  bruto: string | null | undefined,
): string {
  if (!bruto) return METODO_NAO_INFORMADO;

  const limpo = bruto.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (limpo === "") return METODO_NAO_INFORMADO;

  if (METODOS_CANONICOS.has(limpo)) return limpo;
  return APELIDOS_DE_METODO[limpo] ?? limpo;
}

/** Meio de pagamento de um pedido, ja normalizado. */
export function metodoDoPedido(pedido: Pedido): string {
  return normalizarMetodoPagamento(pedido.payment_details?.method);
}

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

/**
 * Endereco de entrega.
 *
 * `province` e o que interessa aqui: e o estado de destino, e e ele que define
 * a aliquota interna usada no DIFAL. A Nuvemshop devolve ora a sigla ("SP"),
 * ora o nome por extenso ("Sao Paulo") -- normalize com `normalizarUF` antes
 * de usar.
 */
export interface EnderecoEntrega {
  province: string | null;
  city: string | null;
  zipcode: string | null;
  country: string | null;
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
  /** `null` em pedido sem entrega cadastrada (carrinho abandonado, retirada). */
  shipping_address: EnderecoEntrega | null;
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
 * Uma variante do catalogo da loja (`GET /v1/{store_id}/products`), ja
 * achatada e so com o que o cadastro de produtos usa.
 *
 * O catalogo NAO diz de que um kit e feito: na loja real `is_kit` vem falso em
 * todos e nao ha endpoint de componentes. A composicao continua sendo cadastro.
 */
export interface ItemCatalogo {
  produtoId: number;
  varianteId: number;
  /** Nome do produto, com os valores da variante quando ha mais de uma. */
  nome: string;
  sku: string | null;
  /** `false` quando o produto esta escondido na loja. */
  publicado: boolean;
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
