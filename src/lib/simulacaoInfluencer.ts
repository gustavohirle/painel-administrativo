/**
 * Estimativa de um contrato de influencer. Funcoes PURAS.
 *
 * A pergunta: "se eu fechar com um influencer a X% de comissao e ele faturar Y
 * por mes, sobra dinheiro?" O influencer ainda nao existe, entao nao ha pedido
 * dele para apurar. O que existe sao as marcas atuais -- e delas sai tudo:
 *
 *   faturamento bruto sem frete            (informado)
 *   - nao pago, cancelado, reembolsado     (fracao media das marcas atuais)
 *   = receita real                         (o frete e cobrado do cliente por
 *                                           fora e nao entra em nada abaixo,
 *                                           exceto taxa e socios)
 *   - impostos e DIFAL                     (pelo regime -- ver abaixo)
 *   - taxa da plataforma                   (fracao media do recebido)
 *   - custo de fabricacao                  (fracao media da receita real)
 *   - comissao                             (informada, sobre o que cai na
 *                                           conta: receita real - taxa)
 *   - parte nas despesas compartilhadas    (proporcional ao bruto)
 *   - participacao dos socios              (percentual fixo do recebido)
 *   = lucro operacional estimado
 *
 * E a mesma cadeia da DRE (secao 5.8), com fracoes medias no lugar dos pedidos.
 * O teste prova isso: montada a referencia com uma marca so e estimado o
 * faturamento dela, a conta devolve o lucro da DRE daquela marca.
 *
 * Tres escolhas que mudam o resultado:
 *
 * 1. SIMPLES e calculado, PRESUMIDO e media. No Simples a aliquota muda muito
 *    com o porte (de ~4,5% a mais de 11% no Anexo II): usar a media das marcas
 *    atuais daria a um influencer pequeno o imposto de uma marca de R$ 2,7 mi
 *    por ano. Por isso a guia sai de `apurarSimples`, com o RBT12 projetado do
 *    faturamento informado. No Presumido a carga quase nao depende do porte
 *    (so o adicional de IRPJ, que e pequeno), e a media das marcas do regime
 *    serve.
 *
 * 2. O custo de fabricacao e EXTRAPOLADO pela cobertura. Produto sem ficha de
 *    custo entra como zero no CMV das marcas atuais; aplicar essa fracao a um
 *    influencer novo daria custo menor que o real. A fracao vem de
 *    `cmv / cobertura`, e a tela diz quanto da receita tinha ficha.
 *
 * 3. As despesas COMPARTILHADAS (o operacional) sao divididas com o novo
 *    influencer entrando na conta: parte = total x bruto / (bruto atual + bruto
 *    dele). E o que `ratearDespesas` faria no mes em que ele comecasse a vender.
 */

import { calcularCMV, montarDemonstrativo, ratearDespesas } from "@/lib/costing";
import { PERCENTUAL_PARTICIPACAO_SOCIOS } from "@/lib/config";
import { razaoSegura } from "@/lib/format";
import type { ResultadoImpostos } from "@/lib/impostos";
import { reconciliar } from "@/lib/metrics";
import { apurarTaxasPlataforma } from "@/lib/plataforma";
import { apurarSimples } from "@/lib/simplesNacional";
import {
  mesDaDespesa,
  type CustoProduto,
  type DespesaInfluencer,
  type Influencer,
} from "@/types/dominio";
import { TETO_SIMPLES_NACIONAL } from "@/types/fiscal";
import type { Pedido } from "@/types/nuvemshop";
import type { TaxaPlataforma } from "@/types/plataforma";
import type { Produto } from "@/types/produto";

export type RegimeSimulado = "simples_nacional" | "lucro_presumido";

interface CargaDoRegime {
  /** Impostos SEM o DIFAL, como fracao da receita sem frete. */
  cargaImpostos: number;
  /** DIFAL, como fracao da receita sem frete. */
  cargaDifal: number;
  marcas: number;
}

/** O que as marcas atuais ensinam sobre custo, num mes. */
export interface ReferenciaInfluencers {
  mes: string;
  marcas: number;
  influencersAtivos: number;

  /** Faturamento bruto SEM FRETE das marcas atuais no mes. */
  brutoTotal: number;
  /** receita real / faturamento sem frete: quanto do faturado vira receita */
  fracaoReceitaReal: number;
  /** frete cobrado / receita real: o frete que o cliente paga por fora */
  fracaoFrete: number;
  /** taxa da plataforma / recebido (valor pago, com frete) */
  cargaTaxas: number;
  /** CMV extrapolado pela cobertura / receita real */
  cmvSobreReceitaReal: number;
  /** Fracao da receita de itens que tinha ficha de custo. */
  coberturaCusto: number;

