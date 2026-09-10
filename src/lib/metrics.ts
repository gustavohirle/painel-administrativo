/**
 * Funcoes PURAS de metrica: recebem `Pedido[]` e devolvem numeros.
 *
 * Este arquivo NAO importa React, NAO faz fetch, NAO le variavel de ambiente.
 * E a unica peca do projeto que precisa de teste automatizado, porque e a
 * unica que o cliente vai conferir contra a planilha dele.
 */

import {
  paraNumero,
  type CarrinhoAbandonado,
  type Pedido,
} from "@/types/nuvemshop";
import { razaoSegura } from "@/lib/format";

// ---------------------------------------------------------------------------
// Classificacao do pedido
// ---------------------------------------------------------------------------

export type CategoriaPedido =
  | "cancelado"
  | "reembolsado"
  | "naoPago"
  | "recebido";

/**
 * PRECEDENCIA (documentada porque e a decisao mais facil de errar):
 *
 *   cancelado > reembolsado/estornado > nao pago > recebido
 *
 * Um pedido cancelado que tambem esta com `payment_status: pending` cairia em
 * duas categorias. Sem uma ordem fixa ele seria contado duas vezes e a cascata
 * nao fecharia -- e o cliente percebe na hora. Aqui cada pedido entra em
 * EXATAMENTE UM balde, entao `recebido` e sempre a sobra exata.
 */
export function classificarPedido(pedido: Pedido): CategoriaPedido {
  if (pedido.status === "cancelled") return "cancelado";
  if (pedido.payment_status === "refunded" || pedido.payment_status === "voided") {
    return "reembolsado";
  }
  if (pedido.payment_status === "pending" || pedido.payment_status === "abandoned") {
    return "naoPago";
  }
  return "recebido";
}

/** Pedidos que efetivamente viraram dinheiro na conta. */
export function pedidosRecebidos(pedidos: Pedido[]): Pedido[] {
  return pedidos.filter((p) => classificarPedido(p) === "recebido");
}

// ---------------------------------------------------------------------------
// 5.1 Reconciliacao de faturamento (o grafico principal)
// ---------------------------------------------------------------------------

export interface Reconciliacao {
  /** Soma de `total` de TODOS os pedidos criados no periodo. */
  bruto: number;
  /** Boleto/Pix gerado e nunca pago. */
  naoPago: number;
  /** Pedidos com `status: cancelled`. */
  cancelado: number;
  /** Reembolsos e estornos. */
  reembolsado: number;
  /** bruto - naoPago - cancelado - reembolsado */
  recebido: number;
  /** Frete cobrado do cliente nos pedidos recebidos: entra na conta, nao e receita. */
  frete: number;
  /** recebido - frete. O numero que o cliente deveria estar olhando. */
  receitaReal: number;
  /** Contagens, para a leitura em quantidade de pedidos. */
  quantidade: {
    total: number;
    naoPago: number;
    cancelado: number;
    reembolsado: number;
    recebido: number;
  };
}

export function reconciliar(pedidos: Pedido[]): Reconciliacao {
  let bruto = 0;
  let naoPago = 0;
  let cancelado = 0;
  let reembolsado = 0;
  let recebido = 0;
  let frete = 0;

  const quantidade = {
    total: pedidos.length,
    naoPago: 0,
    cancelado: 0,
    reembolsado: 0,
    recebido: 0,
  };

  for (const pedido of pedidos) {
    const total = paraNumero(pedido.total);
    bruto += total;

    switch (classificarPedido(pedido)) {
      case "cancelado":
        cancelado += total;
        quantidade.cancelado += 1;
        break;
      case "reembolsado":
        reembolsado += total;
        quantidade.reembolsado += 1;
        break;
      case "naoPago":
        naoPago += total;
        quantidade.naoPago += 1;
        break;
      case "recebido":
        recebido += total;
        frete += paraNumero(pedido.shipping_cost_customer);
        quantidade.recebido += 1;
        break;
    }
  }

  return {
    bruto,
    naoPago,
    cancelado,
    reembolsado,
    recebido,
    frete,
    receitaReal: recebido - frete,
    quantidade,
  };
}

// ---------------------------------------------------------------------------
// 5.2 Comissao de influencer
// ---------------------------------------------------------------------------

