/**
 * Gerador de pedidos ficticios no shape REAL da API da Nuvemshop.
 *
 * Duas regras que nao podem ser quebradas:
 *
 * 1. SEED FIXO. O painel tem que mostrar os mesmos numeros toda vez que abrir.
 *    Valor mudando no meio da reuniao destroi a credibilidade da apresentacao.
 * 2. O shape de saida e `Pedido`, identico ao da API. Nenhuma funcao de
 *    calculo sabe que estes dados sao inventados.
 *
 * Cenario alvo do mes mais recente (CLAUDE.md secao 6):
 *   ~8.400 pedidos | bruto ~R$ 3,14 mi | nao pago ~14% | cancelado ~5%
 *   reembolsado ~1,3% | frete ~4,7% do recebido | 5 marcas | 6 meses
 */

import type {
  CarrinhoAbandonado,
  Cliente,
  EnderecoEntrega,
  MetodoPagamento,
  MotivoCancelamento,
  Pedido,
  ProdutoDoPedido,
} from "@/types/nuvemshop";
import type { UF } from "@/types/estados";
import { MARCAS, type MarcaCatalogo } from "@/data/catalogo";

// ---------------------------------------------------------------------------
// Aleatoriedade deterministica
// ---------------------------------------------------------------------------

/** Semente fixa. Trocar aqui muda TODOS os numeros do painel. */
export const SEED_PADRAO = 20260101;

