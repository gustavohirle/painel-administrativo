/**
 * Funcoes PURAS de custeio: cruzam os pedidos da Nuvemshop com os cadastros
 * de custo de fabricacao e de comissao.
 *
 * A Nuvemshop sabe o preco de venda. Ela nao sabe quanto custa fabricar nem
 * quanto o influencer leva. E o cruzamento aqui que transforma um relatorio
 * de vendas no raio-x de lucro.
 *
 * Como em `metrics.ts`: nada de React, nada de I/O.
 */

import {
  mesDaDespesa,
  type CategoriaDespesa,
  type DespesaAtribuida,
  type DespesaInfluencer,
} from "@/types/dominio";
import { chaveMes } from "@/lib/metrics";
import { paraNumero, type Pedido } from "@/types/nuvemshop";
import {
  BASE_PADRAO_CONTRATO,
  custoUnitarioTotal,
  type BaseComissao,
  type CustoProduto,
  type EntradaCustoProduto,
  type Influencer,
} from "@/types/dominio";
import {
  AVISO_KIT_SEM_COMPOSICAO,
  chaveProduto,
  pareceKit,
  partesDaChave,
  PROFUNDIDADE_MAXIMA_KIT,
  type EntradaProduto,
  type Produto,
} from "@/types/produto";
import type { Imposto } from "@/types/fiscal";
import type { ItemCatalogo } from "@/types/nuvemshop";
import { PERCENTUAL_PARTICIPACAO_SOCIOS, REGIME_SEM_INFLUENCER } from "@/lib/config";
import { razaoSegura } from "@/lib/format";
import {
  pedidosRecebidos,
  reconciliar,
  type LinhaMarca,
  type Reconciliacao,
} from "@/lib/metrics";
import {
  idsMarcadosPorPadrao,
  indexarProdutos,
  produtoDoItem,
  type IndiceProdutos,
  type ResultadoImpostos,
} from "@/lib/impostos";
import { taxaDoPedido, type ResultadoTaxasPlataforma } from "@/lib/plataforma";
import type { TaxaPlataforma } from "@/types/plataforma";

// ---------------------------------------------------------------------------
// Indice de custos
// ---------------------------------------------------------------------------

export interface IndiceCustos {
  /** Chave `${produtoId}:${varianteId}` -- custo especifico da variante. */
  porVariante: Map<string, number>;
  /** Chave `${produtoId}` -- custo que vale para todas as variantes. */
  porProduto: Map<number, number>;
}

/**
 * Monta o indice de busca de custo.
 *
 * Uma ficha com `varianteId: null` vale para o produto inteiro. Uma ficha com
 * variante especifica tem precedencia sobre a do produto -- um creme de 30ml e
 * um de 200ml tem custos muito diferentes.
 */
export function indexarCustos(custos: CustoProduto[]): IndiceCustos {
  const porVariante = new Map<string, number>();
  const porProduto = new Map<number, number>();

  for (const custo of custos) {
    const unitario = custoUnitarioTotal(custo);
    if (custo.varianteId === null) {
      porProduto.set(custo.produtoId, unitario);
    } else {
      porVariante.set(`${custo.produtoId}:${custo.varianteId}`, unitario);
    }
  }

  return { porVariante, porProduto };
}

/** Custo unitario de um item, ou `null` quando nao ha ficha cadastrada. */
export function custoUnitarioDe(
  indice: IndiceCustos,
  produtoId: number,
  varianteId: number,
): number | null {
  const especifico = indice.porVariante.get(`${produtoId}:${varianteId}`);
  if (especifico !== undefined) return especifico;
  const generico = indice.porProduto.get(produtoId);
  return generico ?? null;
}

/**
 * Custo unitario resolvendo kit.
 *
 * Precedencia:
 *   1. Ficha de custo propria do item. Vence sempre -- a fabrica pode ter um
 *      custo de montagem e embalagem do kit diferente da soma das partes.
 *   2. Sendo kit sem ficha propria, soma o custo dos componentes.
 *   3. Caso contrario, `null`.
 *
 * Componente sem custo faz o kit inteiro voltar `null`, de proposito. Devolver
 * a soma parcial seria pior do que admitir a lacuna: o numero pareceria certo
 * e estaria errado para MENOS, inflando a margem.
 */
export function custoUnitarioComKit(
  custos: IndiceCustos,
  produtos: IndiceProdutos,
  produtoId: number,
  varianteId: number,
  profundidade = 0,
): number | null {
  const proprio = custoUnitarioDe(custos, produtoId, varianteId);
  if (proprio !== null) return proprio;

  if (profundidade >= PROFUNDIDADE_MAXIMA_KIT) return null;

  const produto = produtoDoItem(produtos, produtoId, varianteId);
  if (!produto?.ehKit || produto.componentes.length === 0) return null;

  let soma = 0;
  for (const componente of produto.componentes) {
    const { produtoId: cp, varianteId: cv } = partesDaChave(componente.chave);
    const unitario = custoUnitarioComKit(
      custos,
      produtos,
      cp,
      cv ?? 0,
      profundidade + 1,
    );
    if (unitario === null) return null;
    soma += unitario * componente.quantidade;
  }

  return soma;
}

// ---------------------------------------------------------------------------
// CMV -- custo das mercadorias vendidas
// ---------------------------------------------------------------------------

/**
 * Brinde sem ficha: item que saiu a R$ 0 e nao tem custo cadastrado.
 *
 * Fica fora das contas de custo (decisao do cliente em 17/09/2026): nao tem
 * receita, nao tem custo conhecido e, sem cadastro, so aparecia como "produto
 * sem custo" em aviso e lista. Brinde COM ficha continua contando -- ai o
 * custo dele e real e sai da margem.
 */
function brindeSemCusto(item: { price: string | number }, unitario: number | null): boolean {
  return unitario === null && paraNumero(item.price) <= 0;
}

export interface ResultadoCMV {
  /** Custo de fabricacao total dos itens efetivamente pagos. */
  cmv: number;
  /** Receita dos itens que TEM ficha de custo. */
  receitaComCusto: number;
  /** Receita dos itens SEM ficha de custo -- o buraco do calculo. */
  receitaSemCusto: number;
  /** Fracao da receita coberta por ficha de custo. Abaixo de 1 o lucro e parcial. */
  cobertura: number;
  /** Quantos produtos distintos ainda nao tem custo cadastrado. */
  produtosSemCusto: number;
  /** Ids dos produtos sem ficha, para a tela de cadastro destacar. */
  idsProdutosSemCusto: number[];
}

