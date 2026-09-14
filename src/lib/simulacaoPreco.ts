/**
 * Simulador de preco de produto. Funcoes PURAS.
 *
 * A pergunta: "se eu fabricar por X e vender por Y, ganho ou perco dinheiro?"
 *
 * Nenhuma aliquota e inventada aqui. Impostos, DIFAL e taxa sao a MEDIA do mes
 * da marca do influencer escolhido, medida com as mesmas funcoes do painel e
 * expressa como fracao da RECEITA SEM FRETE, a mesma base dos impostos. Assim o
 * simulador nao tem uma segunda versao das regras: se o painel mudar a conta, a
 * simulacao muda junto.
 *
 * A prova esta no teste: simular o preco e o custo MEDIOS de uma marca
 * reproduz o lucro operacional da DRE dela, a menos exatamente da comissao e
 * das despesas que incidem sobre pedidos nao pagos (ver escolha 1).
 *
 * Tres escolhas que mudam o resultado:
 *
 * 1. A comissao e o PERCENTUAL DO CONTRATO SOBRE O PRECO -- numa venda paga, o
 *    preco e o faturamento bruto dela. Decisao do cliente: a primeira versao
 *    usava o custo medio do contrato por venda paga (30% sobre o bruto saia
 *    ~39%, porque o contrato tambem paga pedido que nunca entrou), e ele pediu
 *    o percentual sobre o faturamento bruto. As despesas com influencer seguem
 *    a mesma regra: fracao do faturamento bruto do mes. Consequencia assumida:
 *    a simulacao sai mais otimista que a DRE na medida da comissao paga sobre
 *    pedido nao pago, e o teste mede essa diferenca em vez de esconde-la.
 *
 * 2. O frete NAO e custo: e cobrado do cliente POR FORA (produto de R$ 100 +
 *    R$ 19 de frete = R$ 119 pagos) e repassado a transportadora. Nao entra em
 *    imposto nem comissao. So duas coisas incidem sobre o valor pago COM frete,
 *    porque sao cobradas sobre o que entra: a taxa do meio de pagamento e a
 *    participacao dos socios. O frete e por unidade (frete medio por pedido ÷
 *    unidades por pedido, ~2 na base).
 *
 * 3. O DIFAL e a media ponderada dos destinos da marca, incluindo as vendas
 *    dentro do proprio estado (que nao pagam). Marca no Simples nao recolhe
 *    DIFAL como remetente (secao 5.10.1), e aqui ele sai zero pelo mesmo motivo.
 */

import { despesasQueCabem } from "@/lib/costing";
import { PERCENTUAL_PARTICIPACAO_SOCIOS } from "@/lib/config";
import { razaoSegura } from "@/lib/format";
import type { ResultadoImpostos } from "@/lib/impostos";
import { pedidosRecebidos, reconciliar } from "@/lib/metrics";
import { apurarTaxasPlataforma } from "@/lib/plataforma";
import type { BaseComissao, DespesaInfluencer, Influencer } from "@/types/dominio";
import type { RegimeTributario } from "@/types/fiscal";
import type { Pedido } from "@/types/nuvemshop";
import type { TaxaPlataforma } from "@/types/plataforma";

/** Medias de custo de uma marca num mes, prontas para simular. */
export interface PerfilDeCusto {
  influencerId: string;
  nome: string;
  marca: string;
  regime: RegimeTributario;
  percentualContrato: number;
  baseComissao: BaseComissao;

  /** De onde as medias sairam. */
  pedidosPagos: number;
  unidadesPagas: number;

  /** Impostos do regime SEM o DIFAL, como fracao da receita sem frete. */
  cargaImpostos: number;
  /** DIFAL medio, como fracao da receita sem frete. Zero no Simples. */
  cargaDifal: number;
  /** `false` no Simples: nao recolhe DIFAL como remetente. */
  recolheDifal: boolean;
  /** Fracao da receita que foi para outro estado. */
  fracaoInterestadual: number;
  /** Taxa da plataforma e do meio de pagamento, fracao do valor pago (com frete). */
  cargaTaxas: number;
  /** Percentual do contrato como fracao, aplicado direto sobre o preco. */
  cargaComissao: number;
  /** Despesas cadastradas do influencer no mes, como fracao do faturamento sem frete. */
  cargaDespesas: number;
  /** Participacao dos socios, fracao do valor pago (com frete). */
  cargaSocios: number;

  fretePorPedido: number;
  unidadesPorPedido: number;
  /** fretePorPedido / unidadesPorPedido */
  fretePorUnidade: number;

  /** Alguma aliquota usada ainda nao passou pelo contador. */
  impostosNaoConfirmados: boolean;
  /** Alguma taxa usada ainda nao foi conferida na fatura. */
  taxasNaoConfirmadas: boolean;
}