export interface ComparativoComissao {
  percentual: number;
  /** O que o cliente paga hoje: percentual sobre o faturamento bruto. */
  comissaoSobreBruto: number;
  /** O que seria pago se a base fosse a receita real. */
  comissaoSobreReal: number;
  /** Diferenca no periodo entre as duas bases. */
  diferencaMensal: number;
  /** Diferenca mensal x 12. */
  projecaoAnual: number;
}

export function compararComissao(
  reconciliacao: Reconciliacao,
  percentual: number,
): ComparativoComissao {
  const fracao = percentual / 100;
  const comissaoSobreBruto = reconciliacao.bruto * fracao;
  const comissaoSobreReal = reconciliacao.receitaReal * fracao;
  const diferencaMensal = comissaoSobreBruto - comissaoSobreReal;

  return {
    percentual,
    comissaoSobreBruto,
    comissaoSobreReal,
    diferencaMensal,
    projecaoAnual: diferencaMensal * 12,
  };
}

// ---------------------------------------------------------------------------
// 5.3 Por marca
// ---------------------------------------------------------------------------

export interface LinhaMarca {
  marca: string;
  bruto: number;
  /** Valor absoluto nao pago -- necessario para somar a linha de total. */
  naoPago: number;
  recebido: number;
  receitaReal: number;
  /** Fracao (0.14), nao percentual pronto. */
  taxaNaoPago: number;
  comissaoSobreBruto: number;
  comissaoSobreReal: number;
  diferenca: number;
  /** Sinaliza publico de baixa qualidade ou excesso de boleto. */
  alerta: boolean;
  quantidadePedidos: number;
}

/** Acima disto a marca ganha destaque visual -- e um insight de venda. */
export const LIMITE_ALERTA_NAO_PAGO = 0.2;

export function agruparPorMarca(
  pedidos: Pedido[],
  percentual: number,
): LinhaMarca[] {
  const porMarca = new Map<string, Pedido[]>();
  for (const pedido of pedidos) {
    const lista = porMarca.get(pedido.marca);
    if (lista) lista.push(pedido);
    else porMarca.set(pedido.marca, [pedido]);
  }

  const linhas: LinhaMarca[] = [];
  for (const [marca, lista] of porMarca) {
    const r = reconciliar(lista);
    const c = compararComissao(r, percentual);
    const taxaNaoPago = razaoSegura(r.naoPago, r.bruto);

    linhas.push({
      marca,
      bruto: r.bruto,
      naoPago: r.naoPago,
      recebido: r.recebido,
      receitaReal: r.receitaReal,
      taxaNaoPago,
      comissaoSobreBruto: c.comissaoSobreBruto,
      comissaoSobreReal: c.comissaoSobreReal,
      diferenca: c.diferencaMensal,
      alerta: taxaNaoPago > LIMITE_ALERTA_NAO_PAGO,
      quantidadePedidos: r.quantidade.total,
    });
  }

  // Maior diferenca primeiro: a marca que mais distorce a comissao lidera.
  return linhas.sort((a, b) => b.diferenca - a.diferenca);
}

// ---------------------------------------------------------------------------
// 5.4 Meios de pagamento
// ---------------------------------------------------------------------------

export interface LinhaMetodoPagamento {
  metodo: string;
  quantidadePedidos: number;
  /** Fracao dos pedidos do periodo que usaram este metodo. */
  participacao: number;
  bruto: number;
  recebido: number;
  /** Fracao do bruto do metodo que nunca foi paga. */
  taxaNaoPagamento: number;
}

export function agruparPorMetodoPagamento(
  pedidos: Pedido[],
): LinhaMetodoPagamento[] {
  const grupos = new Map<string, Pedido[]>();
  for (const pedido of pedidos) {
    const chave = pedido.payment_details.method ?? "other";
    const lista = grupos.get(chave);
    if (lista) lista.push(pedido);
    else grupos.set(chave, [pedido]);
  }

  const linhas: LinhaMetodoPagamento[] = [];
  for (const [metodo, lista] of grupos) {
    const r = reconciliar(lista);
    linhas.push({
      metodo,
      quantidadePedidos: lista.length,
      participacao: razaoSegura(lista.length, pedidos.length),
      bruto: r.bruto,
      recebido: r.recebido,
      taxaNaoPagamento: razaoSegura(r.naoPago, r.bruto),
    });
  }

  return linhas.sort((a, b) => b.quantidadePedidos - a.quantidadePedidos);
}