/**
 * Calcula o CMV apenas sobre pedidos RECEBIDOS.
 *
 * Motivo: um boleto que nunca foi pago normalmente nem chega a ser produzido
 * ou expedido. Somar o custo dele infla o custo e esconde a margem real.
 */
export function calcularCMV(
  pedidos: Pedido[],
  custos: CustoProduto[],
  produtos: Produto[] = [],
): ResultadoCMV {
  const indice = indexarCustos(custos);
  const indiceProdutos = indexarProdutos(produtos);
  let cmv = 0;
  let receitaComCusto = 0;
  let receitaSemCusto = 0;
  const semCusto = new Set<number>();

  for (const pedido of pedidosRecebidos(pedidos)) {
    for (const item of pedido.products) {
      const receitaItem = paraNumero(item.price) * item.quantity;
      const unitario = custoUnitarioComKit(
        indice,
        indiceProdutos,
        item.product_id,
        item.variant_id,
      );
      if (brindeSemCusto(item, unitario)) continue;

      if (unitario === null) {
        receitaSemCusto += receitaItem;
        semCusto.add(item.product_id);
      } else {
        receitaComCusto += receitaItem;
        cmv += unitario * item.quantity;
      }
    }
  }

  const receitaTotal = receitaComCusto + receitaSemCusto;

  return {
    cmv,
    receitaComCusto,
    receitaSemCusto,
    cobertura: razaoSegura(receitaComCusto, receitaTotal),
    produtosSemCusto: semCusto.size,
    idsProdutosSemCusto: [...semCusto],
  };
}

// ---------------------------------------------------------------------------
// Comissao a partir do cadastro de influencers
// ---------------------------------------------------------------------------

export interface ComissaoInfluencer {
  influencerId: string;
  nome: string;
  marca: string;
  percentual: number;
  baseComissao: Influencer["baseComissao"];
  /** Valor sobre o qual o percentual incidiu. */
  valorBase: number;
  /** Comissao devida pelo contrato cadastrado. */
  valorComissao: number;
  /** O que seria pago se a base fosse o faturamento bruto. */
  comissaoSeSobreBruto: number;
  /** comissaoSeSobreBruto - valorComissao. */
  diferencaParaBruto: number;
}

/**
 * Comissao devida por influencer, respeitando a base de cada contrato.
 * Influencers inativos sao ignorados.
 *
 * `taxasPorMarca` e o `porMarca` de `apurarTaxasPlataforma` sobre os MESMOS
 * pedidos -- a base `liquido` desconta exatamente a taxa que a DRE desconta.
 * Sem ele, a base `liquido` sai igual a receita real (antes das taxas), que e
 * o mesmo que a DRE faz quando nao recebe as taxas.
 */
export function calcularComissoesPorInfluencer(
  pedidos: Pedido[],
  influencers: Influencer[],
  taxasPorMarca: Record<string, number> = {},
): ComissaoInfluencer[] {
  const reconciliacaoPorMarca = new Map<string, Reconciliacao>();
  const marcas = new Set(pedidos.map((p) => p.marca));
  for (const marca of marcas) {
    reconciliacaoPorMarca.set(
      marca,
      reconciliar(pedidos.filter((p) => p.marca === marca)),
    );
  }

  const linhas: ComissaoInfluencer[] = [];

  for (const influencer of influencers) {
    if (!influencer.ativo) continue;
    const r = reconciliacaoPorMarca.get(influencer.marca);
    if (!r) continue;

    const fracao = influencer.percentual / 100;
    /*
     * O frete fica FORA de toda base. Ele e cobrado do cliente por fora (produto
     * de R$ 100 + R$ 19 de frete) e vai para a transportadora: nao e venda do
     * influencer. Por isso "bruto" e o faturamento sem frete, e "recebido" sem
     * frete coincide com a receita real. "liquido" tira tambem as taxas.
     */
    const valorBase = valorDaBaseDaMarca(
      r,
      influencer.baseComissao,
      taxasPorMarca[influencer.marca] ?? 0,
    );

    const valorComissao = valorBase * fracao;
    const comissaoSeSobreBruto = r.brutoSemFrete * fracao;

    linhas.push({
      influencerId: influencer.id,
      nome: influencer.nome,
      marca: influencer.marca,
      percentual: influencer.percentual,
      baseComissao: influencer.baseComissao,
      valorBase,
      valorComissao,
      comissaoSeSobreBruto,
      diferencaParaBruto: comissaoSeSobreBruto - valorComissao,
    });
  }

  return linhas.sort((a, b) => b.valorComissao - a.valorComissao);
}

/**
 * O valor sobre o qual o percentual incide, para cada base. Um lugar so, para
 * a DRE e o cruzamento de contratos nao terem cada um a sua versao.
 */
function valorDaBaseDaMarca(
  r: Pick<Reconciliacao, "brutoSemFrete" | "receitaReal">,
  base: BaseComissao,
  taxas: number,
): number {
  if (base === "bruto") return r.brutoSemFrete;
  if (base === "liquido") return r.receitaReal - taxas;
  return r.receitaReal;
}

export function totalComissoes(linhas: ComissaoInfluencer[]): number {
  return linhas.reduce((soma, l) => soma + l.valorComissao, 0);
}

/**
 * Despesas de influencer que pertencem a este conjunto de pedidos.
 *
 * A DRE nao recebe periodo nem marca: recebe PEDIDOS, e o periodo e as marcas
 * sao os deles. A despesa segue a mesma regra, e e isso que faz o lucro de uma
 * marca no relatorio bater com o da tela inicial: entra se o mes dela tem
 * pedido no conjunto E se o influencer dela e de uma marca com pedido no
 * conjunto.
 *
 * Consequencia assumida: despesa num mes em que a marca nao vendeu nada nao
 * entra. A comissao desse mes tambem seria zero e a marca nem apareceria.
 *
 * Despesa COMPARTILHADA ainda nao dividida nao tem dono nem marca, e fica de
 * fora: quem chama passa as despesas por `ratearDespesas` antes.
 */