export interface EntradaPerfis {
  pedidosDoMes: Pedido[];
  influencers: Influencer[];
  /** `apurarImpostos` sobre os mesmos pedidos do mes. */
  impostos: ResultadoImpostos;
  taxas: TaxaPlataforma[];
  /** Todas as despesas cadastradas; aqui ficam so as que cabem no mes. */
  despesas: DespesaInfluencer[];
}

/**
 * Um perfil por influencer ATIVO cuja marca teve venda paga no mes.
 *
 * Influencer inativo nao entra em calculo nenhum (secao 5.9), e marca sem venda
 * paga nao tem media para dar -- a tela diz quem ficou de fora em vez de
 * simular com zero, que diria que vender ali nao custa nada.
 */
export function montarPerfisDeCusto(entrada: EntradaPerfis): PerfilDeCusto[] {
  const { pedidosDoMes, influencers, impostos, taxas, despesas } = entrada;
  const perfis: PerfilDeCusto[] = [];

  for (const influencer of influencers) {
    if (!influencer.ativo) continue;

    const pedidos = pedidosDoMes.filter((p) => p.marca === influencer.marca);
    const reconciliacao = reconciliar(pedidos);
    const recebido = reconciliacao.recebido;
    if (recebido <= 0) continue;

    const pagos = pedidosRecebidos(pedidos);
    const unidades = pagos.reduce(
      (soma, p) => soma + p.products.reduce((s, item) => s + item.quantity, 0),
      0,
    );

    // A apuracao ja e por marca; o regime dela e o do influencer que manda na
    // marca (o primeiro ativo), que e o que o painel usa em toda parte.
    const apuracao = impostos.porInfluencer.find((a) => a.marca === influencer.marca) ?? null;
    const totalImpostos = apuracao?.total ?? 0;
    const difal = apuracao?.difal ?? null;
    const regime = apuracao?.regime ?? influencer.regime;

    const taxasDaMarca = apurarTaxasPlataforma(pedidos, taxas);

    // As despesas que a DRE tira do lucro desta marca.
    const despesasDoMes = despesasQueCabem(despesas, pedidos, influencers).reduce(
      (soma, d) => soma + d.valor,
      0,
    );

    const fretePorPedido = razaoSegura(reconciliacao.frete, pagos.length);
    const unidadesPorPedido = razaoSegura(unidades, pagos.length);

    perfis.push({
      influencerId: influencer.id,
      nome: influencer.nome,
      marca: influencer.marca,
      regime,
      percentualContrato: influencer.percentual,
      baseComissao: influencer.baseComissao,
      pedidosPagos: pagos.length,
      unidadesPagas: unidades,
      cargaImpostos: razaoSegura(totalImpostos - (difal?.total ?? 0), reconciliacao.receitaReal),
      cargaDifal: razaoSegura(difal?.total ?? 0, reconciliacao.receitaReal),
      recolheDifal: regime !== "simples_nacional",
      fracaoInterestadual: difal
        ? razaoSegura(
            difal.baseInterestadual,
            difal.baseInterestadual + difal.baseInterna + difal.receitaSemEstado,
          )
        : 0,
      cargaTaxas: razaoSegura(taxasDaMarca.total, recebido),
      // Percentual escrito, sobre o faturamento bruto da venda (escolha 1).
      cargaComissao: influencer.percentual / 100,
      cargaDespesas: razaoSegura(despesasDoMes, reconciliacao.brutoSemFrete),
      cargaSocios: PERCENTUAL_PARTICIPACAO_SOCIOS / 100,
      fretePorPedido,
      unidadesPorPedido,
      fretePorUnidade: razaoSegura(reconciliacao.frete, unidades),
      impostosNaoConfirmados: apuracao?.linhas.some((l) => !l.confirmado) ?? false,
      taxasNaoConfirmadas: taxasDaMarca.temTaxaNaoConfirmada,
    });
  }

  return perfis;
}

export interface ResultadoSimulacao {
  preco: number;
  custoFabricacao: number;

  impostos: number;
  difal: number;
  taxas: number;
  /** Frete medio por unidade, pago pelo cliente POR FORA. Informativo: nao e custo. */
  frete: number;
  comissao: number;
  despesas: number;
  socios: number;

  /** Tudo que sai do preco, fabricacao incluida. */
  totalCustos: number;
  /** preco - totalCustos. Negativo e prejuizo. */
  lucro: number;
  /** lucro / preco */
  margem: number;
  /** Soma das cargas proporcionais ao preco (impostos, DIFAL, taxa, comissao, despesas). */
  cargaProporcional: number;
  /**
   * Menor preco que nao da prejuizo, com este custo de fabricacao.
   *
   * `null` quando as cargas proporcionais somam 100% ou mais: ai cada real a
   * mais no preco leva um real ou mais de custo junto, e preco nenhum empata.
   */
  precoMinimo: number | null;
}

