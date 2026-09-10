/**
 * Calculo do Simples Nacional. Funcoes PURAS: entram numeros, saem numeros.
 *
 * O ponto que costuma ser mal entendido: a aliquota do Simples NAO e a da
 * tabela. A tabela da a aliquota NOMINAL da faixa; o que se paga e a aliquota
 * EFETIVA, que desconta a "parcela a deduzir" e depende da receita dos ultimos
 * 12 meses (RBT12). Uma empresa na 5a faixa tem nominal de 14,7% e efetiva
 * perto de 12% -- confundir os dois erra a conta em milhares de reais.
 */

import {
  ANEXO_II_SIMPLES,
  SUBLIMITE_ICMS_SIMPLES,
  TETO_SIMPLES_NACIONAL,
  type FaixaSimples,
} from "@/types/fiscal";
import { razaoSegura } from "@/lib/format";

/**
 * Faixa correspondente ao RBT12.
 *
 * Acima do teto devolve a ultima faixa: a empresa esta legalmente fora do
 * Simples, mas o painel precisa mostrar ALGUM numero junto do alerta, em vez
 * de uma tela vazia que nao explica nada.
 */
export function faixaPorRBT12(rbt12: number): FaixaSimples {
  const faixa = ANEXO_II_SIMPLES.find((f) => rbt12 <= f.ate);
  return faixa ?? ANEXO_II_SIMPLES[ANEXO_II_SIMPLES.length - 1]!;
}

/**
 * Aliquota efetiva, em percentual.
 *
 *   efetiva = (RBT12 x nominal - parcela a deduzir) / RBT12
 *
 * Empresa nova, sem 12 meses de historico, usa a media dos meses existentes
 * projetada para 12 -- e o que a propria legislacao manda fazer no primeiro ano.
 */
export function aliquotaEfetiva(rbt12: number): number {
  if (rbt12 <= 0) return 0;
  const faixa = faixaPorRBT12(rbt12);
  const efetiva = ((rbt12 * faixa.nominal) / 100 - faixa.deduzir) / rbt12;
  return Math.max(0, efetiva * 100);
}

export interface TributoDoDAS {
  sigla: string;
  nome: string;
  /** Fatia da guia, em percentual. */
  participacao: number;
  /** Quanto deste tributo ha dentro do DAS do mes, em reais. */
  valor: number;
  /** Quanto ele representa da receita do mes, em percentual. */
  aliquotaSobreReceita: number;
}

const NOMES_TRIBUTOS: Record<string, string> = {
  IRPJ: "Imposto de Renda Pessoa Juridica",
  CSLL: "Contribuicao Social sobre o Lucro Liquido",
  COFINS: "Contribuicao para o Financiamento da Seguridade Social",
  PIS: "Programa de Integracao Social",
  CPP: "Contribuicao Patronal Previdenciaria",
  IPI: "Imposto sobre Produtos Industrializados",
  ICMS: "Imposto sobre Circulacao de Mercadorias e Servicos",
};

export interface ApuracaoSimples {
  rbt12: number;
  faixa: number;
  aliquotaNominal: number;
  aliquotaEfetiva: number;
  /** Receita do mes que serviu de base. */
  baseDoMes: number;
  /** Valor do DAS do mes. */
  valorDAS: number;
  /** Quebra do DAS por tributo. Detalhamento -- nao soma por fora. */
  composicao: TributoDoDAS[];
}

/**
 * Apura o DAS de um mes.
 *
 * `baseDoMes` deve ser a receita bruta do mes. O painel usa o RECEBIDO, nao o
 * faturado: pedido cancelado nao gera receita, e boleto nunca pago tambem nao,
 * no regime de caixa (opcao permitida no Simples). Se o contador apurar por
 * competencia, o numero muda -- por isso a base aparece na tela.
 */
export function apurarSimples(rbt12: number, baseDoMes: number): ApuracaoSimples {
  const faixa = faixaPorRBT12(rbt12);
  const efetiva = aliquotaEfetiva(rbt12);
  const valorDAS = (baseDoMes * efetiva) / 100;

  const composicao: TributoDoDAS[] = (
    Object.keys(faixa.reparticao) as Array<keyof FaixaSimples["reparticao"]>
  )
    .map((sigla) => {
      const participacao = faixa.reparticao[sigla];
      const valor = (valorDAS * participacao) / 100;
      return {
        sigla,
        nome: NOMES_TRIBUTOS[sigla] ?? sigla,
        participacao,
        valor,
        aliquotaSobreReceita: (efetiva * participacao) / 100,
      };
    })
    .filter((t) => t.participacao > 0)
    .sort((a, b) => b.valor - a.valor);

  return {
    rbt12,
    faixa: faixa.faixa,
    aliquotaNominal: faixa.nominal,
    aliquotaEfetiva: efetiva,
    baseDoMes,
    valorDAS,
    composicao,
  };
}

