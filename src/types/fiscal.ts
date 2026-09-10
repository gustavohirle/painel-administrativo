/**
 * Modelo tributario.
 *
 * AVISO QUE VALE PARA O ARQUIVO INTEIRO: as aliquotas semeadas aqui sao um
 * PONTO DE PARTIDA, nao uma apuracao. Elas mudam por NCM, por regime, por
 * beneficio fiscal estadual e por ano. Todo imposto carrega o campo
 * `confirmadoPeloContador`, que comeca `false` e aparece na tela ate alguem
 * confirmar. O painel nunca apresenta numero fiscal como se fosse definitivo.
 */

export type RegimeTributario =
  | "simples_nacional"
  | "lucro_presumido"
  | "lucro_real";

/** Anexos do Simples Nacional. Industria e o Anexo II. */
export type AnexoSimples = "I" | "II" | "III" | "IV" | "V";

export type EsferaImposto = "federal" | "estadual" | "municipal";

/**
 * Sobre o que a aliquota incide.
 *
 * `receita`  -- percentual sobre o valor vendido (ICMS, IPI, PIS, COFINS).
 * `lucro`    -- percentual sobre o resultado (IRPJ e CSLL fora do Simples).
 */
export type BaseIncidencia = "receita" | "lucro";

export interface Imposto {
  id: string;
  nome: string;
  sigla: string;
  esfera: EsferaImposto;
  baseIncidencia: BaseIncidencia;
  /** Percentual, ex.: 19 para 19%. */
  aliquota: number;

  /**
   * Regimes em que este tributo incide.
   *
   * E o que permite o cadastro de produto se preencher sozinho: escolhido o
   * influencer, o painel sabe o regime dele e marca os impostos deste conjunto.
   * PIS cumulativo de 0,65% so existe no Presumido; no Simples ele esta dentro
   * da guia unica. Lista vazia = nunca incide automaticamente.
   */
  regimes: RegimeTributario[];

  /**
   * Percentual de presuncao do lucro, para tributos com `baseIncidencia`
   * igual a `lucro`. No Lucro Presumido a industria presume 8% para IRPJ e
   * 12% para CSLL. `null` quando a base e a receita.
   */
  percentualPresuncao: number | null;

  /**
   * Valor deduzido da base ANTES de aplicar a aliquota, por mes.
   *
   * Existe por causa do adicional de IRPJ: 10% sobre o que exceder R$ 20 mil
   * mensais da base presumida. Sem isso, o adicional seria cobrado desde o
   * primeiro real.
   */
  deducaoMensal: number | null;

  /**
   * `true` quando o tributo ja esta embutido na guia unica do Simples.
   *
   * Serve para o painel nao cobrar duas vezes: o DAS entra como um valor so, e
   * os tributos que o compoem aparecem apenas no detalhamento, sem somar.
   */
  dentroDoDAS: boolean;

  /**
   * `true` quando o tributo so incide sobre produtos especificos.
   *
   * ICMS-ST e IPI dependem do NCM; o DAS incide sobre tudo. Quando `true`, o
   * imposto so entra no calculo dos produtos que o marcaram no cadastro.
   */
  aplicacaoPorProduto: boolean;

  ativo: boolean;

  /**
   * Comeca `false`. Enquanto for `false`, a tela mostra o aviso de que a
   * aliquota ainda nao passou pelo contador.
   */
  confirmadoPeloContador: boolean;

  observacao: string | null;
  atualizadoEm: string;
}

export type EntradaImposto = Omit<Imposto, "id" | "atualizadoEm">;

/** Configuracao fiscal da empresa. Uma so, global. */
export interface ConfiguracaoFiscal {
  regime: RegimeTributario;
  anexoSimples: AnexoSimples;
  /** UF da empresa. Muda aliquota interna de ICMS e beneficios estaduais. */
  uf: string;
  /**
   * Receita bruta dos ultimos 12 meses, informada manualmente.
   * `null` = o painel calcula a partir do historico de pedidos.
   */
  rbt12Manual: number | null;
  atualizadoEm: string;
}

// ---------------------------------------------------------------------------
// Simples Nacional -- Anexo II (Industria)
// ---------------------------------------------------------------------------

export interface FaixaSimples {
  faixa: number;
  /** Limite superior de RBT12 da faixa, em reais. */
  ate: number;
  /** Aliquota nominal da faixa, em percentual. */
  nominal: number;
  /** Parcela a deduzir, em reais. */
  deduzir: number;
  /** Reparticao dos tributos dentro do DAS, em percentual da guia. */
  reparticao: {
    IRPJ: number;
    CSLL: number;
    COFINS: number;
    PIS: number;
    CPP: number;
    IPI: number;
    ICMS: number;
  };
}

/**
 * Tabela do Anexo II do Simples Nacional (industria).
 *
 * Fonte: Lei Complementar 123/2006, com a redacao da LC 155/2016.
 * CONFIRME com o contador antes de usar em apuracao -- a tabela e estavel ha
 * anos, mas o enquadramento no anexo e a segregacao de receitas nao sao.
 */
export const ANEXO_II_SIMPLES: FaixaSimples[] = [
  {
    faixa: 1,
    ate: 180_000,
    nominal: 4.5,
    deduzir: 0,
    reparticao: { IRPJ: 5.5, CSLL: 3.5, COFINS: 11.51, PIS: 2.49, CPP: 37.5, IPI: 7.5, ICMS: 32 },
  },
  {
    faixa: 2,
    ate: 360_000,
    nominal: 7.8,
    deduzir: 5_940,
    reparticao: { IRPJ: 5.5, CSLL: 3.5, COFINS: 11.51, PIS: 2.49, CPP: 37.5, IPI: 7.5, ICMS: 32 },
  },
  {
    faixa: 3,
    ate: 720_000,
    nominal: 10,
    deduzir: 13_860,
    reparticao: { IRPJ: 5.5, CSLL: 3.5, COFINS: 11.51, PIS: 2.49, CPP: 37.5, IPI: 7.5, ICMS: 32 },
  },
  {
    faixa: 4,
    ate: 1_800_000,
    nominal: 11.2,
    deduzir: 22_500,
    reparticao: { IRPJ: 5.5, CSLL: 3.5, COFINS: 11.51, PIS: 2.49, CPP: 37.5, IPI: 7.5, ICMS: 32 },
  },
  {
    faixa: 5,
    ate: 3_600_000,
    nominal: 14.7,
    deduzir: 85_500,
    reparticao: { IRPJ: 5.5, CSLL: 3.5, COFINS: 11.51, PIS: 2.49, CPP: 37.5, IPI: 7.5, ICMS: 32 },
  },
  {
    faixa: 6,
    ate: 4_800_000,
    nominal: 30,
    deduzir: 720_000,
    // Na 6a faixa o ICMS sai do DAS e o IPI concentra a maior fatia.
    reparticao: { IRPJ: 8.5, CSLL: 7.5, COFINS: 20.96, PIS: 4.54, CPP: 23.5, IPI: 35, ICMS: 0 },
  },
];

/** Teto anual de receita bruta do Simples Nacional. */
export const TETO_SIMPLES_NACIONAL = 4_800_000;

/**
 * Sublimite estadual para ICMS/ISS dentro do Simples.
 *
 * Acima disso a empresa continua no Simples para os tributos federais, mas
 * recolhe ICMS por fora. E o primeiro alerta que aparece quando a empresa
 * cresce -- por isso o painel monitora os dois limites.
 */
export const SUBLIMITE_ICMS_SIMPLES = 3_600_000;
