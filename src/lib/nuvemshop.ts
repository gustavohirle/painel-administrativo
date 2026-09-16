/**
 * Borda da API da Nuvemshop: o que chega cru vira `Pedido`.
 *
 * Funcoes PURAS, sem fetch -- o cliente HTTP mora em `data/apiSource.ts` e o
 * cache em `data/cachePedidos.ts`. Estao aqui para terem teste: nenhuma delas
 * foi exercitada contra o payload real ainda, e cada decisao abaixo e sobre um
 * jeito de o dado real diferir do ficticio.
 *
 * Referencia: https://tiendanube.github.io/api-documentation/resources/order
 */

import type {
  CarrinhoAbandonado,
  Pedido,
  ProdutoDoPedido,
  StatusEnvio,
  StatusPagamento,
  StatusPedido,
} from "@/types/nuvemshop";

// ---------------------------------------------------------------------------
// Datas
// ---------------------------------------------------------------------------

/** Brasilia nao tem horario de verao desde 2019: o deslocamento e fixo. */
const TRES_HORAS = 3 * 60 * 60 * 1000;

/**
 * "2022-11-15T01:36:59+0000" -> "2022-11-14T22:36:59.000-03:00".
 *
 * A API devolve UTC. O painel agrupa por mes cortando o texto da data
 * (`chaveMes`), e em UTC um pedido das 22h do dia 30 cairia no mes seguinte.
 * Reescrever no horario de Brasilia na borda resolve isso para toda conta de
 * uma vez, e o texto continua sendo ISO 8601 valido para `new Date`.
 *
 * Data ilegivel vira `null`: um pedido sem data nao tem mes, e inventar uma
 * data o colocaria no mes errado.
 */
export function paraHorarioDeBrasilia(valor: unknown): string | null {
  if (typeof valor !== "string" || valor.trim() === "") return null;
  const instante = new Date(valor).getTime();
  if (Number.isNaN(instante)) return null;
  return new Date(instante - TRES_HORAS).toISOString().replace("Z", "-03:00");
}

/** "2026-09" -> intervalo do mes no horario de Brasilia, no formato que a API aceita. */
export function limitesDoMes(chaveMes: string): { inicio: string; fim: string } {
  const [ano, mes] = chaveMes.split("-").map(Number);
  const inicio = new Date(Date.UTC(ano!, mes! - 1, 1) + TRES_HORAS);
  const fim = new Date(Date.UTC(ano!, mes!, 1) + TRES_HORAS - 1000);
  return { inicio: inicio.toISOString(), fim: fim.toISOString() };
}

/**
 * Os `quantos` meses que terminam no mes de `hoje`, do mais antigo ao atual.
 *
 * A busca inicial anda de mes em mes, e nao num intervalo so, para cada
 * consulta paginar pouco: uma pagina errada no meio de 13 meses custaria
 * recomecar tudo.
 */
export function mesesAte(hoje: Date, quantos: number): string[] {
  const local = new Date(hoje.getTime() - TRES_HORAS);
  const meses: string[] = [];
  for (let i = quantos - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - i, 1));
    meses.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return meses;
}

// ---------------------------------------------------------------------------
// Valores
// ---------------------------------------------------------------------------

/**
 * Dinheiro em texto decimal, que e o que o resto do painel espera.
 *
 * A documentacao mostra `total` como texto e `shipping_cost_customer` como
 * numero no mesmo exemplo. Aceita os dois e devolve sempre texto.
 * Ausente vira "0.00": o campo existe no tipo e a conta precisa de um valor.
 * Quem precisa saber que faltou olha `CamposAusentes`.
 */
function dinheiro(valor: unknown): string {
  if (typeof valor === "number" && Number.isFinite(valor)) return valor.toFixed(2);
  if (typeof valor === "string" && valor.trim() !== "" && Number.isFinite(Number(valor))) {
    return valor.trim();
  }
  return "0.00";
}

/** Inteiro vindo como numero ou texto ("1"). `Number(null)` e zero -- por isso o typeof. */
function inteiro(valor: unknown): number | null {
  if (typeof valor === "number" && Number.isFinite(valor)) return Math.trunc(valor);
  if (typeof valor === "string" && valor.trim() !== "" && Number.isFinite(Number(valor))) {
    return Math.trunc(Number(valor));
  }
  return null;
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() !== "" ? valor : null;
}

/** Nome de produto: texto, ou objeto por idioma ({ pt, es }) em alguns recursos. */
function nomeDoProduto(valor: unknown): string {
  if (typeof valor === "string") return valor;
  if (valor && typeof valor === "object") {
    const nomes = valor as Record<string, unknown>;
    return texto(nomes.pt) ?? texto(nomes.es) ?? texto(nomes.en) ?? "Produto sem nome";
  }
  return "Produto sem nome";
}