  /** Marcas fora do Simples. `null` se nao houver nenhuma. */
  presumido: CargaDoRegime | null;
  /** Marcas no Simples, so para leitura. `null` se nao houver nenhuma. */
  simples: CargaDoRegime | null;
  /** Carga total de impostos da empresa, fracao da receita sem frete. Plano B. */
  cargaGeral: number;

  /** Soma das despesas compartilhadas cadastradas no mes. */
  despesasCompartilhadas: number;
  /** Margem operacional atual da operacao inteira (lucro / receita real). */
  margemAtual: number;

  impostosNaoConfirmados: boolean;
  taxasNaoConfirmadas: boolean;
}

export interface EntradaReferencia {
  /** "aaaa-mm" */
  mes: string;
  pedidosDoMes: Pedido[];
  /** Base inteira: as despesas compartilhadas se dividem sobre ela. */
  todosOsPedidos: Pedido[];
  influencers: Influencer[];
  custos: CustoProduto[];
  produtos: Produto[];
  /** `apurarImpostos` sobre os mesmos pedidos do mes. */
  impostos: ResultadoImpostos;
  taxas: TaxaPlataforma[];
  /** Despesas como estao cadastradas, sem dividir. */
  despesas: DespesaInfluencer[];
}

/** `null` quando o mes nao tem venda paga: sem venda, nao ha media. */
export function montarReferencia(entrada: EntradaReferencia): ReferenciaInfluencers | null {
  const { mes, pedidosDoMes, todosOsPedidos, influencers, custos, produtos, impostos } = entrada;

  const r = reconciliar(pedidosDoMes);
  if (r.recebido <= 0) return null;

  const taxas = apurarTaxasPlataforma(pedidosDoMes, entrada.taxas);
  const cmv = calcularCMV(pedidosDoMes, custos, produtos);
  const cmvEstimado = cmv.cobertura > 0 ? cmv.cmv / cmv.cobertura : 0;

  const cargaDo = (noSimples: boolean): CargaDoRegime | null => {
    const apuracoes = impostos.porInfluencer.filter(
      (a) => (a.regime === "simples_nacional") === noSimples,
    );
    const base = apuracoes.reduce((s, a) => s + a.baseReceita, 0);
    if (base <= 0) return null;
    const total = apuracoes.reduce((s, a) => s + a.total, 0);
    const difal = apuracoes.reduce((s, a) => s + a.difal.total, 0);
    return {
      cargaImpostos: razaoSegura(total - difal, base),
      cargaDifal: razaoSegura(difal, base),
      marcas: apuracoes.length,
    };
  };

  const despesasCompartilhadas = entrada.despesas
    .filter((d) => d.influencerId === null && mesDaDespesa(d) === mes)
    .reduce((s, d) => s + d.valor, 0);

  const dre = montarDemonstrativo(pedidosDoMes, custos, influencers, {
    produtos,
    impostos,
    taxasPlataforma: taxas,
    despesasInfluencers: ratearDespesas(entrada.despesas, todosOsPedidos, influencers),
  });

  return {
    mes,
    marcas: new Set(pedidosDoMes.map((p) => p.marca)).size,
    influencersAtivos: influencers.filter((i) => i.ativo).length,
    brutoTotal: r.brutoSemFrete,
    fracaoReceitaReal: razaoSegura(r.receitaReal, r.brutoSemFrete),
    fracaoFrete: razaoSegura(r.frete, r.receitaReal),
    cargaTaxas: razaoSegura(taxas.total, r.recebido),
    cmvSobreReceitaReal: razaoSegura(cmvEstimado, r.receitaReal),
    coberturaCusto: cmv.cobertura,
    presumido: cargaDo(false),
    simples: cargaDo(true),
    cargaGeral: impostos.cargaSobreReceita,
    despesasCompartilhadas,
    margemAtual: dre.margemOperacionalPercentual,
    impostosNaoConfirmados: impostos.temImpostoNaoConfirmado,
    taxasNaoConfirmadas: taxas.temTaxaNaoConfirmada,
  };
}

/**
 * Regime que o porte sugere: cabe no teto do Simples (R$ 4,8 mi de receita,
 * sem frete, em 12 meses) ou nao. E so a sugestao inicial -- a tela deixa escolher.
 */
export function regimeSugerido(
  referencia: ReferenciaInfluencers,
  faturamentoMensal: number,
): RegimeSimulado {
  const rbt12 = faturamentoMensal * referencia.fracaoReceitaReal * 12;
  return rbt12 <= TETO_SIMPLES_NACIONAL ? "simples_nacional" : "lucro_presumido";
}

