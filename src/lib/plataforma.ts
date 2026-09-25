/**
 * Apuracao das taxas de plataforma e meio de pagamento.
 *
 * Funcoes PURAS: recebem pedidos e o cadastro de taxas, devolvem numeros.
 */

import { metodoDoPedido, paraNumero, type Pedido } from "@/types/nuvemshop";
import { custoDaTransacao, type TaxaPlataforma } from "@/types/plataforma";
import { pedidosRecebidos } from "@/lib/metrics";
import { razaoSegura } from "@/lib/format";

export interface LinhaTaxaMetodo {
  metodo: string;
  /** Quantos pedidos recebidos usaram este metodo. */
  pedidos: number;
  /** Valor dos pedidos sobre o qual a taxa incidiu. */
  base: number;
  /** Quantos pedidos entraram na base (pagos ou nao, conforme a regra). */
  pedidosNaBase: number;
  /** Parte cobrada como percentual. */
  parcelaPercentual: number;
  /** Parte cobrada como valor fixo por transacao. */
  parcelaFixa: number;
  /** parcelaPercentual + parcelaFixa */
  total: number;
  /** Fracao do que entrou por este metodo que virou taxa. */
  cargaEfetiva: number;
  /** `null` quando o metodo nao tem taxa cadastrada. */
  taxa: TaxaPlataforma | null;
}

/**
 * O que um MARKETPLACE reteve, por marca.
 *
 * Fica separado das linhas por meio de pagamento porque a cobranca e outra: a
 * do gateway e um percentual sobre o valor pago, e esta vem pronta do extrato
 * do canal, pedido a pedido. Somar as duas numa linha so esconderia que uma e
 * cadastro e a outra e fato.
 */
export interface LinhaTaxaDeCanal {
  marca: string;
  /** Pedidos recebidos da marca no periodo. */
  pedidos: number;
  /** Quantos deles ja vieram com taxa no extrato do canal. */
  comExtrato: number;
  /** Soma das taxas cobradas pelo canal. */
  total: number;
}

export interface ResultadoTaxasPlataforma {
  /** Tudo que a plataforma e o gateway retiveram no periodo. */
  total: number;
  /** Soma dos valores sobre os quais as taxas incidiram. */
  base: number;
  /** Fracao do RECEBIDO que virou taxa -- e o recebido que paga a conta. */
  cargaSobreRecebido: number;
  /** Uma linha por metodo presente no periodo, maior primeiro. */
  porMetodo: LinhaTaxaMetodo[];
  /** `true` se alguma taxa usada ainda nao foi conferida contra a fatura. */
  temTaxaNaoConfirmada: boolean;
  /** Valor por metodos SEM taxa cadastrada -- lacuna declarada. */
  recebidoSemTaxa: number;
  metodosSemTaxa: string[];
  /**
   * O mesmo `total`, separado por marca.
   *
   * E daqui que sai a base "o que cai na conta" da comissao (`liquido`): a
   * comissao desconta exatamente a taxa que a DRE desconta, e nao uma segunda
   * conta parecida.
   */
  porMarca: Record<string, number>;
  /**
   * Taxas cobradas pelos marketplaces, uma linha por marca.
   *
   * Ja entram em `total` e em `porMarca` -- ou seja, na DRE, na fatia da
   * pizza e na base "o que cai na conta" da comissao (5.1.2). A comissao do
   * influencer de marketplace sai depois das taxas do canal, como o dono pediu.
   */
  porCanal: LinhaTaxaDeCanal[];
}

const VAZIO: ResultadoTaxasPlataforma = {
  total: 0,
  base: 0,
  cargaSobreRecebido: 0,
  porMetodo: [],
  temTaxaNaoConfirmada: false,
  recebidoSemTaxa: 0,
  metodosSemTaxa: [],
  porMarca: {},
  porCanal: [],
};

/**
 * Apura as taxas sobre os pedidos RECEBIDOS.
 *
 * So os recebidos, pela mesma razao do CMV e dos impostos: boleto que nunca
 * foi pago nao gera cobranca do gateway. Somar a taxa dele inventaria um custo
 * que ninguem debitou -- e, ironicamente, faria o boleto parecer ainda pior do
 * que ja e.
 */
