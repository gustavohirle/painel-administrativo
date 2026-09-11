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

import { paraNumero, type Pedido } from "@/types/nuvemshop";
import {
  custoUnitarioTotal,
  type BaseComissao,
  type CustoProduto,
  type Influencer,
} from "@/types/dominio";
import {
  partesDaChave,
  PROFUNDIDADE_MAXIMA_KIT,
  type Produto,
} from "@/types/produto";
import { razaoSegura } from "@/lib/format";
import {
  pedidosRecebidos,
  reconciliar,
  type LinhaMarca,
  type Reconciliacao,
} from "@/lib/metrics";
import {
  indexarProdutos,
  produtoDoItem,
  type IndiceProdutos,
  type ResultadoImpostos,
} from "@/lib/impostos";

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
 */
export function calcularComissoesPorInfluencer(
  pedidos: Pedido[],
  influencers: Influencer[],
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
    const valorBase =
      influencer.baseComissao === "bruto"
        ? r.bruto
        : influencer.baseComissao === "recebido"
          ? r.recebido
          : r.receitaReal;

    const valorComissao = valorBase * fracao;
    const comissaoSeSobreBruto = r.bruto * fracao;

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

export function totalComissoes(linhas: ComissaoInfluencer[]): number {
  return linhas.reduce((soma, l) => soma + l.valorComissao, 0);
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

  /** Apuracao fiscal do periodo. `null` quando nao ha cadastro de impostos. */
  impostos: ResultadoImpostos | null;
  /** DAS + tributos fora da guia unica. */
  totalImpostos: number;
  /**
   * receitaReal - impostos.
   *
   * Repare que `receitaReal` continua sendo `recebido - frete`, como manda a
   * secao 5.1: e o numero que sustenta a comparacao de comissao. O imposto
   * entra como uma deducao DEPOIS dele, para nao mexer naquela tese.
   */
  receitaLiquida: number;

  /** receitaLiquida - cmv */
  margemContribuicao: number;
  /** Fracao: margemContribuicao / receitaReal */
  margemContribuicaoPercentual: number;
  /** margemContribuicao - totalComissoes */
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
}

export function montarDemonstrativo(
  pedidos: Pedido[],
  custos: CustoProduto[],
  influencers: Influencer[],
  opcoes: OpcoesDemonstrativo = {},
): DemonstrativoResultado {
  const reconciliacao = reconciliar(pedidos);
  const cmv = calcularCMV(pedidos, custos, opcoes.produtos ?? []);
  const comissoes = calcularComissoesPorInfluencer(pedidos, influencers);
  const total = totalComissoes(comissoes);

  const impostos = opcoes.impostos ?? null;
  const totalImpostos = impostos?.totalSobreVenda ?? 0;

  const receitaLiquida = reconciliacao.receitaReal - totalImpostos;
  const margemContribuicao = receitaLiquida - cmv.cmv;
  const lucroOperacional = margemContribuicao - total;

  return {
    reconciliacao,
    cmv,
    comissoes,
    totalComissoes: total,
    impostos,
    totalImpostos,
    receitaLiquida,
    margemContribuicao,
    margemContribuicaoPercentual: razaoSegura(
      margemContribuicao,
      reconciliacao.receitaReal,
    ),
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
  }

  const mapa = new Map<number, Acumulado>();

  for (const pedido of pedidosRecebidos(pedidos)) {
    for (const item of pedido.products) {
      let acc = mapa.get(item.product_id);
      if (!acc) {
        acc = {
          nome: item.name,
          sku: item.sku,
          unidades: 0,
          receita: 0,
          custo: 0,
          unidadesComCusto: 0,
        };
        mapa.set(item.product_id, acc);
      }

      acc.unidades += item.quantity;
      acc.receita += paraNumero(item.price) * item.quantity;

      const unitario = custoUnitarioComKit(
        indice,
        indiceProdutos,
        item.product_id,
        item.variant_id,
      );
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
}

/**
 * Base do contrato de uma marca sem influencer ativo vinculado.
 *
 * `bruto` de proposito: e o que o cliente faz hoje, e assumir a base mais
 * favorravel a empresa mostraria uma comissao menor do que a que ele paga.
 */
export const BASE_SEM_CONTRATO: BaseComissao = "bruto";

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
export function valorDaBase(linha: LinhaMarca, base: BaseComissao): number {
  if (base === "bruto") return linha.bruto;
  if (base === "recebido") return linha.recebido;
  return linha.receitaReal;
}

/**
 * Aplica o percentual do simulador sobre a base de cada contrato.
 *
 * O percentual vem do simulador e nao do contrato de proposito (seccao 5.2): o
 * cliente quer testar cenarios na reuniao. A BASE, essa sim, e sempre a do
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