export function despesasQueCabem<T extends DespesaInfluencer>(
  despesas: T[],
  pedidos: Pedido[],
  influencers: Influencer[],
): T[] {
  if (despesas.length === 0 || pedidos.length === 0) return [];

  const meses = new Set(pedidos.map((p) => chaveMes(p.created_at)));
  const marcas = new Set(pedidos.map((p) => p.marca));
  const marcaDoInfluencer = new Map(influencers.map((i) => [i.id, i.marca]));

  return despesas.filter((despesa) => {
    if (despesa.influencerId === null) return false;
    const marca = marcaDoInfluencer.get(despesa.influencerId);
    return marca !== undefined && marcas.has(marca) && meses.has(mesDaDespesa(despesa));
  });
}

/**
 * Da dono a toda despesa: a propria passa igual, e cada COMPARTILHADA vira uma
 * parte por influencer, proporcional ao faturamento SEM FRETE da marca dele no mes
 * da despesa.
 *
 * Recebe TODOS os pedidos, nao o recorte da tela. A proporcao e a do mes
 * inteiro; dividida sobre um recorte, a mesma despesa daria partes diferentes
 * no painel e no relatorio filtrado por marca.
 *
 * Regras:
 * - so recebe parte influencer ATIVO, e por marca so o primeiro ativo -- a
 *   mesma regra de "um influencer por marca" da secao 5.9;
 * - marca sem faturamento no mes nao recebe parte;
 * - as partes sao arredondadas em centavos e a sobra do arredondamento vai
 *   para a maior, para a soma fechar exatamente no total cadastrado;
 * - mes sem faturamento nenhum nao gera parte: nao ha a quem atribuir.
 *
 * Nada disto e gravado. Muda a venda, muda a divisao na proxima leitura -- e o
 * "atualizar toda vez" que o cliente pediu, sem registro para ficar velho.
 */
export function ratearDespesas(
  despesas: DespesaInfluencer[],
  pedidos: Pedido[],
  influencers: Influencer[],
): DespesaAtribuida[] {
  const brutoPorMesEMarca = new Map<string, number>();
  if (despesas.some((d) => d.influencerId === null)) {
    for (const pedido of pedidos) {
      const chave = `${chaveMes(pedido.created_at)}|${pedido.marca}`;
      // Faturamento sem frete: o frete e do cliente, nao do influencer.
      const semFrete = paraNumero(pedido.total) - paraNumero(pedido.shipping_cost_customer);
      brutoPorMesEMarca.set(chave, (brutoPorMesEMarca.get(chave) ?? 0) + semFrete);
    }
  }

  const donos: Influencer[] = [];
  const marcasComDono = new Set<string>();
  for (const influencer of influencers) {
    if (!influencer.ativo || marcasComDono.has(influencer.marca)) continue;
    marcasComDono.add(influencer.marca);
    donos.push(influencer);
  }

  const atribuidas: DespesaAtribuida[] = [];

  for (const despesa of despesas) {
    if (despesa.influencerId !== null) {
      atribuidas.push({ ...despesa, influencerId: despesa.influencerId, rateio: null });
      continue;
    }

    const mes = mesDaDespesa(despesa);
    const pesos = donos
      .map((influencer) => ({
        influencer,
        bruto: brutoPorMesEMarca.get(`${mes}|${influencer.marca}`) ?? 0,
      }))
      .filter((p) => p.bruto > 0)
      .sort((a, b) => b.bruto - a.bruto);

    const soma = pesos.reduce((s, p) => s + p.bruto, 0);
    if (soma <= 0) continue;

    const totalCentavos = Math.round(despesa.valor * 100);
    const centavos = pesos.map((p) => Math.floor((totalCentavos * p.bruto) / soma));
    const sobra = totalCentavos - centavos.reduce((s, c) => s + c, 0);
    centavos[0] = (centavos[0] ?? 0) + sobra;

    pesos.forEach((p, n) => {
      atribuidas.push({
        ...despesa,
        id: `${despesa.id}:${p.influencer.id}`,
        influencerId: p.influencer.id,
        valor: (centavos[n] ?? 0) / 100,
        rateio: { despesaId: despesa.id, total: despesa.valor, fracao: p.bruto / soma },
      });
    });
  }

  return atribuidas;
}

// ---------------------------------------------------------------------------
// DRE -- o raio-x completo
// ---------------------------------------------------------------------------

export interface DemonstrativoResultado {
  reconciliacao: Reconciliacao;
  cmv: ResultadoCMV;
  comissoes: ComissaoInfluencer[];
  /** Soma das comissoes devidas pelos contratos cadastrados. */
  totalComissoes: number;
  /** Despesas de influencer do periodo e das marcas destes pedidos. */
  despesasInfluencers: DespesaInfluencer[];
  totalDespesasInfluencers: number;
  /**
   * As despesas quebradas nas duas categorias (`CategoriaDespesa`). Somadas,
   * dao `totalDespesasInfluencers`.
   *
   * A quebra existe porque a pizza pede TRES fatias, e nao uma: comissao,
   * marketing e o resto. Sao tres conversas diferentes -- a comissao se
   * renegocia no contrato, o marketing e midia paga que se liga e desliga, e o
   * resto e custo de estrutura. Uma fatia so escondia as tres.
   */
  totalDespesasMarketing: number;
  totalDespesasOutras: number;
  /**
   * totalComissoes + totalDespesasInfluencers: tudo que os influencers
   * custaram. Continua existindo porque e o numero da aba Influencers e do
   * relatorio; a pizza usa as tres parcelas.
   */
  totalInfluencers: number;

  /** Apuracao fiscal do periodo. `null` quando nao ha cadastro de impostos. */
  impostos: ResultadoImpostos | null;
  /** DAS + tributos fora da guia unica. */
  totalImpostos: number;

  /**
   * Taxas da plataforma e do gateway. `null` quando nao ha cadastro.
   *
   * Entra na conta ao lado dos impostos, e nao junto deles, porque nao e
   * tributo: e preco de servico, negociavel, retido no ato da venda. Somar as
   * duas coisas numa fatia so esconderia a unica das duas que da para
   * renegociar.
   */
  taxasPlataforma: ResultadoTaxasPlataforma | null;
  totalTaxasPlataforma: number;
  /**
   * receitaReal - impostos - taxas de plataforma.
   *
   * Repare que `receitaReal` continua sendo `recebido - frete`, como manda a
   * secao 5.1: e o numero que sustenta a comparacao de comissao. Imposto e
   * taxa entram como deducoes DEPOIS dele, para nao mexer naquela tese.
   */
  receitaLiquida: number;

