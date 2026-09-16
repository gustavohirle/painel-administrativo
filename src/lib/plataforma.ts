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

    mapa.set(metodo, acc);
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
  const total = porMetodo.reduce((s, l) => s + l.total, 0);

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
