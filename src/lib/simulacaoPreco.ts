/**
 * Simulador de preco de produto. Funcoes PURAS.
 *
 * A pergunta: "se eu fabricar por X e vender por Y, ganho ou perco dinheiro?"
 *
 * Nenhuma aliquota e inventada aqui. Impostos, DIFAL e taxa sao a MEDIA do mes
 * da marca do influencer escolhido, medida com as mesmas funcoes do painel e
 * expressa como fracao do VALOR PAGO, com frete -- a mesma base dos tributos
 * desde 18/09/2026 (5.1.1). Assim o simulador nao tem uma segunda versao das
 * regras: se o painel mudar a conta, a simulacao muda junto.
 *
 * A prova esta no teste: simular o preco e o custo MEDIOS de uma marca
 * reproduz o lucro operacional da DRE dela, a menos exatamente da comissao e
 * das despesas que incidem sobre pedidos nao pagos (ver escolha 1).
 *
 * Tres escolhas que mudam o resultado:
 *
 * 1. A comissao e o PERCENTUAL DO CONTRATO SOBRE A VENDA. Decisao do cliente:
 *    a primeira versao usava o custo medio do contrato por venda paga (30%
 *    sobre o bruto saia ~39%, porque o contrato tambem paga pedido que nunca
 *    entrou), e ele pediu o percentual escrito. Numa venda paga, "bruto",
 *    "recebido" e "receita real" valem o PRECO; "o que cai na conta" (a regra
 *    praticada desde 16/09/2026) vale o preco menos a taxa do pagamento, que
 *    incide sobre o valor pago com frete. As despesas com influencer sao
 *    fracao do faturamento sem frete do mes. Consequencia assumida: com
 *    contrato sobre o bruto, a simulacao sai mais otimista que a DRE na medida
 *    da comissao paga sobre pedido nao pago, e o teste mede essa diferenca.
 *
 * 2. O frete NAO e custo da loja: e cobrado do cliente POR FORA (produto de
 *    R$ 100 + R$ 19 de frete = R$ 119 pagos) e repassado a transportadora.
 *    Mas ele e BASE: imposto, DIFAL, taxa do meio de pagamento e participacao
 *    dos socios incidem sobre o valor pago com frete, porque sao cobrados
 *    sobre o que entra. Fora da base dele fica so a COMISSAO do influencer,
 *    que segue sobre o que cai na conta sem frete (5.1.2). Cada real de frete,
 *    portanto, tira um pedaco do lucro -- e sobe o preco minimo. O frete e por
 *    unidade (frete medio por pedido ÷ unidades por pedido, ~2 na base).
 *
 * 3. O DIFAL e a media ponderada dos destinos da marca, incluindo as vendas
 *    dentro do proprio estado (que nao pagam). Marca no Simples nao recolhe
 *    DIFAL como remetente (secao 5.10.1), e aqui ele sai zero pelo mesmo motivo.
 *
 * 4. FRETE GRATIS e escolha da simulacao (25/09/2026, pedido do dono). No
 *    TikTok Shop a loja banca o frete de boa parte das vendas: o cliente paga
 *    so o produto, e o frete sai do repasse (`freteAbsorvido`, 5.1). Ai a
 *    escolha 2 se inverte -- o frete deixa de ser base (o cliente nao pagou
 *    frete nenhum) e vira CUSTO, e na comissao sobre o que cai na conta ele
 *    tambem sai da base. A diferenca e grande demais para caber numa media:
 *    por isso a tela pergunta, e as duas medias sao medidas separadas -- o que
 *    a loja pagou nas vendas com frete gratis e o que o cliente pagou nas
 *    outras.
 *
 *    **So no TikTok** (pedido do dono, no mesmo dia). A primeira versao ligava
 *    a opcao em qualquer marca com frete bancado no mes; numa loja Nuvemshop
 *    com uma promocao de frete gratis isso trocaria o frete medio de sempre
 *    pelo das vendas sem promocao, e mexeria num simulador que estava certo.
 *    O canal e a condicao, e nao o dado: `ehPedidoDoTikTok`.
 */