  /** receitaLiquida - cmv */
  margemContribuicao: number;
  /** Fracao: margemContribuicao / receitaReal */
  margemContribuicaoPercentual: number;
  /**
   * Participacao dos socios: percentual fixo sobre o RECEBIDO
   * (`PERCENTUAL_PARTICIPACAO_SOCIOS`). Custo fixo da operacao, com fatia
   * propria na pizza -- sem ela a pizza nao fecha.
   */
  participacaoSocios: number;
  /** Percentual aplicado, ex.: 6 para 6%. */
  percentualParticipacaoSocios: number;
  /** margemContribuicao - comissoes - despesas com influencers - socios */
  lucroOperacional: number;
  /** Fracao: lucroOperacional / receitaReal */
  margemOperacionalPercentual: number;
  /**
   * Fracao do lucro que ainda nao pode ser afirmada com certeza, porque parte
   * da receita vem de produto sem ficha de custo. Exibir sempre que > 0.
   */
  incertezaPorFaltaDeCusto: number;
}

/**
 * Monta a DRE do periodo. E a tela que o dono quer: de quanto vendemos ate
 * quanto realmente sobrou.
 */
export interface OpcoesDemonstrativo {
  /** Cadastro de produtos, necessario para resolver o custo dos kits. */
  produtos?: Produto[];
  /** Apuracao fiscal do periodo. Omitir mantem o resultado antes de impostos. */
  impostos?: ResultadoImpostos | null;
  /** Taxas de plataforma. Omitir mantem o resultado antes delas. */
  taxasPlataforma?: ResultadoTaxasPlataforma | null;
  /**
   * TODAS as despesas de influencer cadastradas, de qualquer mes. A propria
   * DRE separa as que cabem nos pedidos -- ver `despesasQueCabem`. Omitir
   * mantem o resultado so com a comissao.
   */
  despesasInfluencers?: DespesaInfluencer[];
  /** Participacao dos socios, em % do recebido. Padrao: `PERCENTUAL_PARTICIPACAO_SOCIOS`. */
  percentualParticipacaoSocios?: number;
}

export function montarDemonstrativo(
  pedidos: Pedido[],
  custos: CustoProduto[],
  influencers: Influencer[],
  opcoes: OpcoesDemonstrativo = {},
): DemonstrativoResultado {
  const reconciliacao = reconciliar(pedidos);
  const cmv = calcularCMV(pedidos, custos, opcoes.produtos ?? []);
  const taxasPlataforma = opcoes.taxasPlataforma ?? null;
  const totalTaxasPlataforma = taxasPlataforma?.total ?? 0;

  const comissoes = calcularComissoesPorInfluencer(
    pedidos,
    influencers,
    taxasPlataforma?.porMarca ?? {},
  );
  const total = totalComissoes(comissoes);
  const despesas = despesasQueCabem(opcoes.despesasInfluencers ?? [], pedidos, influencers);
  const totalDespesas = despesas.reduce((soma, d) => soma + d.valor, 0);
  const somarCategoria = (categoria: CategoriaDespesa) =>
    despesas.reduce((soma, d) => (d.categoria === categoria ? soma + d.valor : soma), 0);
  const totalDespesasMarketing = somarCategoria("marketing");

  const impostos = opcoes.impostos ?? null;
  const totalImpostos = impostos?.totalSobreVenda ?? 0;

  const receitaLiquida =
    reconciliacao.receitaReal - totalImpostos - totalTaxasPlataforma;
  const margemContribuicao = receitaLiquida - cmv.cmv;
  const percentualParticipacaoSocios =
    opcoes.percentualParticipacaoSocios ?? PERCENTUAL_PARTICIPACAO_SOCIOS;
  const participacaoSocios = reconciliacao.recebido * (percentualParticipacaoSocios / 100);
  // Frete que a loja bancou (frete gratis do TikTok): custo, nao repasse.
  const freteAbsorvido = reconciliacao.freteAbsorvido;
  const lucroOperacional =
    margemContribuicao - total - totalDespesas - participacaoSocios - freteAbsorvido;

  return {
    reconciliacao,
    cmv,
    comissoes,
    totalComissoes: total,
    despesasInfluencers: despesas,
    totalDespesasInfluencers: totalDespesas,
    totalDespesasMarketing,
    // Por subtracao, e nao por uma segunda soma: assim as duas parcelas fecham
    // no total mesmo se um dia aparecer categoria nova no banco.
    totalDespesasOutras: totalDespesas - totalDespesasMarketing,
    totalInfluencers: total + totalDespesas,
    impostos,
    totalImpostos,
    taxasPlataforma,
    totalTaxasPlataforma,
    receitaLiquida,
    margemContribuicao,
    margemContribuicaoPercentual: razaoSegura(
      margemContribuicao,
      reconciliacao.receitaReal,
    ),
    participacaoSocios,
    percentualParticipacaoSocios,
    lucroOperacional,
    margemOperacionalPercentual: razaoSegura(
      lucroOperacional,
      reconciliacao.receitaReal,
    ),
    incertezaPorFaltaDeCusto: 1 - cmv.cobertura,
  };
}

// ---------------------------------------------------------------------------
// Rentabilidade por produto
// ---------------------------------------------------------------------------

export interface LinhaRentabilidade {
  produtoId: number;
  nome: string;
  sku: string | null;
  unidadesVendidas: number;
  receita: number;
  /** `null` quando o produto ainda nao tem ficha de custo. */
  custoTotal: number | null;
  /** `null` quando nao ha custo cadastrado. */
  margem: number | null;
  /** Fracao. `null` quando nao ha custo cadastrado. */
  margemPercentual: number | null;
  /** Preco medio praticado no periodo. */
  precoMedio: number;
  temCusto: boolean;
  /**
   * Taxa de plataforma atribuida a este produto.
   *
   * E RATEIO, e por isso vem em campo proprio em vez de ja descontada da
   * margem: a taxa e cobrada sobre o PEDIDO, nao sobre o item. O criterio e a
   * participacao do item na receita do pedido -- o unico que nao precisa de
   * arbitragem, ja que a cobranca e proporcional ao valor. Num pedido de um
   * item so, nao ha rateio nenhum.
   */
  taxaPlataforma: number;
  /** margem - taxaPlataforma. `null` quando nao ha custo cadastrado. */
  margemAposTaxa: number | null;
}

/**
 * Rentabilidade por produto, sobre os pedidos recebidos.
 * Produtos sem ficha aparecem na lista com custo `null` -- some-los esconderia
 * exatamente o que precisa ser cadastrado.
 */