export function apurarTaxasPlataforma(
  pedidos: Pedido[],
  taxas: TaxaPlataforma[],
): ResultadoTaxasPlataforma {
  if (pedidos.length === 0) return VAZIO;

  const porMetodoCadastrado = new Map(taxas.map((t) => [t.metodo, t]));
  const recebidos = new Set(pedidosRecebidos(pedidos));

  interface Acumulado {
    pedidos: number;
    pedidosNaBase: number;
    base: number;
    percentual: number;
    fixa: number;
  }
  const mapa = new Map<string, Acumulado>();
  const porMarca: Record<string, number> = {};
  /** Taxa cobrada pelo canal, so dos recebidos: extrato de pedido cancelado e estorno. */
  const canais = new Map<string, { pedidos: number; comExtrato: number; total: number }>();

  for (const pedido of pedidos) {
    const metodo = metodoDoPedido(pedido);
    const valor = paraNumero(pedido.total);
    const taxa = porMetodoCadastrado.get(metodo);
    const foiRecebido = recebidos.has(pedido);

    const acc =
      mapa.get(metodo) ?? { pedidos: 0, pedidosNaBase: 0, base: 0, percentual: 0, fixa: 0 };

    // A contagem de pedidos do metodo e sempre sobre os recebidos: e ela que
    // a tela usa para falar de volume que virou dinheiro.
    if (foiRecebido) acc.pedidos += 1;

    /*
     * Cada taxa diz sobre o que incide. Sem cadastro, o pedido entra so na
     * contagem -- o metodo aparece na tela como lacuna, sem custo inventado.
     */
    const entraNaBase = taxa?.ativa
      ? taxa.base === "bruto" || foiRecebido
      : foiRecebido;

    if (entraNaBase) {
      acc.pedidosNaBase += 1;
      acc.base += valor;

      if (taxa?.ativa) {
        const percentual = (taxa.percentual / 100) * valor;
        acc.percentual += percentual;
        acc.fixa += taxa.valorFixo;
        porMarca[pedido.marca] = (porMarca[pedido.marca] ?? 0) + percentual + taxa.valorFixo;
      }
    }

    if (foiRecebido) {
      const canal = canais.get(pedido.marca) ?? { pedidos: 0, comExtrato: 0, total: 0 };
      canal.pedidos += 1;
      if (pedido.taxaCanal !== undefined) {
        canal.comExtrato += 1;
        canal.total += pedido.taxaCanal;
      }
      canais.set(pedido.marca, canal);
    }

    mapa.set(metodo, acc);
  }

  /*
   * So marca que TEM taxa de canal vira linha. As da Nuvemshop passariam aqui
   * com zero, e uma linha de zero afirmaria que o canal nao cobra nada --
   * quando o que existe e canal nenhum. `comExtrato` menor que `pedidos` diz
   * quantos ainda nao foram liquidados, e a tela avisa.
   */
  const porCanal: LinhaTaxaDeCanal[] = [...canais.entries()]
    .filter(([, c]) => c.comExtrato > 0)
    .map(([marca, c]) => ({ marca, pedidos: c.pedidos, comExtrato: c.comExtrato, total: c.total }))
    .sort((a, b) => b.total - a.total);

  for (const linha of porCanal) {
    porMarca[linha.marca] = (porMarca[linha.marca] ?? 0) + linha.total;
  }

  const porMetodo: LinhaTaxaMetodo[] = [...mapa.entries()].map(([metodo, acc]) => {
    const total = acc.percentual + acc.fixa;
    return {
      metodo,
      pedidos: acc.pedidos,
      base: acc.base,
      pedidosNaBase: acc.pedidosNaBase,
      parcelaPercentual: acc.percentual,
      parcelaFixa: acc.fixa,
      total,
      cargaEfetiva: razaoSegura(total, acc.base),
      taxa: porMetodoCadastrado.get(metodo) ?? null,
    };
  });

  porMetodo.sort((a, b) => b.total - a.total);

  const base = porMetodo.reduce((s, l) => s + l.base, 0);
  const total =
    porMetodo.reduce((s, l) => s + l.total, 0) + porCanal.reduce((s, l) => s + l.total, 0);

  // A carga e sempre medida contra o RECEBIDO, mesmo quando a taxa incide
  // sobre o bruto: e do dinheiro que entrou que ela sai.
  const recebidoTotal = pedidosRecebidos(pedidos).reduce(
    (soma, p) => soma + paraNumero(p.total),
    0,
  );

  // Metodo sem cadastro (ou com a taxa desativada) nao some da tela: aparece
  // com total zero e entra na lacuna declarada, para ninguem ler o total como
  // se cobrisse tudo que entrou.
  const semTaxa = porMetodo.filter((l) => !l.taxa?.ativa);

  return {
    total,
    base,
    cargaSobreRecebido: razaoSegura(total, recebidoTotal),
    porMetodo,
    temTaxaNaoConfirmada: porMetodo.some(
      (l) => l.taxa?.ativa && !l.taxa.confirmadaNaFatura,
    ),
    recebidoSemTaxa: semTaxa.reduce((s, l) => s + l.base, 0),
    metodosSemTaxa: semTaxa.map((l) => l.metodo),
    porMarca,
    porCanal,
  };
}

/**
 * Taxa de UM pedido. Usada para ratear a taxa entre os itens na margem por
 * produto -- ver `rentabilidadePorProduto`.
 */
export function taxaDoPedido(pedido: Pedido, taxas: TaxaPlataforma[]): number {
  const metodo = metodoDoPedido(pedido);
  const taxa = taxas.find((t) => t.metodo === metodo);
  if (!taxa) return 0;
  return custoDaTransacao(taxa, paraNumero(pedido.total));
}

/** Rateio da taxa entre os itens so faz sentido em pedido que foi produzido. */
export { pedidosRecebidos };