export interface EntradaEstimativa {
  /**
   * Percentual sobre o que cai na conta, sem frete (receita real - taxas): 25 = 25%.
   * E a regra que o cliente pratica (`BASE_PADRAO_CONTRATO`).
   */
  percentual: number;
  /** Faturamento bruto esperado por mes, SEM frete, em reais. */
  faturamento: number;
  regime: RegimeSimulado;
}

export interface EstimativaInfluencer {
  regime: RegimeSimulado;
  percentual: number;

  bruto: number;
  /** Nao pago + cancelado + reembolsado. */
  naoEntrou: number;
  recebido: number;
  frete: number;
  receitaReal: number;

  impostos: number;
  /** impostos / receita real */
  aliquotaImpostos: number;
  difal: number;
  taxas: number;
  cmv: number;
  /** Sobre o que a comissao incide: receita real - taxas. */
  baseComissao: number;
  comissao: number;
  parteCompartilhada: number;
  /** Participacao dos socios sobre o recebido. */
  socios: number;
  percentualSocios: number;

  lucro: number;
  /** lucro / receita real, como a margem operacional da DRE. */
  margem: number;
  lucroAnual: number;
  /**
   * Maior percentual de comissao, na mesma base, que ainda nao da prejuizo.
   * `null` quando nem sem comissao sobra dinheiro.
   */
  comissaoMaximaSemPrejuizo: number | null;

  /** RBT12 projetado do faturamento informado. */
  rbt12Projetado: number;
  /** Escolheu Simples com porte acima do teto. */
  acimaDoTetoSimples: boolean;
  /** Presumido sem nenhuma marca atual no regime: usou a carga geral. */
  semReferenciaDoRegime: boolean;
}

export function estimarInfluencer(
  referencia: ReferenciaInfluencers,
  entrada: EntradaEstimativa,
): EstimativaInfluencer {
  const bruto = entrada.faturamento;
  const receitaReal = bruto * referencia.fracaoReceitaReal;
  // O frete e cobrado do cliente POR FORA: soma no que ele paga, nao na receita.
  const frete = receitaReal * referencia.fracaoFrete;
  const recebido = receitaReal + frete;
  // O imposto incide sobre o RECEBIDO, com frete (5.1.1): e essa a base do
  // RBT12 e da guia, desde 18/09/2026.
  const rbt12Projetado = recebido * 12;

  let impostos: number;
  let difal = 0;
  let semReferenciaDoRegime = false;

  if (entrada.regime === "simples_nacional") {
    // Simples nao recolhe DIFAL como remetente (secao 5.10.1).
    impostos = apurarSimples(rbt12Projetado, recebido).valorDAS;
  } else if (referencia.presumido) {
    impostos = recebido * referencia.presumido.cargaImpostos;
    difal = recebido * referencia.presumido.cargaDifal;
  } else {
    impostos = recebido * referencia.cargaGeral;
    semReferenciaDoRegime = true;
  }

  const taxas = recebido * referencia.cargaTaxas;
  const cmv = receitaReal * referencia.cmvSobreReceitaReal;
  // O que cai na conta, sem o frete: e sobre isso que o influencer recebe.
  const baseComissao = receitaReal - taxas;
  const comissao = baseComissao * (entrada.percentual / 100);
  const parteCompartilhada =
    referencia.despesasCompartilhadas * razaoSegura(bruto, referencia.brutoTotal + bruto);

  const socios = recebido * (PERCENTUAL_PARTICIPACAO_SOCIOS / 100);

  const lucro =
    receitaReal - impostos - difal - taxas - cmv - comissao - parteCompartilhada - socios;
  const lucroSemComissao = lucro + comissao;

  return {
    regime: entrada.regime,
    percentual: entrada.percentual,
    bruto,
    naoEntrou: bruto - receitaReal,
    recebido,
    frete,
    receitaReal,
    impostos,
    aliquotaImpostos: razaoSegura(impostos, receitaReal),
    difal,
    taxas,
    cmv,
    baseComissao,
    comissao,
    parteCompartilhada,
    socios,
    percentualSocios: PERCENTUAL_PARTICIPACAO_SOCIOS,
    lucro,
    margem: razaoSegura(lucro, receitaReal),
    lucroAnual: lucro * 12,
    comissaoMaximaSemPrejuizo:
      lucroSemComissao > 0 && baseComissao > 0
        ? (lucroSemComissao / baseComissao) * 100
        : null,
    rbt12Projetado,
    acimaDoTetoSimples:
      entrada.regime === "simples_nacional" && rbt12Projetado > TETO_SIMPLES_NACIONAL,
    semReferenciaDoRegime,
  };
}