export function rentabilidadePorProduto(
  pedidos: Pedido[],
  custos: CustoProduto[],
  produtos: Produto[] = [],
  taxas: TaxaPlataforma[] = [],
): LinhaRentabilidade[] {
  const indice = indexarCustos(custos);
  const indiceProdutos = indexarProdutos(produtos);

  interface Acumulado {
    nome: string;
    sku: string | null;
    unidades: number;
    receita: number;
    custo: number;
    unidadesComCusto: number;
    taxa: number;
  }

  const mapa = new Map<number, Acumulado>();

  for (const pedido of pedidosRecebidos(pedidos)) {
    /*
     * A taxa e do PEDIDO. Calculada uma vez aqui e distribuida entre os itens
     * pela participacao de cada um na receita -- o mesmo criterio da propria
     * cobranca, que e proporcional ao valor.
     */
    const taxaDoPedidoInteiro = taxas.length ? taxaDoPedido(pedido, taxas) : 0;
    const receitaDoPedido = pedido.products.reduce(
      (soma, item) => soma + paraNumero(item.price) * item.quantity,
      0,
    );

    for (const item of pedido.products) {
      const unitario = custoUnitarioComKit(
        indice,
        indiceProdutos,
        item.product_id,
        item.variant_id,
      );
      if (brindeSemCusto(item, unitario)) continue;

      let acc = mapa.get(item.product_id);
      if (!acc) {
        acc = {
          nome: item.name,
          sku: item.sku,
          unidades: 0,
          receita: 0,
          custo: 0,
          unidadesComCusto: 0,
          taxa: 0,
        };
        mapa.set(item.product_id, acc);
      }

      const receitaItem = paraNumero(item.price) * item.quantity;
      acc.unidades += item.quantity;
      acc.receita += receitaItem;
      acc.taxa += taxaDoPedidoInteiro * razaoSegura(receitaItem, receitaDoPedido);

      if (unitario !== null) {
        acc.custo += unitario * item.quantity;
        acc.unidadesComCusto += item.quantity;
      }
    }
  }

  const linhas: LinhaRentabilidade[] = [];
  for (const [produtoId, acc] of mapa) {
    const temCusto = acc.unidadesComCusto > 0;
    const custoTotal = temCusto ? acc.custo : null;
    const margem = custoTotal === null ? null : acc.receita - custoTotal;

    linhas.push({
      produtoId,
      nome: acc.nome,
      sku: acc.sku,
      unidadesVendidas: acc.unidades,
      receita: acc.receita,
      custoTotal,
      margem,
      margemPercentual: margem === null ? null : razaoSegura(margem, acc.receita),
      precoMedio: razaoSegura(acc.receita, acc.unidades),
      temCusto,
      taxaPlataforma: acc.taxa,
      margemAposTaxa: margem === null ? null : margem - acc.taxa,
    });
  }

  return linhas.sort((a, b) => b.receita - a.receita);
}

// ---------------------------------------------------------------------------
// Catalogo do que foi vendido
// ---------------------------------------------------------------------------

export interface VarianteVendida {
  varianteId: number;
  nome: string;
  sku: string | null;
  precoMedio: number;
  unidadesVendidas: number;
  /** Custo unitario cadastrado, ou `null`. */
  custoUnitario: number | null;
}

export interface ProdutoVendido {
  produtoId: number;
  nome: string;
  sku: string | null;
  unidadesVendidas: number;
  receita: number;
  variantes: VarianteVendida[];
  /** Custo cadastrado no nivel do produto inteiro (varianteId null). */
  custoDoProduto: number | null;
  /** Alguma variante ainda sem custo. */
  temVarianteSemCusto: boolean;
}

/**
 * Monta a arvore produto -> variantes a partir dos PEDIDOS.
 *
 * De proposito nao chama o endpoint de produtos da Nuvemshop: o que interessa
 * para o custeio e o que efetivamente vendeu no periodo, e assim a tela de
 * cadastro funciona igual em demonstracao e em producao, sem requisicao extra.
 */
export function catalogoVendido(
  pedidos: Pedido[],
  custos: CustoProduto[],
  cadastroProdutos: Produto[] = [],
): ProdutoVendido[] {
  const indice = indexarCustos(custos);
  const indiceProdutos = indexarProdutos(cadastroProdutos);

  interface AccVariante {
    nome: string;
    sku: string | null;
    receita: number;
    unidades: number;
  }
  interface AccProduto {
    nome: string;
    sku: string | null;
    receita: number;
    unidades: number;
    variantes: Map<number, AccVariante>;
  }

  const produtos = new Map<number, AccProduto>();

  for (const pedido of pedidosRecebidos(pedidos)) {
    for (const item of pedido.products) {
      const unitario = custoUnitarioComKit(indice, indiceProdutos, item.product_id, item.variant_id);
      if (brindeSemCusto(item, unitario)) continue;

      let produto = produtos.get(item.product_id);
      if (!produto) {
        produto = {
          nome: item.name,
          sku: item.sku,
          receita: 0,
          unidades: 0,
          variantes: new Map(),
        };
        produtos.set(item.product_id, produto);
      }

      const receitaItem = paraNumero(item.price) * item.quantity;
      produto.receita += receitaItem;
      produto.unidades += item.quantity;

      let variante = produto.variantes.get(item.variant_id);
      if (!variante) {
        variante = { nome: item.name, sku: item.sku, receita: 0, unidades: 0 };
        produto.variantes.set(item.variant_id, variante);
      }
      variante.receita += receitaItem;
      variante.unidades += item.quantity;
    }
  }

  const lista: ProdutoVendido[] = [];

  for (const [produtoId, produto] of produtos) {
    const variantes: VarianteVendida[] = [...produto.variantes.entries()]
      .map(([varianteId, v]) => ({
        varianteId,
        nome: v.nome,
        sku: v.sku,
        precoMedio: razaoSegura(v.receita, v.unidades),
        unidadesVendidas: v.unidades,
        custoUnitario: custoUnitarioComKit(
          indice,
          indiceProdutos,
          produtoId,
          varianteId,
        ),
      }))
      .sort((a, b) => b.unidadesVendidas - a.unidadesVendidas);

    lista.push({
      produtoId,
      nome: produto.nome,
      sku: produto.sku,
      unidadesVendidas: produto.unidades,
      receita: produto.receita,
      variantes,
      custoDoProduto: indice.porProduto.get(produtoId) ?? null,
      temVarianteSemCusto: variantes.some((v) => v.custoUnitario === null),
    });
  }

  // Maior receita primeiro: e o produto que mais importa cadastrar.
  return lista.sort((a, b) => b.receita - a.receita);
}

