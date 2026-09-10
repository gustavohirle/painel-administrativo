/**
 * A fronteira entre "de onde vem o dado" e "o que fazemos com o dado".
 *
 * Esta interface e a peca de arquitetura mais importante do projeto. Hoje ela
 * e implementada por um gerador de dados ficticios; amanha, pelo cliente HTTP
 * da Nuvemshop. As funcoes de `lib/metrics.ts` e `lib/costing.ts` nao sabem a
 * diferenca -- e por isso que a troca nao vai exigir reescrita de regra.
 */

import type { CarrinhoAbandonado, Pedido } from "@/types/nuvemshop";

/** Intervalo de datas em ISO 8601. Ambos os limites sao inclusivos. */
export interface Periodo {
  inicio: string;
  fim: string;
}

export interface FonteDePedidos {
  /** Identificacao da fonte, para a interface avisar em que modo esta. */
  readonly tipo: "demo" | "nuvemshop";

  /** Pedidos criados no periodo. Sem periodo, devolve tudo que a fonte tem. */
  listarPedidos(periodo?: Periodo): Promise<Pedido[]>;

  /** Carrinhos abandonados no periodo. */
  listarCarrinhosAbandonados(periodo?: Periodo): Promise<CarrinhoAbandonado[]>;
}

/** Filtro de periodo aplicado em memoria, para fontes que nao filtram sozinhas. */
export function dentroDoPeriodo(iso: string, periodo?: Periodo): boolean {
  if (!periodo) return true;
  return iso >= periodo.inicio && iso <= periodo.fim;
}

/** Periodo cobrindo um mes inteiro a partir da chave "2026-09". */
export function periodoDoMes(chaveMes: string): Periodo {
  const [ano, mes] = chaveMes.split("-").map(Number);
  const inicio = new Date(Date.UTC(ano!, mes! - 1, 1));
  const fim = new Date(Date.UTC(ano!, mes!, 0, 23, 59, 59, 999));
  return { inicio: inicio.toISOString(), fim: fim.toISOString() };
}
