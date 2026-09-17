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

