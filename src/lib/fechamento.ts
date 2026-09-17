/**
 * Aplica os valores do fechamento do mes sobre a DRE calculada (5.1.3).
 *
 * O calculado nao muda: comissao, receita real, simuladores e relatorios
 * continuam sobre ele. So a leitura da tela inicial -- pizza, numeros do topo
 * e fim do raio-x -- troca o calculado pelo informado, e a diferenca sai do
 * lucro. Assim a pizza continua fechando no bruto.
 *
 * Funcoes puras.
 */

import type { DemonstrativoResultado } from "@/lib/costing";
import type { CampoFechamento, FechamentoMes } from "@/types/fechamento";

export type ValoresPorCampo<T> = Record<CampoFechamento, T>;

export interface MesFechado {
  calculado: ValoresPorCampo<number>;
  informado: ValoresPorCampo<number | null>;
  /** O que a pizza e o lucro usam: o informado, se houver; senao o calculado. */
  usado: ValoresPorCampo<number>;
  /** Soma de (usado - calculado). Positivo: o fechamento custou mais que a estimativa. */
  ajuste: number;
  /** Impostos + DIFAL usados. */
  totalImpostos: number;
  lucroOperacional: number;
  /** Fracao: lucroOperacional / receitaReal */
  margemOperacionalPercentual: number;
  temInformado: boolean;
}

export function fecharMes(
  dre: DemonstrativoResultado,
  fechamento: Pick<FechamentoMes, CampoFechamento> | null,
): MesFechado {
  const difal = dre.impostos?.difal.total ?? 0;
  // Mesma separacao da pizza: o DIFAL ja esta dentro de `totalImpostos`.
  const calculado: ValoresPorCampo<number> = {
    impostos: Math.max(0, dre.totalImpostos - difal),
    difal,
    frete: dre.reconciliacao.freteTransportadora,
  };
  const informado: ValoresPorCampo<number | null> = {
    impostos: fechamento?.impostos ?? null,
    difal: fechamento?.difal ?? null,
    frete: fechamento?.frete ?? null,
  };
  const usado: ValoresPorCampo<number> = {
    impostos: informado.impostos ?? calculado.impostos,
    difal: informado.difal ?? calculado.difal,
    frete: informado.frete ?? calculado.frete,
  };

  const ajuste =
    usado.impostos - calculado.impostos + (usado.difal - calculado.difal) + (usado.frete - calculado.frete);
  const lucroOperacional = dre.lucroOperacional - ajuste;
  const receitaReal = dre.reconciliacao.receitaReal;

  return {
    calculado,
    informado,
    usado,
    ajuste,
    totalImpostos: usado.impostos + usado.difal,
    lucroOperacional,
    margemOperacionalPercentual: receitaReal > 0 ? lucroOperacional / receitaReal : 0,
    temInformado: informado.impostos !== null || informado.difal !== null || informado.frete !== null,
  };
}

/**
 * Le um valor em reais digitado a mao. `null` para campo vazio, `NaN` para o
 * que nao da para ler.
 *
 * Aceita "12.345,67", "12345,67", "R$ 12.345", "12345.67" e "12345". Com
 * virgula, ela e o decimal e os pontos sao milhar. Sem virgula, um ponto so
 * seguido de uma ou duas casas e decimal ("12345.67"); qualquer outro ponto e
 * milhar ("12.345" = doze mil).
 */
export function lerReais(texto: string): number | null {
  const limpo = texto.replace(/R\$/gi, "").replace(/\s/g, "");
  if (limpo === "") return null;
  let normalizado: string;
  if (limpo.includes(",")) {
    normalizado = limpo.replace(/\./g, "").replace(",", ".");
  } else if (/^\d+\.\d{1,2}$/.test(limpo)) {
    normalizado = limpo;
  } else {
    normalizado = limpo.replace(/\./g, "");
  }
  if (!/^-?\d+(\.\d+)?$/.test(normalizado)) return Number.NaN;
  return Number(normalizado);
}