/** mulberry32: PRNG pequeno, rapido e reprodutivel. */
function criarRandom(seed: number): () => number {
  let estado = seed >>> 0;
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Random = () => number;

function inteiroEntre(rnd: Random, min: number, max: number): number {
  return Math.floor(rnd() * (max - min + 1)) + min;
}

function numeroEntre(rnd: Random, min: number, max: number): number {
  return rnd() * (max - min) + min;
}

/** Sorteio ponderado. `pesos` nao precisa somar 1. */
function sortearPonderado<T>(rnd: Random, itens: T[], pesos: number[]): T {
  const total = pesos.reduce((s, p) => s + p, 0);
  let alvo = rnd() * total;
  for (let i = 0; i < itens.length; i += 1) {
    alvo -= pesos[i] ?? 0;
    if (alvo <= 0) return itens[i]!;
  }
  return itens[itens.length - 1]!;
}

function dinheiro(valor: number): string {
  return valor.toFixed(2);
}

// ---------------------------------------------------------------------------
// Parametros do cenario
// ---------------------------------------------------------------------------

/**
 * Escala do cenario inteiro.
 *
 * 1 = o cenario do CLAUDE.md: ~8.400 pedidos e ~R$ 3,1 mi de faturamento no
 * mes. E o numero que sustenta a tese de venda ("R$ 3,1 milhoes faturados nao
 * sao R$ 3,1 milhoes recebidos").
 *
 * PORE M: esse porte NAO cabe no Simples Nacional. Projetado para 12 meses da
 * ~R$ 30 mi de receita, contra um teto de R$ 4,8 mi -- o painel vai mostrar,
 * corretamente, que a empresa esta desenquadrada, e a aliquota efetiva sobe
 * para a 6a faixa (~27%), o que come quase todo o lucro na tela.
 *
 * Duas saidas, ambas a uma linha daqui:
 *   - manter 1 e apresentar no Lucro Presumido (troque o regime em /impostos);
 *   - baixar para 0.12 e manter o Simples: ~1.000 pedidos e ~R$ 373 mil/mes,
 *     o que projeta ~R$ 3,6 mi em 12 meses e cai na 5a faixa (~12% efetivo).
 */
export const ESCALA_CENARIO = 1;

/** Pedidos no mes mais recente, antes da escala. */
const PEDIDOS_MES_ATUAL = 8400;

/** Fator de volume de cada mes, do mais antigo ao mais recente. */
const CURVA_MENSAL = [0.78, 0.83, 0.88, 0.91, 0.96, 1.0];

/**
 * Taxa de nao pagamento por meio de pagamento.
 *
 * Sao as ordens de grandeza reais do Brasil: boleto abandona muito mais que
 * cartao. Aplicadas por PEDIDO, produzem ~14% de nao pagamento medido em
 * VALOR -- que e o alvo do cenario. O agregado em valor fica abaixo do
 * agregado em quantidade porque as marcas de ticket alto (Petra, Luma) sao
 * justamente as que quase nao usam boleto. Mexer aqui muda a tese do painel.
 */
const TAXA_NAO_PAGAMENTO: Record<"credit_card" | "pix" | "boleto", number> = {
  credit_card: 0.04,
  pix: 0.2,
  boleto: 0.6,
};

const TAXA_CANCELAMENTO = 0.05;
const TAXA_REEMBOLSO = 0.016;

/** Fracao dos pedidos com frete gratis (promocao acima de X reais). */
const FRACAO_FRETE_GRATIS = 0.48;

/** Fracao dos pedidos com cupom de desconto. */
const FRACAO_COM_DESCONTO = 0.35;

/** Chance de o pedido vir de um cliente que ja comprou antes. */
const CHANCE_CLIENTE_RECORRENTE = 0.26;

/** Carrinhos abandonados gerados por pedido criado. */
const CARRINHOS_POR_PEDIDO = 1.6;

const NOMES = [
  "Ana", "Beatriz", "Carla", "Daniela", "Eduarda", "Fernanda", "Gabriela",
  "Helena", "Isabela", "Juliana", "Karina", "Larissa", "Mariana", "Natalia",
  "Patricia", "Renata", "Sabrina", "Tatiane", "Vanessa", "Bruno", "Caio",
  "Diego", "Eduardo", "Felipe", "Gustavo", "Henrique", "Igor", "Joao",
  "Leonardo", "Marcelo", "Rafael", "Thiago", "Vitor",
];

const SOBRENOMES = [
  "Almeida", "Barbosa", "Carvalho", "Dias", "Esteves", "Ferreira", "Gomes",
  "Henriques", "Ibrahim", "Jesus", "Klein", "Lima", "Machado", "Nogueira",
  "Oliveira", "Pereira", "Queiroz", "Ribeiro", "Santos", "Teixeira",
  "Vasconcelos", "Xavier",
];

const GATEWAYS: Record<MetodoPagamento, string> = {
  credit_card: "Mercado Pago",
  pix: "Mercado Pago",
  boleto: "Mercado Pago",
  debit_card: "Mercado Pago",
  wire_transfer: "Transferencia bancaria",
  other: "Outro",
};

/**
 * Para onde as vendas vao, em peso relativo.
 *
 * Aproxima a distribuicao do e-commerce brasileiro -- Sudeste concentrando
 * mais da metade -- com Goias puxado para cima, porque a fabrica e de la e
 * venda local sempre pesa mais. Essa distribuicao e o que faz o DIFAL ter
 * sentido: e a mistura de aliquotas internas de destino que define a conta.
 */
const DESTINOS: Array<{ uf: UF; cidade: string; cep: string; peso: number }> = [
  { uf: "SP", cidade: "Sao Paulo", cep: "01000", peso: 26 },
  { uf: "RJ", cidade: "Rio de Janeiro", cep: "20000", peso: 10 },
  { uf: "MG", cidade: "Belo Horizonte", cep: "30000", peso: 9 },
  { uf: "GO", cidade: "Goiania", cep: "74000", peso: 7 },
  { uf: "PR", cidade: "Curitiba", cep: "80000", peso: 6 },
  { uf: "RS", cidade: "Porto Alegre", cep: "90000", peso: 5.5 },
  { uf: "BA", cidade: "Salvador", cep: "40000", peso: 5 },
  { uf: "SC", cidade: "Florianopolis", cep: "88000", peso: 4.5 },
  { uf: "PE", cidade: "Recife", cep: "50000", peso: 3.5 },
  { uf: "CE", cidade: "Fortaleza", cep: "60000", peso: 3 },
  { uf: "DF", cidade: "Brasilia", cep: "70000", peso: 3 },
  { uf: "ES", cidade: "Vitoria", cep: "29000", peso: 2 },
  { uf: "PA", cidade: "Belem", cep: "66000", peso: 2 },
  { uf: "MT", cidade: "Cuiaba", cep: "78000", peso: 1.8 },
  { uf: "MS", cidade: "Campo Grande", cep: "79000", peso: 1.5 },
  { uf: "MA", cidade: "Sao Luis", cep: "65000", peso: 1.5 },
  { uf: "PB", cidade: "Joao Pessoa", cep: "58000", peso: 1.2 },
  { uf: "RN", cidade: "Natal", cep: "59000", peso: 1.2 },
  { uf: "AL", cidade: "Maceio", cep: "57000", peso: 1 },
  { uf: "AM", cidade: "Manaus", cep: "69000", peso: 1 },
  { uf: "PI", cidade: "Teresina", cep: "64000", peso: 0.9 },
  { uf: "SE", cidade: "Aracaju", cep: "49000", peso: 0.7 },
  { uf: "RO", cidade: "Porto Velho", cep: "76800", peso: 0.6 },
  { uf: "TO", cidade: "Palmas", cep: "77000", peso: 0.5 },
  { uf: "AC", cidade: "Rio Branco", cep: "69900", peso: 0.3 },
  { uf: "AP", cidade: "Macapa", cep: "68900", peso: 0.3 },
  { uf: "RR", cidade: "Boa Vista", cep: "69300", peso: 0.2 },
];

const MOTIVOS_CANCELAMENTO: MotivoCancelamento[] = [
  "customer",
  "customer",
  "customer",
  "fraud",
  "inventory",
  "other",
];

// ---------------------------------------------------------------------------
// Geracao
// ---------------------------------------------------------------------------

export interface BaseDemonstracao {
  pedidos: Pedido[];
  carrinhos: CarrinhoAbandonado[];
}

interface ClienteEmMemoria extends Cliente {
  totalGasto: number;
  ultimoPedidoId: number | null;
}

/**
 * Lista dos 6 meses do periodo, do mais antigo ao mais recente, ancorada no
 * mes corrente. Os VALORES nao dependem da data (o seed e fixo); so os
 * rotulos acompanham o calendario, para a demonstracao nunca parecer velha.
 */
function mesesDoPeriodo(referencia: Date, quantidade: number): Date[] {
  const meses: Date[] = [];
  for (let i = quantidade - 1; i >= 0; i -= 1) {
    meses.push(
      new Date(Date.UTC(referencia.getUTCFullYear(), referencia.getUTCMonth() - i, 1)),
    );
  }
  return meses;
}

function escolherMarca(rnd: Random): MarcaCatalogo {
  return sortearPonderado(
    rnd,
    MARCAS,
    MARCAS.map((m) => m.participacao),
  );
}

function escolherMetodo(rnd: Random, marca: MarcaCatalogo): MetodoPagamento {
  return sortearPonderado<MetodoPagamento>(
    rnd,
    ["credit_card", "pix", "boleto"],
    [
      marca.mixPagamento.credit_card,
      marca.mixPagamento.pix,
      marca.mixPagamento.boleto,
    ],
  );
}

function sortearEndereco(rnd: Random): EnderecoEntrega {
  const destino = sortearPonderado(
    rnd,
    DESTINOS,
    DESTINOS.map((d) => d.peso),
  );

  return {
    // Nome por extenso de proposito: e assim que a Nuvemshop costuma devolver,
    // e obriga o `normalizarUF` a ser exercitado tambem na demonstracao.
    province: destino.uf,
    city: destino.cidade,
    zipcode: `${destino.cep.slice(0, 5)}-${String(inteiroEntre(rnd, 0, 999)).padStart(3, "0")}`,
    country: "BR",
  };
}

function montarItens(
  rnd: Random,
  marca: MarcaCatalogo,
  proximoItemId: () => number,
): ProdutoDoPedido[] {
  // 1 a 3 linhas por pedido; a maioria com 1 unidade.
  const linhas = sortearPonderado(rnd, [1, 2, 3], [40, 36, 24]);
  const itens: ProdutoDoPedido[] = [];
  const usados = new Set<number>();

  for (let i = 0; i < linhas; i += 1) {
    const produto = sortearPonderado(
      rnd,
      marca.produtos,
      marca.produtos.map((p) => p.popularidade),
    );
    if (usados.has(produto.id)) continue;
    usados.add(produto.id);

    const variante = produto.variantes[inteiroEntre(rnd, 0, produto.variantes.length - 1)]!;
    const quantidade = sortearPonderado(rnd, [1, 2, 3], [74, 19, 7]);

    itens.push({
      id: proximoItemId(),
      product_id: produto.id,
      variant_id: variante.id,
      name: `${produto.nome} ${variante.rotulo}`,
      price: dinheiro(variante.preco),
      quantity: quantidade,
      sku: `${produto.sku}-${variante.rotulo.replace(/\s+/g, "").toUpperCase()}`,
    });
  }

  return itens;
}

/**
 * Gera a base completa de demonstracao.
 *
 * Determinstico: mesmo seed, mesmos numeros, sempre.
 */
export function gerarBaseDemonstracao(
  seed = SEED_PADRAO,
  referencia = new Date(),
): BaseDemonstracao {
  const rnd = criarRandom(seed);
  const meses = mesesDoPeriodo(referencia, CURVA_MENSAL.length);

  const pedidos: Pedido[] = [];
  const carrinhos: CarrinhoAbandonado[] = [];

  // Pool de clientes por marca, para produzir recompra de verdade.
  const clientesPorMarca = new Map<string, ClienteEmMemoria[]>();
  for (const marca of MARCAS) clientesPorMarca.set(marca.nome, []);

  let proximoPedidoId = 500000;
  let proximoNumeroPedido = 1;
  let proximoClienteId = 900000;
  let proximoItemId = 1;
  let proximoCarrinhoId = 700000;
  const gerarItemId = () => proximoItemId++;

  for (let indiceMes = 0; indiceMes < meses.length; indiceMes += 1) {
    const inicioMes = meses[indiceMes]!;
    const ano = inicioMes.getUTCFullYear();
    const mes = inicioMes.getUTCMonth();
    const diasNoMes = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
    const quantidade = Math.max(
      1,
      Math.round(PEDIDOS_MES_ATUAL * (CURVA_MENSAL[indiceMes] ?? 1) * ESCALA_CENARIO),
    );

    for (let i = 0; i < quantidade; i += 1) {
      const marca = escolherMarca(rnd);
      const metodo = escolherMetodo(rnd, marca);

      const dia = inteiroEntre(rnd, 1, diasNoMes);
      const hora = inteiroEntre(rnd, 8, 23);
      const minuto = inteiroEntre(rnd, 0, 59);
      const criadoEm = new Date(Date.UTC(ano, mes, dia, hora, minuto, 0));

      const itens = montarItens(rnd, marca, gerarItemId);
      const subtotal = itens.reduce(
        (soma, item) => soma + Number(item.price) * item.quantity,
        0,
      );

      const desconto =
        rnd() < FRACAO_COM_DESCONTO ? subtotal * numeroEntre(rnd, 0.05, 0.15) : 0;

      // Frete gratis acima de certo valor e promocao comum: o cliente nao paga,
      // mas a loja paga a transportadora do mesmo jeito.
      const freteGratis = rnd() < FRACAO_FRETE_GRATIS;
      const freteCliente = freteGratis ? 0 : numeroEntre(rnd, 22, 46);
      const freteLoja = numeroEntre(rnd, 19, 39);

      const total = subtotal - desconto + freteCliente;

      // --- Desfecho do pedido -------------------------------------------
      // A ordem espelha a precedencia de `classificarPedido`: cancelamento
      // primeiro, depois falta de pagamento, depois reembolso.
      let status: Pedido["status"] = "closed";
      let paymentStatus: Pedido["payment_status"] = "paid";
      let shippingStatus: Pedido["shipping_status"] = "fulfilled";
      let cancelReason: MotivoCancelamento | null = null;
      let pagoEm: string | null = null;

      const naoPagaria = rnd() < TAXA_NAO_PAGAMENTO[metodo as keyof typeof TAXA_NAO_PAGAMENTO];

      if (rnd() < TAXA_CANCELAMENTO) {
        status = "cancelled";
        paymentStatus = naoPagaria ? "pending" : "voided";
        shippingStatus = "unpacked";
        cancelReason =
          MOTIVOS_CANCELAMENTO[inteiroEntre(rnd, 0, MOTIVOS_CANCELAMENTO.length - 1)]!;
      } else if (naoPagaria) {
        status = "open";
        // Boleto/Pix gerado e nunca pago fica "pending"; alguns nem chegam a
        // ser tentados e a Nuvemshop marca como "abandoned".
        paymentStatus = rnd() < 0.25 ? "abandoned" : "pending";
        shippingStatus = "unpacked";
      } else if (rnd() < TAXA_REEMBOLSO) {
        status = "closed";
        paymentStatus = "refunded";
        shippingStatus = "fulfilled";
        pagoEm = new Date(criadoEm.getTime() + inteiroEntre(rnd, 1, 48) * 3600_000).toISOString();
      } else {
        pagoEm = new Date(
          criadoEm.getTime() +
            (metodo === "credit_card" ? inteiroEntre(rnd, 1, 60) * 60_000 : inteiroEntre(rnd, 1, 72) * 3600_000),
        ).toISOString();
      }

      // --- Cliente -------------------------------------------------------
      const pool = clientesPorMarca.get(marca.nome)!;
      let cliente: ClienteEmMemoria;

      if (pool.length > 50 && rnd() < CHANCE_CLIENTE_RECORRENTE) {
        // Recompra tende a vir de quem comprou ha pouco: sorteia no terco final.
        const inicioJanela = Math.floor(pool.length * 0.66);
        cliente = pool[inteiroEntre(rnd, inicioJanela, pool.length - 1)]!;
      } else {
        const nome = NOMES[inteiroEntre(rnd, 0, NOMES.length - 1)]!;
        const sobrenome = SOBRENOMES[inteiroEntre(rnd, 0, SOBRENOMES.length - 1)]!;
        const id = proximoClienteId++;
        cliente = {
          id,
          name: `${nome} ${sobrenome}`,
          email: `${nome.toLowerCase()}.${sobrenome.toLowerCase()}${id}@exemplo.com.br`,
          total_spent: "0.00",
          last_order_id: null,
          totalGasto: 0,
          ultimoPedidoId: null,
          created_at: criadoEm.toISOString(),
        };
        pool.push(cliente);
      }

      const pedidoId = proximoPedidoId++;
      if (paymentStatus === "paid") {
        cliente.totalGasto += total;
      }
      cliente.ultimoPedidoId = pedidoId;
      cliente.total_spent = dinheiro(cliente.totalGasto);
      cliente.last_order_id = pedidoId;

      pedidos.push({
        id: pedidoId,
        number: proximoNumeroPedido++,
        created_at: criadoEm.toISOString(),
        paid_at: pagoEm,
        status,
        payment_status: paymentStatus,
        shipping_status: shippingStatus,
        subtotal: dinheiro(subtotal),
        total: dinheiro(total),
        discount: dinheiro(desconto),
        shipping_cost_customer: dinheiro(freteCliente),
        shipping_cost_owner: dinheiro(freteLoja),
        gateway_name: GATEWAYS[metodo],
        payment_details: {
          method: metodo,
          credit_card_company: metodo === "credit_card" ? "visa" : null,
          installments: metodo === "credit_card" ? sortearPonderado(rnd, [1, 2, 3, 6, 12], [40, 15, 20, 15, 10]) : 1,
        },
        cancel_reason: cancelReason,
        shipping_address: sortearEndereco(rnd),
        customer: {
          id: cliente.id,
          name: cliente.name,
          email: cliente.email,
          total_spent: cliente.total_spent,
          last_order_id: cliente.last_order_id,
          created_at: cliente.created_at,
        },
        products: itens,
        marca: marca.nome,
      });
    }

    // --- Carrinhos abandonados do mes -----------------------------------
    const quantidadeCarrinhos = Math.round(quantidade * CARRINHOS_POR_PEDIDO);
    for (let i = 0; i < quantidadeCarrinhos; i += 1) {
      const marca = escolherMarca(rnd);
      const dia = inteiroEntre(rnd, 1, diasNoMes);
      const criadoEm = new Date(
        Date.UTC(ano, mes, dia, inteiroEntre(rnd, 8, 23), inteiroEntre(rnd, 0, 59)),
      );
      // ~8% dos carrinhos abandonados acabam sendo concluidos sozinhos.
      const concluido = rnd() < 0.08;

      carrinhos.push({
        id: proximoCarrinhoId++,
        created_at: criadoEm.toISOString(),
        total: dinheiro(numeroEntre(rnd, 60, 620)),
        completed_at: concluido
          ? new Date(criadoEm.getTime() + inteiroEntre(rnd, 1, 24) * 3600_000).toISOString()
          : null,
        marca: marca.nome,
      });
    }
  }

  return { pedidos, carrinhos };
}

// ---------------------------------------------------------------------------
// Cache de modulo
// ---------------------------------------------------------------------------

let cache: BaseDemonstracao | null = null;

/**
 * Base de demonstracao memoizada.
 *
 * Gerar ~45 mil pedidos a cada render seria desperdicio; e, mais importante,
 * garante que os numeros nao mudem entre uma navegacao e outra durante a
 * apresentacao.
 */
export function baseDemonstracao(): BaseDemonstracao {
  if (!cache) cache = gerarBaseDemonstracao();
  return cache;
}