/**
 * O que falta no cadastro de produtos: o catalogo da loja mais o que vendeu.
 *
 * Na demonstracao o cadastro nasce semeado; com a loja real ele nasce vazio, e
 * a tela de produtos ficaria em branco ate alguem digitar item por item. Isto
 * devolve as entradas prontas para gravar: uma por variante que nenhum
 * cadastro cobre -- nem o da variante, nem o do produto inteiro.
 *
 * So entra o que teve VENDA PAGA COM PRECO no periodo (decisao do cliente em
 * 17/09/2026). Brinde que sai a R$ 0 e produto que nunca vendeu nao pesam em
 * conta nenhuma -- receita zero, custo que a cobertura nao enxerga -- e so
 * enchiam o cadastro. O catalogo entra para dar o nome e o SKU atuais e dizer
 * se o item saiu da loja ou esta despublicado; ele nao acrescenta itens. Sem
 * `catalogo`, nome e SKU sao os da venda.
 *
 * Cada entrada ja sai com dono e impostos, pela MESMA regra da apuracao: o
 * primeiro influencer ativo da marca (5.9) e, sem ele, `REGIME_SEM_INFLUENCER`.
 * Dos impostos, so os que nascem marcados (`idsMarcadosPorPadrao`): no Lucro
 * Presumido, ICMS, ICMS-ST e IPI. PIS e COFINS entram desmarcados e passam a
 * valer quando alguem os marcar -- imposto sobre receita so incide onde o
 * produto o marcou.
 *
 * Nome e SKU sao os da venda mais recente, porque o produto pode ter sido
 * renomeado na loja. Maior receita primeiro.
 */
/**
 * Fracao do preco medio PAGO que vira custo provisorio de fabricacao.
 *
 * Regra do dono (16-17/09/2026): ate os custos reais chegarem, todo produto
 * entra com 35% do preco de venda como custo, para o lucro da tela nao sair
 * inflado por produto de custo zero. A ficha e PROVISORIA e se reconhece pelo
 * formato: valor inteiro em materia-prima, os outros tres componentes em zero.
 */
export const CUSTO_PROVISORIO = 0.35;

/**
 * As fichas de custo provisorias para uma lista de produtos: uma por produto
 * que ainda nao tem ficha e que teve venda paga com preco.
 *
 * Mora aqui, e nao no script nem na action, porque os DOIS precisam dela. Ate
 * 24/09/2026 a regra vivia so no script `produtos:trazer`; o botao "Trazer da
 * Nuvemshop" da aba Produtos cadastrava o produto e nao criava ficha nenhuma,
 * e todo produto trazido pela tela entrava com custo zero -- o dono percebeu
 * pelos produtos novos chegando sem custo.
 *
 * Tres decisoes:
 *
 * 1. **O preco e o medio PAGO, e nao o de tabela**: e o que entrou de verdade.
 *    So pedido recebido entra, pela mesma razao do CMV (5.7) -- boleto nunca
 *    pago nao chegou a ser produzido.
 * 2. **Nunca sobrescreve.** Produto com ficha -- da propria variante ou do
 *    produto inteiro (`varianteId: null`, que vale para todas) -- fica como
 *    esta. Uma ficha real trocada por um chute seria o pior erro possivel
 *    aqui.
 * 3. **Sem preco, sem ficha.** Brinde a R$ 0 e item que so sai dentro de kit
 *    ficam de fora: inventar custo para eles seria pior que a lacuna, porque
 *    a lacuna a tela declara (5.7) e o numero inventado, nao.
 */
export function fichasProvisorias(
  pedidos: Pedido[],
  produtos: Array<Pick<EntradaProduto, "produtoId" | "varianteId" | "sku" | "nome">>,
  custos: CustoProduto[],
  fracao: number = CUSTO_PROVISORIO,
): EntradaCustoProduto[] {
  const vendas = new Map<string, { valor: number; unidades: number }>();
  for (const pedido of pedidosRecebidos(pedidos)) {
    for (const item of pedido.products) {
      const quantidade = Number(item.quantity ?? 0);
      if (!Number.isFinite(quantidade) || quantidade <= 0) continue;
      const chave = chaveProduto(item.product_id, item.variant_id);
      const atual = vendas.get(chave) ?? { valor: 0, unidades: 0 };
      atual.valor += paraNumero(item.price) * quantidade;
      atual.unidades += quantidade;
      vendas.set(chave, atual);
    }
  }

  // Ficha do produto inteiro vale para todas as variantes (5.7): quem a tem
  // ja tem custo, mesmo sem ficha da variante.
  const comFicha = new Set(custos.map((c) => chaveProduto(c.produtoId, c.varianteId)));
  const temFicha = (produtoId: number, varianteId: number | null) =>
    comFicha.has(chaveProduto(produtoId, varianteId)) ||
    comFicha.has(chaveProduto(produtoId, null));

  const fichas: EntradaCustoProduto[] = [];
  const jaGerada = new Set<string>();

  for (const produto of produtos) {
    const chave = chaveProduto(produto.produtoId, produto.varianteId);
    if (jaGerada.has(chave) || temFicha(produto.produtoId, produto.varianteId)) continue;

    const venda = vendas.get(chave);
    if (!venda || venda.unidades === 0 || venda.valor <= 0) continue;

    fichas.push({
      produtoId: produto.produtoId,
      varianteId: produto.varianteId,
      sku: produto.sku,
      nome: produto.nome,
      // Tudo em materia-prima: e por ai que se acha o que ainda e chute.
      custoMateriaPrima: Math.round((venda.valor / venda.unidades) * fracao * 100) / 100,
      custoEmbalagem: 0,
      custoMaoDeObra: 0,
      custoIndireto: 0,
    });
    jaGerada.add(chave);
  }

  return fichas;
}