// ---------------------------------------------------------------------------
// Monitor de teto
// ---------------------------------------------------------------------------

export type SituacaoTeto =
  | "dentro"
  | "perto_do_sublimite"
  | "acima_do_sublimite"
  | "perto_do_teto"
  | "acima_do_teto";

export interface MonitorTeto {
  rbt12: number;
  situacao: SituacaoTeto;
  /** Fracao do teto ja consumida (0.82 = 82%). */
  usoDoTeto: number;
  usoDoSublimite: number;
  /** Quanto ainda cabe antes de estourar o teto. Negativo se ja estourou. */
  folgaAteOTeto: number;
  folgaAteOSublimite: number;
  titulo: string;
  explicacao: string;
}

/** A partir de que fracao do limite o painel comeca a avisar. */
const LIMIAR_ATENCAO = 0.85;

/**
 * Acompanha os dois limites do Simples.
 *
 * Sao dois, e confundi-los custa caro: passar do SUBLIMITE (R$ 3,6 mi) tira so
 * o ICMS da guia unica -- a empresa segue no Simples e recolhe ICMS por fora.
 * Passar do TETO (R$ 4,8 mi) desenquadra do regime inteiro no ano seguinte.
 */
export function monitorarTeto(rbt12: number): MonitorTeto {
  const usoDoTeto = razaoSegura(rbt12, TETO_SIMPLES_NACIONAL);
  const usoDoSublimite = razaoSegura(rbt12, SUBLIMITE_ICMS_SIMPLES);

  let situacao: SituacaoTeto = "dentro";
  let titulo = "Dentro dos limites do Simples Nacional";
  let explicacao =
    "A receita dos ultimos 12 meses cabe no teto do regime, com folga.";

  if (rbt12 > TETO_SIMPLES_NACIONAL) {
    situacao = "acima_do_teto";
    titulo = "Receita acima do teto do Simples Nacional";
    explicacao =
      "A receita dos ultimos 12 meses passou do teto de R$ 4,8 milhoes. " +
      "Nessa situacao a empresa e desenquadrada do Simples e passa para Lucro " +
      "Presumido ou Real. Os valores calculados abaixo servem so de referencia: " +
      "confirme o enquadramento com o contador antes de usar qualquer numero.";
  } else if (usoDoTeto >= LIMIAR_ATENCAO) {
    situacao = "perto_do_teto";
    titulo = "Perto do teto do Simples Nacional";
    explicacao =
      "A receita dos ultimos 12 meses ja consumiu a maior parte do teto de " +
      "R$ 4,8 milhoes. Vale simular desde agora o custo tributario fora do Simples.";
  } else if (rbt12 > SUBLIMITE_ICMS_SIMPLES) {
    situacao = "acima_do_sublimite";
    titulo = "Acima do sublimite estadual de ICMS";
    explicacao =
      "Passando de R$ 3,6 milhoes, o ICMS sai da guia unica e passa a ser " +
      "recolhido por fora, pelas regras normais do estado. A empresa continua " +
      "no Simples para os tributos federais.";
  } else if (usoDoSublimite >= LIMIAR_ATENCAO) {
    situacao = "perto_do_sublimite";
    titulo = "Perto do sublimite estadual de ICMS";
    explicacao =
      "Ao passar de R$ 3,6 milhoes nos ultimos 12 meses, o ICMS sai da guia " +
      "unica e passa a ser recolhido separadamente.";
  }

  return {
    rbt12,
    situacao,
    usoDoTeto,
    usoDoSublimite,
    folgaAteOTeto: TETO_SIMPLES_NACIONAL - rbt12,
    folgaAteOSublimite: SUBLIMITE_ICMS_SIMPLES - rbt12,
    titulo,
    explicacao,
  };
}

/** `true` quando a situacao merece destaque vermelho na tela. */
export function tetoEmAlerta(situacao: SituacaoTeto): boolean {
  return situacao === "acima_do_teto" || situacao === "perto_do_teto";
}
