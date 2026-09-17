/**
 * Valores do fechamento do mes, informados a mao (secao 5.1.3).
 *
 * No fim do mes o dono tem os numeros de verdade -- a guia paga, o DIFAL
 * recolhido, a fatura da transportadora -- e eles nao batem com a estimativa
 * do painel. O informado substitui o calculado na pizza e no lucro da tela
 * inicial; o calculado continua existindo e aparece ao lado.
 */

export type CampoFechamento = "impostos" | "difal" | "frete";

export const CAMPOS_FECHAMENTO: CampoFechamento[] = ["impostos", "difal", "frete"];

export const ROTULO_CAMPO_FECHAMENTO: Record<CampoFechamento, string> = {
  impostos: "Impostos",
  difal: "DIFAL",
  frete: "Frete (transportadora)",
};

export interface FechamentoMes {
  /** "AAAA-MM". Um registro por mes, para a operacao inteira. */
  mes: string;
  /** Impostos sem o DIFAL. `null` = usar o calculado. */
  impostos: number | null;
  difal: number | null;
  /** Frete pago as transportadoras (sem a Intelipost). */
  frete: number | null;
  atualizadoEm: string;
}

export type EntradaFechamentoMes = Omit<FechamentoMes, "atualizadoEm">;