export function produtosParaCadastrar(
  pedidos: Pedido[],
  cadastro: Produto[],
  impostos: Imposto[],
  influencers: Influencer[],
  catalogo: ItemCatalogo[] = [],
): EntradaProduto[] {
  const indice = indexarProdutos(cadastro);

  const donoDaMarca = new Map<string, Influencer>();
  for (const influencer of influencers) {
    if (influencer.ativo && !donoDaMarca.has(influencer.marca)) {
      donoDaMarca.set(influencer.marca, influencer);
    }
  }

  interface Visto {
    produtoId: number;
    varianteId: number;
    nome: string;
    sku: string | null;
    marca: string;
    receita: number;
    vendidoEm: string;
    /** `null` quando o catalogo nao foi consultado ou nao tem o item. */
    publicado: boolean | null;
  }
  const vistos = new Map<string, Visto>();

  for (const pedido of pedidosRecebidos(pedidos)) {
    for (const item of pedido.products) {
      if (produtoDoItem(indice, item.product_id, item.variant_id)) continue;
      // Brinde (preco zero) nao conta como venda.
      if (paraNumero(item.price) <= 0) continue;

      const chave = chaveProduto(item.product_id, item.variant_id);
      const receita = paraNumero(item.price) * item.quantity;
      const visto = vistos.get(chave);
      if (!visto) {
        vistos.set(chave, {
          produtoId: item.product_id,
          varianteId: item.variant_id,
          nome: item.name,
          sku: item.sku,
          marca: pedido.marca,
          receita,
          vendidoEm: pedido.created_at,
          publicado: null,
        });
        continue;
      }
      visto.receita += receita;
      if (pedido.created_at >= visto.vendidoEm) {
        visto.nome = item.name;
        visto.sku = item.sku;
        visto.marca = pedido.marca;
        visto.vendidoEm = pedido.created_at;
      }
    }
  }

  // O catalogo manda no nome e no SKU: e o que a loja mostra hoje. So para o
  // que vendeu -- item do catalogo sem venda paga nao entra.
  for (const item of catalogo) {
    const visto = vistos.get(chaveProduto(item.produtoId, item.varianteId));
    if (!visto) continue;
    visto.nome = item.nome;
    visto.sku = item.sku ?? visto.sku;
    visto.marca = item.marca;
    visto.publicado = item.publicado;
  }

  return [...vistos.entries()]
    .sort((a, b) => b[1].receita - a[1].receita || a[1].nome.localeCompare(b[1].nome, "pt-BR"))
    .map(([chave, visto]) => {
      const dono = donoDaMarca.get(visto.marca) ?? null;
      const ehKit = pareceKit(visto.nome);
      const observacao =
        [
          ehKit ? AVISO_KIT_SEM_COMPOSICAO : null,
          visto.publicado === false ? "Não publicado na loja Nuvemshop." : null,
          visto.publicado === null && catalogo.length > 0
            ? "Vendido, mas não está mais no catálogo da Nuvemshop."
            : null,
        ]
          .filter(Boolean)
          .join(" ") || null;
      return {
        chave,
        produtoId: visto.produtoId,
        varianteId: visto.varianteId,
        nome: visto.nome,
        sku: visto.sku,
        ncm: null,
        origem: "nuvemshop" as const,
        marca: visto.marca,
        influencerId: dono?.id ?? null,
        // So os que nascem marcados; o resto e escolha de quem cadastra.
        impostosIds: idsMarcadosPorPadrao(impostos, dono?.regime ?? REGIME_SEM_INFLUENCER),
        // A composicao a Nuvemshop nao informa: fica para o cadastro.
        ehKit,
        componentes: [],
        ativo: true,
        observacao,
      };
    });
}

// ---------------------------------------------------------------------------
// 5.3 Comissao por marca, na base do contrato
// ---------------------------------------------------------------------------

/**
 * Linha de marca ja sabendo QUAL base o contrato daquela marca usa, mas ainda
 * sem percentual aplicado.
 *
 * A separacao em duas etapas existe por causa do simulador: o servidor cruza
 * marca com contrato uma vez, e o navegador so multiplica quando o cliente
 * arrasta o percentual. Assim o recalculo e instantaneo e nao volta ao servidor.
 */
export interface MarcaComContrato extends LinhaMarca {
  /** `null` quando a marca ainda nao tem influencer ativo vinculado. */
  influencerNome: string | null;
  /** Percentual do contrato cadastrado, para confrontar com o do simulador. */
  percentualContrato: number | null;
  /** Base do contrato. Sem influencer vinculado, cai em `BASE_SEM_CONTRATO`. */
  baseComissao: BaseComissao;
  /** Taxas de plataforma da marca no periodo, para a base `liquido`. */
  taxasPlataforma: number;
}

/**
 * Base do contrato de uma marca sem influencer ativo vinculado.
 *
 * A que o cliente pratica (`BASE_PADRAO_CONTRATO`). Era `bruto` enquanto a
 * pratica descrita era pagar sobre o bruto; em 16/09/2026 o cliente disse que
 * paga sobre o que cai na conta, sem frete.
 */
export const BASE_SEM_CONTRATO: BaseComissao = BASE_PADRAO_CONTRATO;

/**
 * Cruza as linhas por marca com o contrato de cada influencer.
 *
 * Havendo mais de um influencer na mesma marca, o primeiro ATIVO manda -- a
 * mesma regra que a seccao 5.9 usa para resolver o regime tributario dos
 * produtos. Inativo nao entra em calculo nenhum.
 */
export function cruzarMarcasComContratos(
  marcas: LinhaMarca[],
  influencers: Influencer[],
  taxasPorMarca: Record<string, number> = {},
): MarcaComContrato[] {
  const contratoPorMarca = new Map<string, Influencer>();
  for (const influencer of influencers) {
    if (!influencer.ativo) continue;
    if (!contratoPorMarca.has(influencer.marca)) {
      contratoPorMarca.set(influencer.marca, influencer);
    }
  }

  return marcas.map((linha) => {
    const contrato = contratoPorMarca.get(linha.marca);
    return {
      ...linha,
      influencerNome: contrato?.nome ?? null,
      percentualContrato: contrato?.percentual ?? null,
      baseComissao: contrato?.baseComissao ?? BASE_SEM_CONTRATO,
      taxasPlataforma: taxasPorMarca[linha.marca] ?? 0,
    };
  });
}

export interface LinhaComissaoContrato extends MarcaComContrato {
  /** O numero da linha sobre o qual o percentual incide. */
  valorBase: number;
  /** Comissao da marca, na base do contrato dela. */
  comissao: number;
  /** A mesma comissao se a base fosse a receita real. */
  comissaoSeSobreReceitaReal: number;
  /**
   * `comissao - comissaoSeSobreReceitaReal`. Zero quando o contrato ja e sobre
   * a receita real -- ai nao ha duas bases para comparar.
   */
  aMaisQueSobreReceitaReal: number;
}