import { despesasQueCabem } from "@/lib/costing";
import { PERCENTUAL_PARTICIPACAO_SOCIOS } from "@/lib/config";
import { razaoSegura } from "@/lib/format";
import type { ResultadoImpostos } from "@/lib/impostos";
import { pedidosRecebidos, reconciliar } from "@/lib/metrics";
import { ehPedidoDoTikTok, paraNumero } from "@/types/nuvemshop";
import { apurarTaxasPlataforma } from "@/lib/plataforma";
import type { BaseComissao, DespesaInfluencer, Influencer } from "@/types/dominio";
import type { RegimeTributario } from "@/types/fiscal";
import type { Pedido } from "@/types/nuvemshop";
import type { TaxaPlataforma } from "@/types/plataforma";

/** As duas medias de frete de uma marca que as vezes banca o frete. */
export interface FreteGratisDaMarca {
  /** Fracao das vendas pagas do mes que sairam com frete gratis. */
  fracaoDosPedidos: number;
  /** O que a loja pagou a transportadora, por unidade, nessas vendas. */
  custoPorUnidade: number;
  /** O frete que o CLIENTE pagou, por unidade, nas vendas sem frete gratis. */
  freteDoClientePorUnidade: number;
}

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

  /** Impostos do regime SEM o DIFAL, como fracao do valor PAGO (com frete). */
  cargaImpostos: number;
  /**
   * DIFAL medio, como fracao do valor PAGO (com frete). Zero no Simples.
   *
   * Mesma forma da taxa, e pelo mesmo motivo: desde 18/09/2026 a base do DIFAL
   * inclui o frete cobrado do cliente (5.10.1), entao cada real de frete
   * tambem carrega DIFAL -- e isso sobe um pouco o preco minimo.
   */
  cargaDifal: number;
  /** `false` no Simples: nao recolhe DIFAL como remetente. */
  recolheDifal: boolean;
  /** Fracao da receita que foi para outro estado. */
  fracaoInterestadual: number;
  /** Taxa da plataforma e do meio de pagamento, fracao do valor pago (com frete). */
  cargaTaxas: number;
  /** Percentual do contrato como fracao. */
  cargaComissao: number;
  /**
   * Parte do valor pago que a comissao NAO ve: a taxa, quando o contrato e
   * sobre o que cai na conta (igual a `cargaTaxas`); zero nas outras bases.
   */
  taxaForaDaComissao: number;
  /** Despesas cadastradas do influencer no mes, como fracao do faturamento sem frete. */
  cargaDespesas: number;
  /** Participacao dos socios, fracao do valor pago (com frete). */
  cargaSocios: number;

  fretePorPedido: number;
  unidadesPorPedido: number;
  /** fretePorPedido / unidadesPorPedido */
  fretePorUnidade: number;
  /**
   * Frete gratis na marca (escolha 4). So existe para marca do TikTok Shop com
   * alguma venda paga com frete gratis no mes; nas outras e `null`, e a tela
   * nem pergunta.
   */
  freteGratis: FreteGratisDaMarca | null;

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

    /*
     * Frete gratis e o pedido em que a loja pagou a transportadora ALEM do que
     * o cliente pagou -- a mesma regra de `freteAbsorvido` na reconciliacao.
     * As duas medias saem de grupos separados: misturadas, o frete gratis
     * sairia diluido nas vendas em que o cliente pagou, e vice-versa.
     */
    let pedidosGratis = 0;
    let unidadesGratis = 0;
    let pagoPelaLoja = 0;
    let unidadesCliente = 0;
    let pagoPeloCliente = 0;
    for (const pedido of pagos) {
      const unidadesDoPedido = pedido.products.reduce((s, item) => s + item.quantity, 0);
      const cobrado = paraNumero(pedido.shipping_cost_customer);
      const bancado = Math.max(0, paraNumero(pedido.shipping_cost_owner) - cobrado);
      if (bancado > 0) {
        pedidosGratis += 1;
        unidadesGratis += unidadesDoPedido;
        pagoPelaLoja += bancado;
      } else {
        unidadesCliente += unidadesDoPedido;
        pagoPeloCliente += cobrado;
      }
    }
    // So no TikTok (escolha 4): numa loja Nuvemshop o frete fica como sempre.
    const doTikTok = pagos.length > 0 && pagos.every(ehPedidoDoTikTok);
    const freteGratis: FreteGratisDaMarca | null =
      doTikTok && pedidosGratis > 0
        ? {
            fracaoDosPedidos: razaoSegura(pedidosGratis, pagos.length),
            custoPorUnidade: razaoSegura(pagoPelaLoja, unidadesGratis),
            freteDoClientePorUnidade: razaoSegura(pagoPeloCliente, unidadesCliente),
          }
        : null;

    perfis.push({
      influencerId: influencer.id,
      nome: influencer.nome,
      marca: influencer.marca,
      regime,
      percentualContrato: influencer.percentual,
      baseComissao: influencer.baseComissao,
      pedidosPagos: pagos.length,
      unidadesPagas: unidades,
      cargaImpostos: razaoSegura(totalImpostos - (difal?.total ?? 0), recebido),
      cargaDifal: razaoSegura(difal?.total ?? 0, recebido),
      recolheDifal: regime !== "simples_nacional",
      fracaoInterestadual: difal
        ? razaoSegura(
            difal.baseInterestadual,
            difal.baseInterestadual + difal.baseInterna + difal.baseSemEstado,
          )
        : 0,
      cargaTaxas: razaoSegura(taxasDaMarca.total, recebido),
      // Percentual escrito, sobre a venda (escolha 1).
      cargaComissao: influencer.percentual / 100,
      taxaForaDaComissao:
        influencer.baseComissao === "liquido" ? razaoSegura(taxasDaMarca.total, recebido) : 0,
      cargaDespesas: razaoSegura(despesasDoMes, reconciliacao.brutoSemFrete),
      cargaSocios: PERCENTUAL_PARTICIPACAO_SOCIOS / 100,
      fretePorPedido,
      unidadesPorPedido,
      fretePorUnidade: razaoSegura(reconciliacao.frete, unidades),
      freteGratis,
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
  /** O frete que a LOJA paga por unidade, com frete gratis. E custo. Zero sem ele. */
  freteDaLoja: number;
  /** Sobre quanto o percentual da comissao incidiu, por unidade. */
  baseDaComissao: number;
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

/**
 * Os dois fretes de uma venda: o que o CLIENTE paga por fora (base de imposto,
 * taxa e socios, nunca custo) e o que a LOJA paga com frete gratis (custo).
 *
 * `freteGratis` so vale para marca que teve frete gratis no mes; nas outras o
 * frete e o de sempre, e a opcao e ignorada.
 */
function fretesDaVenda(
  perfil: PerfilDeCusto,
  freteGratis: boolean,
): { doCliente: number; daLoja: number } {
  if (!perfil.freteGratis) return { doCliente: perfil.fretePorUnidade, daLoja: 0 };
  return freteGratis
    ? { doCliente: 0, daLoja: perfil.freteGratis.custoPorUnidade }
    : { doCliente: perfil.freteGratis.freteDoClientePorUnidade, daLoja: 0 };
}

/**
 * Quanto da comissao o frete bancado pela loja devolve: na base "o que cai na
 * conta" ele sai do repasse antes da comissao (5.1.2); nas outras, nao.
 */
const comissaoSobreFreteDaLoja = (perfil: PerfilDeCusto): number =>
  perfil.baseComissao === "liquido" ? perfil.cargaComissao : 0;

/**
 * Uma unidade vendida e paga, por `preco`, fabricada por `custoFabricacao`.
 * `freteGratis`: a loja paga o frete (escolha 4).
 */
export function simularPreco(
  perfil: PerfilDeCusto,
  custoFabricacao: number,
  preco: number,
  freteGratis = false,
): ResultadoSimulacao {
  const { doCliente, daLoja } = fretesDaVenda(perfil, freteGratis);

  // Imposto, DIFAL, taxa e socios incidem sobre o que o cliente paga, frete
  // incluido: desde 18/09/2026 o frete entra na base de todo tributo (5.1.1).
  // Com frete gratis o cliente nao pagou frete, e a base e so o preco.
  const pago = preco + doCliente;
  const impostos = pago * perfil.cargaImpostos;
  const difal = pago * perfil.cargaDifal;
  const taxas = pago * perfil.cargaTaxas;
  const baseDaComissao =
    preco - pago * perfil.taxaForaDaComissao - (perfil.baseComissao === "liquido" ? daLoja : 0);
  const comissao = baseDaComissao * perfil.cargaComissao;
  const despesas = preco * perfil.cargaDespesas;
  const socios = pago * perfil.cargaSocios;

  const cargaProporcional = cargaProporcionalDo(perfil);

  // O frete do cliente nao esta aqui: ele paga e a transportadora recebe. O da
  // loja esta, porque sai do bolso dela.
  const totalCustos =
    impostos + difal + taxas + comissao + despesas + socios + custoFabricacao + daLoja;
  const lucro = preco - totalCustos;

  return {
    preco,
    custoFabricacao,
    impostos,
    difal,
    taxas,
    frete: doCliente,
    freteDaLoja: daLoja,
    baseDaComissao,
    comissao,
    despesas,
    socios,
    totalCustos,
    lucro,
    margem: razaoSegura(lucro, preco),
    cargaProporcional,
    precoMinimo: precoParaMargem(perfil, custoFabricacao, 0, freteGratis),
  };
}

/** Tudo que sai do preco em proporcao a ele: impostos, DIFAL, taxa, comissao, despesas, socios. */
export function cargaProporcionalDo(perfil: PerfilDeCusto): number {
  return (
    perfil.cargaImpostos +
    perfil.cargaDifal +
    perfil.cargaTaxas +
    perfil.cargaComissao * (1 - perfil.taxaForaDaComissao) +
    perfil.cargaDespesas +
    perfil.cargaSocios
  );
}

/**
 * Quanto cada real de frete tira do lucro: imposto, DIFAL, taxa e socios
 * incidem sobre ele, e a comissao sobre o que cai na conta devolve a parte da
 * taxa que ela nao ve.
 */
function cargaSobreFrete(perfil: PerfilDeCusto): number {
  return (
    perfil.cargaImpostos +
    perfil.cargaTaxas +
    perfil.cargaDifal +
    perfil.cargaSocios -
    perfil.cargaComissao * perfil.taxaForaDaComissao
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
 *   lucro = P × (1 − cargas) − frete × cargaSobreFrete
 *           − freteDaLoja × (1 − comissao sobre ele) − fabricacao = margem × P
 *   P     = (fabricacao + frete × cargaSobreFrete + freteDaLoja × (1 − c))
 *           ÷ (1 − cargas − margem)
 *
 * Com frete gratis, `frete` (o do cliente) e zero e `freteDaLoja` entra
 * inteiro, menos a parte que a comissao sobre o que cai na conta devolve.
 *
 * Com margem 0 e o preco minimo. `null` quando cargas + margem chegam a 100%:
 * cada real a mais no preco ja leva um real ou mais de custo, e preco nenhum
 * entrega aquela margem.
 */
export function precoParaMargem(
  perfil: PerfilDeCusto,
  custoFabricacao: number,
  margem: number,
  freteGratis = false,
): number | null {
  const denominador = 1 - cargaProporcionalDo(perfil) - margem;
  if (denominador <= 0) return null;
  const { doCliente, daLoja } = fretesDaVenda(perfil, freteGratis);
  // O frete do cliente so pesa pelo que incide sobre o valor pago; o da loja
  // pesa inteiro, menos o que a comissao sobre o que cai na conta devolve.
  const fixo =
    custoFabricacao +
    doCliente * cargaSobreFrete(perfil) +
    daLoja * (1 - comissaoSobreFreteDaLoja(perfil));
  return fixo / denominador;
}

/**
 * De que mes saem as medias do simulador.
 *
 * O mes do cabecalho, a menos que ele seja o mes CORRENTE: ai, o anterior
 * (25/09/2026, pedido do dono). O mes aberto nao tem as despesas lancadas --
 * elas chegam da contabilidade depois que ele fecha --, e a despesa entraria
 * zerada, deixando a venda mais lucrativa do que e. E nao so ela: o repasse
 * do TikTok fecha dias depois da venda, entao a taxa do canal no mes aberto
 * ainda esta pela metade.
 *
 * Tudo sai do mesmo mes, e nao so as despesas: cada media e uma fracao do
 * faturamento DAQUELE mes, e misturar a despesa de agosto com o imposto de
 * setembro daria um perfil que nao e de mes nenhum. Sem o mes anterior na base,
 * fica o do cabecalho.
 */
export function mesDeReferenciaDoSimulador(
  mesSelecionado: string,
  mesCorrente: string,
  mesesDisponiveis: string[],
): string {
  if (mesSelecionado !== mesCorrente) return mesSelecionado;
  const [ano, mes] = mesSelecionado.split("-").map(Number) as [number, number];
  const anterior = mes === 1 ? `${ano - 1}-12` : `${ano}-${String(mes - 1).padStart(2, "0")}`;
  return mesesDisponiveis.includes(anterior) ? anterior : mesSelecionado;
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