const objeto = (valor: unknown): Record<string, unknown> =>
  valor && typeof valor === "object" ? (valor as Record<string, unknown>) : {};

// ---------------------------------------------------------------------------
// Pedido
// ---------------------------------------------------------------------------

/**
 * Campos que o painel usa e que vieram ausentes num pedido.
 *
 * Existe porque a conversao nunca derruba a leitura: um pedido sem frete
 * informado entra com frete zero. Isso e certo para uma loja com frete gratis
 * e errado para uma API que mudou o nome do campo -- e so a contagem distingue
 * os dois casos. O teste de conexao mostra essa contagem.
 */
export type CampoVigiado =
  | "shipping_cost_customer"
  | "shipping_address.province"
  | "payment_details.method"
  | "customer.id"
  | "products";

export interface PedidoConvertido {
  pedido: Pedido;
  /** Momento da ultima alteracao, para a sincronizacao incremental. */
  atualizadoEm: string | null;
  ausentes: CampoVigiado[];
}

/**
 * Converte um pedido cru da API.
 *
 * Devolve `null` para o que nao da para usar: sem id ou sem data de criacao.
 *
 * Tres decisoes:
 *
 * 1. **Sem dado pessoal.** Nenhuma conta do painel usa nome, e-mail, telefone,
 *    documento nem endereco do cliente -- a recompra so precisa do id, e o
 *    DIFAL so do estado. Como o resultado vai para um cache em disco, o que
 *    nao e usado nao e guardado.
 * 2. **Cliente ausente nao vira cliente zero.** Pedido sem cliente recebe um
 *    id negativo proprio; com id zero, todos os anonimos virariam UM cliente
 *    recorrente e inflariam a taxa de recompra.
 * 3. **O texto do status passa como veio**, em minusculas. Status que o painel
 *    nao conhece continua aparecendo (ver `situacoesDesconhecidas`) em vez de
 *    ser dobrado para um conhecido.
 */
export function converterPedido(bruto: unknown, marca: string): PedidoConvertido | null {
  const p = objeto(bruto);
  const id = inteiro(p.id);
  const criadoEm = paraHorarioDeBrasilia(p.created_at);
  if (id === null || criadoEm === null) return null;

  const ausentes: CampoVigiado[] = [];

  if (p.shipping_cost_customer === undefined || p.shipping_cost_customer === null) {
    ausentes.push("shipping_cost_customer");
  }

  const endereco = p.shipping_address ? objeto(p.shipping_address) : null;
  const uf = texto(endereco?.province) ?? texto(p.billing_province);
  if (!uf) ausentes.push("shipping_address.province");

  const pagamento = objeto(p.payment_details);
  const metodo = texto(pagamento.method);
  if (!metodo) ausentes.push("payment_details.method");

  const cliente = objeto(p.customer);
  const clienteId = inteiro(cliente.id);
  if (clienteId === null) ausentes.push("customer.id");

  const itens = Array.isArray(p.products) ? p.products : [];
  if (itens.length === 0) ausentes.push("products");

  const produtos: ProdutoDoPedido[] = itens.map((bruto, indice) => {
    const item = objeto(bruto);
    return {
      id: inteiro(item.id) ?? indice,
      product_id: inteiro(item.product_id) ?? 0,
      variant_id: inteiro(item.variant_id) ?? 0,
      name: nomeDoProduto(item.name),
      price: dinheiro(item.price),
      quantity: inteiro(item.quantity) ?? 0,
      sku: texto(item.sku),
    };
  });

  const pedido: Pedido = {
    id,
    number: inteiro(p.number) ?? id,
    created_at: criadoEm,
    paid_at: paraHorarioDeBrasilia(p.paid_at),
    status: (texto(p.status)?.toLowerCase() ?? "open") as StatusPedido,
    payment_status: (texto(p.payment_status)?.toLowerCase() ?? "pending") as StatusPagamento,
    shipping_status: (texto(p.shipping_status)?.toLowerCase() ?? "unpacked") as StatusEnvio,
    subtotal: dinheiro(p.subtotal),
    total: dinheiro(p.total),
    discount: dinheiro(p.discount),
    shipping_cost_customer: dinheiro(p.shipping_cost_customer),
    shipping_cost_owner: dinheiro(p.shipping_cost_owner),
    gateway_name: texto(p.gateway_name) ?? texto(p.gateway) ?? "",
    payment_details: {
      // Texto cru de proposito: `normalizarMetodoPagamento` e quem decide.
      method: metodo as Pedido["payment_details"]["method"],
      credit_card_company: texto(pagamento.credit_card_company),
      installments: inteiro(pagamento.installments),
    },
    cancel_reason: (texto(p.cancel_reason) ?? null) as Pedido["cancel_reason"],
    customer: {
      id: clienteId ?? -id,
      name: "",
      email: "",
      total_spent: "0.00",
      last_order_id: null,
      created_at: criadoEm,
    },
    shipping_address: uf
      ? { province: uf, city: null, zipcode: null, country: texto(endereco?.country) }
      : null,
    products: produtos,
    marca,
  };

  return {
    pedido,
    atualizadoEm: paraHorarioDeBrasilia(p.updated_at),
    ausentes,
  };
}