/** Uma unidade vendida e paga, por `preco`, fabricada por `custoFabricacao`. */
export function simularPreco(
  perfil: PerfilDeCusto,
  custoFabricacao: number,
  preco: number,
): ResultadoSimulacao {
  const impostos = preco * perfil.cargaImpostos;
  const difal = preco * perfil.cargaDifal;
  // Taxa e socios incidem sobre o que o cliente paga, frete incluido.
  const pago = preco + perfil.fretePorUnidade;
  const taxas = pago * perfil.cargaTaxas;
  const comissao = preco * perfil.cargaComissao;
  const despesas = preco * perfil.cargaDespesas;
  const socios = pago * perfil.cargaSocios;
  const frete = perfil.fretePorUnidade;

  const cargaProporcional = cargaProporcionalDo(perfil);

  // O frete nao esta aqui: o cliente paga e a transportadora recebe.
  const totalCustos = impostos + difal + taxas + comissao + despesas + socios + custoFabricacao;
  const lucro = preco - totalCustos;

  return {
    preco,
    custoFabricacao,
    impostos,
    difal,
    taxas,
    frete,
    comissao,
    despesas,
    socios,
    totalCustos,
    lucro,
    margem: razaoSegura(lucro, preco),
    cargaProporcional,
    precoMinimo: precoParaMargem(perfil, custoFabricacao, 0),
  };
}

/** Tudo que sai do preco em proporcao a ele: impostos, DIFAL, taxa, comissao, despesas, socios. */
export function cargaProporcionalDo(perfil: PerfilDeCusto): number {
  return (
    perfil.cargaImpostos +
    perfil.cargaDifal +
    perfil.cargaTaxas +
    perfil.cargaComissao +
    perfil.cargaDespesas +
    perfil.cargaSocios
  );
}

// ---------------------------------------------------------------------------
// Sugestao de preco
// ---------------------------------------------------------------------------

export interface MargemDeReferencia {
  chave: "minima" | "recomendada" | "forte";
  rotulo: string;
  /** Fracao do preco: 0.15 = 15% de margem operacional por unidade. */
  margem: number;
  explicacao: string;
}

/**
 * Margens operacionais de referencia para sugerir preco.
 *
 * ORDEM DE GRANDEZA, nao estudo de mercado: empresas de cosmeticos saudaveis
 * costumam operar entre ~10% e ~20% de margem operacional. As tres faixas saem
 * dai. Mesmo espirito do ICMS semeado em 10% (secao 5.10): ponto de partida
 * declarado na tela, com um campo ao lado para testar outra margem.
 *
 * A margem e a mesma que o resultado da simulacao mostra: lucro por unidade
 * sobre o PRECO, depois de imposto, DIFAL, taxa, frete, comissao, despesas e
 * fabricacao. Moram aqui, e nao no componente, para o teste e a tela lerem os
 * mesmos numeros.
 */
export const MARGENS_DE_REFERENCIA: readonly MargemDeReferencia[] = [
  {
    chave: "minima",
    rotulo: "Mínima saudável",
    margem: 0.1,
    explicacao: "Cobre os custos com folga pequena: um desconto ou uma alta de custo já vira prejuízo.",
  },
  {
    chave: "recomendada",
    rotulo: "Recomendada",
    margem: 0.15,
    explicacao: "Margem típica de uma operação de cosméticos saudável.",
  },
  {
    chave: "forte",
    rotulo: "Forte",
    margem: 0.2,
    explicacao: "Patamar das marcas mais rentáveis do setor: sobra espaço para promoção e reinvestimento.",
  },
];

/**
 * Preco que entrega `margem` de lucro sobre o proprio preco.
 *
 *   lucro = P × (1 − cargas) − frete − fabricacao = margem × P
 *   P     = (fabricacao + frete) ÷ (1 − cargas − margem)
 *
 * Com margem 0 e o preco minimo. `null` quando cargas + margem chegam a 100%:
 * cada real a mais no preco ja leva um real ou mais de custo, e preco nenhum
 * entrega aquela margem.
 */
export function precoParaMargem(
  perfil: PerfilDeCusto,
  custoFabricacao: number,
  margem: number,
): number | null {
  const denominador = 1 - cargaProporcionalDo(perfil) - margem;
  if (denominador <= 0) return null;
  // O frete so pesa pela taxa e pelos socios, que incidem sobre o valor pago.
  const fixo =
    custoFabricacao + perfil.fretePorUnidade * (perfil.cargaTaxas + perfil.cargaSocios);
  return fixo / denominador;
}

/**
 * Arredonda PARA CIMA ate o proximo preco terminado em ,90
 * (R$ 152,14 -> R$ 152,90; R$ 152,95 -> R$ 153,90).
 *
 * Para cima de proposito: para baixo entregaria margem menor que a sugerida.
 * A conta e em centavos inteiros para 152,90 nao virar 152,8999 e subir um
 * real sem motivo.
 */
export function precoComercial(preco: number): number {
  const centavos = Math.ceil(Math.round(preco * 1e6) / 1e4);
  const reais = Math.ceil((centavos - 90) / 100);
  return (reais * 100 + 90) / 100;
}