/** O valor de uma linha correspondente a base pedida. */
export function valorDaBase(
  linha: LinhaMarca & { taxasPlataforma?: number },
  base: BaseComissao,
): number {
  // Frete fora de toda base, como em `calcularComissoesPorInfluencer`.
  return valorDaBaseDaMarca(linha, base, linha.taxasPlataforma ?? 0);
}

/**
 * Aplica o percentual do simulador sobre a base de cada contrato.
 *
 * O percentual vem do simulador e nao do contrato de proposito (seccao 5.2): o
 * cliente quer testar cenários na reuniao. A BASE, essa sim, e sempre a do
 * contrato -- mostrar a comissao numa base que aquele influencer nao usa seria
 * um numero que nao existe.
 */
export function aplicarPercentualNosContratos(
  marcas: MarcaComContrato[],
  percentual: number,
): LinhaComissaoContrato[] {
  const fracao = percentual / 100;

  return marcas
    .map((linha) => {
      const valorBase = valorDaBase(linha, linha.baseComissao);
      const comissao = valorBase * fracao;
      const comissaoSeSobreReceitaReal = linha.receitaReal * fracao;

      return {
        ...linha,
        valorBase,
        comissao,
        comissaoSeSobreReceitaReal,
        aMaisQueSobreReceitaReal: comissao - comissaoSeSobreReceitaReal,
      };
    })
    // Maior distancia entre as bases primeiro: e a marca onde a escolha da
    // base pesa mais. Empate desempata pela comissao, a maior na frente.
    .sort(
      (a, b) =>
        b.aMaisQueSobreReceitaReal - a.aMaisQueSobreReceitaReal ||
        b.comissao - a.comissao,
    );
}

/**
 * Quanto cada MODALIDADE de contrato esta pagando de comissao.
 *
 * O simulador respondia "quanto sai no total" e "quanto sairia se tudo fosse
 * sobre a receita real". Faltava a pergunta do meio, que e a que decide a
 * conversa: das tres bases que os contratos usam hoje, quanto cada uma
 * representa do que esta sendo efetivamente pago.
 *
 * Sem essa quebra, os R$ 912 mil parecem um numero unico com uma regra unica.
 * Com ela fica visivel que quase tudo vem de uma base so, e que e ali que a
 * negociacao tem efeito.
 */
export interface ComissaoPorBase {
  base: BaseComissao;
  /** Comissao efetivamente devida pelos contratos nesta base. */
  comissao: number;
  /** Soma dos valores sobre os quais o percentual incide. */
  valorDaBase: number;
  /** Fracao da comissao total do periodo que sai desta base. */
  participacao: number;
  /** Marcas cujo contrato usa esta base, em ordem alfabetica. */
  marcas: string[];
  /** A mesma comissao, se estas marcas fossem sobre a receita real. */
  comissaoSeSobreReceitaReal: number;
  /**
   * Quanto esta base acrescenta em relacao a receita real.
   *
   * Zero na propria `receitaReal` -- ali nao ha duas bases para comparar, e
   * essa e a leitura util: a diferenca do mes nasce nas outras duas.
   */
  aMaisQueSobreReceitaReal: number;
}

/** Ordem canonica: do mais distante do caixa para o mais proximo. */
const ORDEM_DAS_BASES: BaseComissao[] = ["bruto", "recebido", "receitaReal", "liquido"];

/**
 * Agrupa as linhas por base de contrato.
 *
 * Base que nenhum contrato usa NAO entra no resultado. Um cartao "Sobre a
 * receita real -- R$ 0,00" afirmaria que existe uma modalidade rendendo zero,
 * quando o que existe e nenhuma marca nela.
 */
export function agruparComissoesPorBase(
  linhas: LinhaComissaoContrato[],
): ComissaoPorBase[] {
  const totalGeral = linhas.reduce((soma, l) => soma + l.comissao, 0);

  return ORDEM_DAS_BASES.flatMap((base) => {
    const doGrupo = linhas.filter((l) => l.baseComissao === base);
    if (doGrupo.length === 0) return [];

    const comissao = doGrupo.reduce((soma, l) => soma + l.comissao, 0);
    const sobreReal = doGrupo.reduce(
      (soma, l) => soma + l.comissaoSeSobreReceitaReal,
      0,
    );

    return [
      {
        base,
        comissao,
        valorDaBase: doGrupo.reduce((soma, l) => soma + l.valorBase, 0),
        participacao: razaoSegura(comissao, totalGeral),
        marcas: doGrupo
          .map((l) => l.marca)
          .sort((a, b) => a.localeCompare(b, "pt-BR")),
        comissaoSeSobreReceitaReal: sobreReal,
        aMaisQueSobreReceitaReal: comissao - sobreReal,
      },
    ];
  });
}

export interface TotalComissaoContratos {
  bruto: number;
  naoPago: number;
  recebido: number;
  receitaReal: number;
  /** Soma das comissoes, cada marca na base do seu contrato. */
  comissao: number;
  /** Soma das comissoes se TODAS fossem sobre a receita real. */
  comissaoSeSobreReceitaReal: number;
  /** Distancia entre os dois totais no mes. */
  aMaisQueSobreReceitaReal: number;
  /** Distancia mensal x 12, mantendo o percentual. */
  projecaoAnual: number;
}

export function somarComissoesDeContratos(
  linhas: LinhaComissaoContrato[],
): TotalComissaoContratos {
  const total = linhas.reduce(
    (acc, l) => ({
      bruto: acc.bruto + l.bruto,
      naoPago: acc.naoPago + l.naoPago,
      recebido: acc.recebido + l.recebido,
      receitaReal: acc.receitaReal + l.receitaReal,
      comissao: acc.comissao + l.comissao,
      comissaoSeSobreReceitaReal:
        acc.comissaoSeSobreReceitaReal + l.comissaoSeSobreReceitaReal,
    }),
    {
      bruto: 0,
      naoPago: 0,
      recebido: 0,
      receitaReal: 0,
      comissao: 0,
      comissaoSeSobreReceitaReal: 0,
    },
  );

  const aMais = total.comissao - total.comissaoSeSobreReceitaReal;

  return { ...total, aMaisQueSobreReceitaReal: aMais, projecaoAnual: aMais * 12 };
}
