/**
 * Funcoes PURAS de metrica: recebem `Pedido[]` e devolvem numeros.
 *
 * Este arquivo NAO importa React, NAO faz fetch, NAO le variavel de ambiente.
 * E a unica peca do projeto que precisa de teste automatizado, porque e a
 * unica que o cliente vai conferir contra a planilha dele.
 */

import {
  metodoDoPedido,
  paraNumero,
  type CarrinhoAbandonado,
  type Pedido,
} from "@/types/nuvemshop";
import { razaoSegura } from "@/lib/format";
import { paraHorarioDeBrasilia } from "@/lib/nuvemshop";

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
  /**
   * `frete` dividido entre quem o recebe: a transportadora
   * (`shipping_cost_owner`) e o intermediario de frete, que fica com a
   * diferenca -- na loja real, R$ 0,73 por pedido para a Intelipost
   * (`INTERMEDIARIO_FRETE`). As duas partes somam `frete`.
   */
  freteTransportadora: number;
  freteIntermediario: number;
  /** recebido - frete. O numero que o cliente deveria estar olhando. */
  receitaReal: number;
  /**
   * Frete cobrado do cliente em TODOS os pedidos, pagos ou nao.
   *
   * O frete e cobrado por fora: num produto de R$ 100 com R$ 19 de frete, o
   * cliente paga R$ 119, e os R$ 19 vao para a transportadora. Por isso ele nao
   * entra na base da comissao nem dos impostos -- e a base "bruto" da comissao
   * precisa do frete de todo pedido criado, nao so dos pagos.
   */
  freteTotal: number;
  /** bruto - freteTotal: o faturamento de produto, sem o frete. */
  brutoSemFrete: number;
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
  let freteTransportadora = 0;
  let freteTotal = 0;

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
    freteTotal += paraNumero(pedido.shipping_cost_customer);

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
      case "recebido": {
        recebido += total;
        const cobrado = paraNumero(pedido.shipping_cost_customer);
        const pagoATransportadora = paraNumero(pedido.shipping_cost_owner);
        frete += cobrado;
        /*
         * Sem o custo da transportadora (campo ausente vira zero na borda), o
         * frete inteiro fica com ela: jogar tudo no intermediario inventaria
         * um custo. E a loja pagando MAIS que cobrou (frete gratis) nao e
         * modelado aqui -- o painel so divide o que o cliente pagou.
         */
        freteTransportadora +=
          pagoATransportadora > 0 ? Math.min(cobrado, pagoATransportadora) : cobrado;
        quantidade.recebido += 1;
        break;
      }
    }
  }

  return {
    bruto,
    naoPago,
    cancelado,
    reembolsado,
    recebido,
    frete,
    freteTransportadora,
    freteIntermediario: frete - freteTransportadora,
    receitaReal: recebido - frete,
    freteTotal,
    brutoSemFrete: bruto - freteTotal,
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
  // Sem frete: ele e cobrado do cliente por fora e nao entra na comissao.
  const comissaoSobreBruto = reconciliacao.brutoSemFrete * fracao;
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
  /** Faturamento bruto sem o frete cobrado do cliente: a base "bruto" da comissao. */
  brutoSemFrete: number;
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
      brutoSemFrete: r.brutoSemFrete,
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
    const chave = metodoDoPedido(pedido);
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

/** Uma linha do grafico de evolucao: uma marca, um valor por mes. */
export interface SerieMensal {
  marca: string;
  /**
   * Um valor por mes, na ordem de `EvolucaoPorMarca.meses`. Mes sem venda
   * entra como ZERO, e nao como buraco: a linha precisa de um ponto em cada
   * mes para nao "pular" por cima de um periodo em que a loja nao vendeu --
   * que e exatamente o que aconteceu com as lojas novas (Duale e Revenda so
   * tem venda a partir de julho/2026).
   */
  valores: number[];
}

export interface EvolucaoPorMarca {
  /** Os meses do periodo, do mais antigo para o mais novo. */
  meses: string[];
  /** Uma serie por marca, da que mais faturou no periodo para a que menos. */
  series: SerieMensal[];
  /** Soma das marcas, mes a mes. E a mesma linha de `evolucaoMensal().bruto`. */
  total: number[];
}

/**
 * Faturamento bruto por marca, mes a mes.
 *
 * E a fonte do grafico de evolucao (5.5), que passou de duas linhas (bruto x
 * recebido) para uma linha por influencer mais o total.
 *
 * A metrica e o BRUTO, e nao o recebido, por duas razoes: e o numero que a
 * pessoa tem na cabeca ao comparar uma marca com a outra, e assim a linha do
 * total continua sendo exatamente a linha de bruto que o grafico ja mostrava.
 *
 * Uma varredura so sobre os pedidos: com 278 mil deles, filtrar a base por
 * marca dentro de um laco de meses releria tudo dezenas de vezes.
 */
export function evolucaoPorMarca(pedidos: Pedido[], meses = 12): EvolucaoPorMarca {
  const porMarcaMes = new Map<string, Pedido[]>();
  const mesesVistos = new Set<string>();
  const marcasVistas = new Set<string>();

  for (const pedido of pedidos) {
    const mes = chaveMes(pedido.created_at);
    mesesVistos.add(mes);
    marcasVistas.add(pedido.marca);
    const chave = `${pedido.marca}\u0000${mes}`;
    const lista = porMarcaMes.get(chave);
    if (lista) lista.push(pedido);
    else porMarcaMes.set(chave, [pedido]);
  }

  const janela = [...mesesVistos].sort().slice(-meses);
  const total = janela.map(() => 0);

  const series: SerieMensal[] = [...marcasVistas]
    .map((marca) => {
      const valores = janela.map((mes, i) => {
        const lista = porMarcaMes.get(`${marca}\u0000${mes}`);
        const bruto = lista ? reconciliar(lista).bruto : 0;
        total[i] = (total[i] ?? 0) + bruto;
        return bruto;
      });
      return { marca, valores };
    })
    // Da maior para a menor: e a ordem da legenda, e a cor acompanha.
    .sort((a, b) => soma(b.valores) - soma(a.valores));

  return { meses: janela, series, total };
}

const soma = (valores: number[]) => valores.reduce((s, v) => s + v, 0);

/** Chave de agrupamento mensal a partir do `created_at` (ISO 8601). */
export function chaveMes(iso: string): string {
  return iso.slice(0, 7);
}

/**
 * Bruto x recebido, mes a mes.
 *
 * NENHUMA TELA USA isto hoje: o grafico de evolucao passou a ser uma linha por
 * influencer (`evolucaoPorMarca`) em 23/09/2026. Fica aqui, com teste, pelo
 * mesmo motivo das funcoes de comissao da 5.2 -- e a unica forma mensal do
 * recebido e da receita real, e o dia em que a distancia entre faturar e
 * receber voltar a ser um grafico, e daqui que ela sai.
 */
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
// O dia de hoje (5.16, "Vendas de hoje")
// ---------------------------------------------------------------------------

/** Chave de agrupamento diario "2026-09-18", pelo mesmo corte de `chaveMes`. */
/** Um dia do grafico de vendas por dia. */
export interface DiaDeVenda {
  /** "2026-09-24". */
  dia: string;
  quantidade: number;
  /** Tudo que foi vendido no dia, pago ou nao -- o `bruto` de `reconciliar`. */
  bruto: number;
  /** O que ja entrou -- o `recebido` de `reconciliar`. */
  recebido: number;
}

export interface VendasDoMes {
  mes: string;
  /** Um item por dia do mes, do dia 1 ao ultimo, com zero onde nao houve venda. */
  dias: DiaDeVenda[];
  /** O mes inteiro, pela mesma `reconciliar`. E a soma dos dias. */
  total: { quantidade: number; bruto: number; recebido: number };
}

/**
 * Vendas de cada dia de um mes: quantidade, valor vendido e o que ja entrou.
 *
 * E o grafico de barras da aba Influencers (5.16.1), pedido pelo dono em
 * 24/09/2026: o quadro "Vendas de hoje" nao faz sentido olhando um mes que nao
 * e o atual, e ali ele quer ver o mes dia a dia.
 *
 * Nenhuma conta nova: cada dia e `reconciliar` sobre os pedidos dele, a mesma
 * funcao do quadro de hoje e da tela inicial. Por isso o dia de hoje no grafico
 * bate exatamente com o numero grande do quadro acima dele -- ha teste.
 *
 * TODOS os dias do mes entram, inclusive os sem venda e os que ainda nao
 * chegaram: uma barra ausente no meio da serie diz "nao vendeu", e pular o dia
 * juntaria o dia 9 com o 11 como se fossem vizinhos.
 */
export function vendasPorDia(pedidos: Pedido[], mes: string): VendasDoMes {
  const [ano, numeroMes] = mes.split("-").map(Number) as [number, number];
  // Dia 0 do mes seguinte e o ultimo deste. Em UTC, para o fuso da maquina nao
  // mexer na conta.
  const ultimoDia = new Date(Date.UTC(ano, numeroMes, 0)).getUTCDate();

  const porDia = new Map<string, Pedido[]>();
  const doMes: Pedido[] = [];
  for (const pedido of pedidos) {
    if (chaveMes(pedido.created_at) !== mes) continue;
    doMes.push(pedido);
    const dia = chaveDia(pedido.created_at);
    const lista = porDia.get(dia);
    if (lista) lista.push(pedido);
    else porDia.set(dia, [pedido]);
  }

  const dias: DiaDeVenda[] = [];
  for (let d = 1; d <= ultimoDia; d++) {
    const dia = `${mes}-${String(d).padStart(2, "0")}`;
    const lista = porDia.get(dia);
    if (!lista) {
      dias.push({ dia, quantidade: 0, bruto: 0, recebido: 0 });
      continue;
    }
    const r = reconciliar(lista);
    dias.push({ dia, quantidade: r.quantidade.total, bruto: r.bruto, recebido: r.recebido });
  }

  const r = reconciliar(doMes);
  return {
    mes,
    dias,
    total: { quantidade: r.quantidade.total, bruto: r.bruto, recebido: r.recebido },
  };
}

export function chaveDia(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Hoje em BRASILIA, na forma das chaves acima.
 *
 * O pedido foi pedido assim: "comecando a meia-noite", e nao as ultimas 24
 * horas. Meia-noite de onde importa: o servidor de producao roda em UTC, entao
 * `new Date().getDate()` la vira o dia seguinte as 21h daqui -- e o quadro de
 * vendas de hoje zeraria no meio da noite de trabalho, tres horas antes da
 * hora. Por isso o dia sai de `paraHorarioDeBrasilia`, a mesma funcao que
 * reescreve a data de todo pedido na borda da API.
 */
export function diaDeHoje(agora: Date = new Date()): string {
  return chaveDia(paraHorarioDeBrasilia(agora.toISOString()) ?? agora.toISOString());
}

/**
 * Pedidos CRIADOS num dia.
 *
 * Como `filtrarPorMes`, compara texto com texto: em modo live o `created_at` ja
 * esta em -03:00, entao o corte cai exatamente na meia-noite de Brasilia. Na
 * demonstracao as datas sao UTC (nao passam pela borda), e ali o corte fica 3
 * horas deslocado -- a mesma aproximacao que o agrupamento por mes ja tem.
 */
export function filtrarPorDia(pedidos: Pedido[], dia: string): Pedido[] {
  return pedidos.filter((p) => chaveDia(p.created_at) === dia);
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