// ---------------------------------------------------------------------------
// 5.5 Evolucao mensal
// ---------------------------------------------------------------------------

export interface PontoEvolucao {
  /** Chave "2026-09". */
  mes: string;
  bruto: number;
  recebido: number;
  receitaReal: number;
}

/** Chave de agrupamento mensal a partir do `created_at` (ISO 8601). */
export function chaveMes(iso: string): string {
  return iso.slice(0, 7);
}

export function evolucaoMensal(pedidos: Pedido[], meses = 6): PontoEvolucao[] {
  const grupos = new Map<string, Pedido[]>();
  for (const pedido of pedidos) {
    const chave = chaveMes(pedido.created_at);
    const lista = grupos.get(chave);
    if (lista) lista.push(pedido);
    else grupos.set(chave, [pedido]);
  }

  const pontos = [...grupos.entries()]
    .map(([mes, lista]) => {
      const r = reconciliar(lista);
      return {
        mes,
        bruto: r.bruto,
        recebido: r.recebido,
        receitaReal: r.receitaReal,
      };
    })
    .sort((a, b) => a.mes.localeCompare(b.mes));

  return pontos.slice(-meses);
}

/** Lista de meses presentes nos dados, do mais recente para o mais antigo. */
export function mesesDisponiveis(pedidos: Pedido[]): string[] {
  const chaves = new Set(pedidos.map((p) => chaveMes(p.created_at)));
  return [...chaves].sort((a, b) => b.localeCompare(a));
}

export function filtrarPorMes(pedidos: Pedido[], mes: string): Pedido[] {
  return pedidos.filter((p) => chaveMes(p.created_at) === mes);
}

// ---------------------------------------------------------------------------
// 5.6 Sinais adicionais (rodape)
// ---------------------------------------------------------------------------

export interface SinaisAdicionais {
  carrinhosAbandonados: number;
  valorCarrinhosAbandonados: number;
  /** Fracao dos clientes que compraram mais de uma vez na janela analisada. */
  taxaRecompra: number;
  /** Media de dias entre uma compra e a seguinte do mesmo cliente. */
  cicloMedioRecompraDias: number;
}

/**
 * Carrinhos abandonados sao do PERIODO; recompra e do HISTORICO.
 *
 * Medir recompra dentro de um mes so responde "quantos compraram duas vezes em
 * 30 dias", que e quase ninguem, e o ciclo medio fica artificialmente preso
 * abaixo de 30 dias. Por isso `pedidosParaRecompra` e um parametro separado --
 * quem chama passa a base inteira.
 */
export function calcularSinaisAdicionais(
  pedidos: Pedido[],
  carrinhos: CarrinhoAbandonado[],
  pedidosParaRecompra: Pedido[] = pedidos,
): SinaisAdicionais {
  const abandonados = carrinhos.filter((c) => c.completed_at === null);
  const valorCarrinhos = abandonados.reduce(
    (soma, c) => soma + paraNumero(c.total),
    0,
  );

  // Recompra so faz sentido sobre pedidos que viraram dinheiro.
  const datasPorCliente = new Map<number, number[]>();
  for (const pedido of pedidosRecebidos(pedidosParaRecompra)) {
    const t = new Date(pedido.created_at).getTime();
    const lista = datasPorCliente.get(pedido.customer.id);
    if (lista) lista.push(t);
    else datasPorCliente.set(pedido.customer.id, [t]);
  }

  let clientesRecorrentes = 0;
  let somaIntervalosDias = 0;
  let quantidadeIntervalos = 0;
  const UM_DIA = 1000 * 60 * 60 * 24;

  for (const datas of datasPorCliente.values()) {
    if (datas.length < 2) continue;
    clientesRecorrentes += 1;
    datas.sort((a, b) => a - b);
    for (let i = 1; i < datas.length; i += 1) {
      somaIntervalosDias += (datas[i]! - datas[i - 1]!) / UM_DIA;
      quantidadeIntervalos += 1;
    }
  }

  return {
    carrinhosAbandonados: abandonados.length,
    valorCarrinhosAbandonados: valorCarrinhos,
    taxaRecompra: razaoSegura(clientesRecorrentes, datasPorCliente.size),
    cicloMedioRecompraDias: razaoSegura(somaIntervalosDias, quantidadeIntervalos),
  };
}