/** Carrinho abandonado cru (`GET /checkouts`). Mesmas regras de data e dinheiro. */
export function converterCarrinho(bruto: unknown, marca: string): CarrinhoAbandonado | null {
  const c = objeto(bruto);
  const id = inteiro(c.id);
  const criadoEm = paraHorarioDeBrasilia(c.created_at);
  if (id === null || criadoEm === null) return null;
  return {
    id,
    created_at: criadoEm,
    total: dinheiro(c.total),
    completed_at: paraHorarioDeBrasilia(c.completed_at),
    marca,
  };
}

// ---------------------------------------------------------------------------
// Sincronizacao
// ---------------------------------------------------------------------------

/** Chave unica de um pedido: o id so e unico dentro da loja. */
export const chaveDoPedido = (p: Pick<Pedido, "marca" | "id">): string => `${p.marca}#${p.id}`;

/**
 * Junta pedidos novos aos que ja estavam no cache.
 *
 * O pedido que chegou por ultimo substitui o anterior -- a busca incremental
 * traz justamente os que mudaram (boleto pago, pedido cancelado). Pedidos
 * criados antes de `desde` saem: o cache guarda uma janela, nao o historico
 * inteiro. O resultado sai em ordem de criacao, que e a ordem da demonstracao.
 */
export function mesclarPedidos(anteriores: Pedido[], novos: Pedido[], desde?: string): Pedido[] {
  const porChave = new Map<string, Pedido>();
  for (const pedido of anteriores) porChave.set(chaveDoPedido(pedido), pedido);
  for (const pedido of novos) porChave.set(chaveDoPedido(pedido), pedido);

  const limite = desde ? new Date(desde).getTime() : null;
  return [...porChave.values()]
    .filter((p) => limite === null || new Date(p.created_at).getTime() >= limite)
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id);
}

const SITUACOES_CONHECIDAS = {
  status: new Set(["open", "closed", "cancelled"]),
  payment_status: new Set(["pending", "authorized", "paid", "voided", "refunded", "abandoned"]),
};

/**
 * Valores de status que o painel nao conhece, com a contagem.
 *
 * `classificarPedido` trata todo pagamento fora das listas como recebido. Com
 * um `partially_refunded`, por exemplo, isso esta errado -- e sem esta lista o
 * erro nao apareceria em lugar nenhum.
 */
export function situacoesDesconhecidas(pedidos: Pedido[]): Record<string, number> {
  const contagem: Record<string, number> = {};
  for (const p of pedidos) {
    if (!SITUACOES_CONHECIDAS.status.has(p.status)) {
      const chave = `status=${p.status}`;
      contagem[chave] = (contagem[chave] ?? 0) + 1;
    }
    if (!SITUACOES_CONHECIDAS.payment_status.has(p.payment_status)) {
      const chave = `payment_status=${p.payment_status}`;
      contagem[chave] = (contagem[chave] ?? 0) + 1;
    }
  }
  return contagem;
}

/**
 * Proxima pagina segundo o cabecalho `Link` (`<url>; rel="next"`).
 *
 * A documentacao pede para seguir o `Link` em vez de montar a URL. Sem o
 * cabecalho, `null` -- quem chama decide se tenta `page + 1`.
 */
export function proximaPaginaDoLink(link: string | null): string | null {
  if (!link) return null;
  for (const parte of link.split(",")) {
    const achado = parte.match(/<([^>]+)>\s*;\s*rel="?next"?/i);
    if (achado) return achado[1]!;
  }
  return null;
}

/**
 * Quanto esperar antes da proxima chamada, em milissegundos.
 *
 * A API usa balde de 40 chamadas que esvazia 2 por segundo, e informa quanto
 * falta em `x-rate-limit-reset` -- em MILISSEGUNDOS. A primeira versao do
 * cliente lia como segundos e, num 429, esperaria horas.
 *
 * Com folga no balde, nao espera. Perto do fim, espera o suficiente para uma
 * chamada vazar (500 ms), e nunca mais que 10 s por vez.
 */
export function esperaPeloLimite(
  status: number,
  restantes: string | null,
  reset: string | null,
): number {
  const resetMs = inteiro(reset);
  if (status === 429) return Math.min(10_000, Math.max(1_000, resetMs ?? 2_000));
  const sobra = inteiro(restantes);
  if (sobra !== null && sobra <= 2) return 500;
  return 0;
}
