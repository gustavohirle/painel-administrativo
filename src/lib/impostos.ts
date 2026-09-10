/**
 * Aplicacao dos impostos sobre os pedidos. Funcoes PURAS.
 *
 * A apuracao e POR INFLUENCER, nao global. Cada influencer tem a sua marca, a
 * sua loja e os seus produtos, e na pratica e uma operacao separada -- com
 * regime tributario proprio. Uma marca de R$ 300 mil/mes cabe no Simples; uma
 * de R$ 900 mil/mes nao cabe. Apurar tudo junto daria um numero que nao
 * corresponde a nenhuma das duas.
 *
 * Tres decisoes que valem ser lidas antes de mexer aqui:
 *
 * 1. A base e o RECEBIDO, nao o faturado. Pedido cancelado nao gera receita
 *    tributavel, e boleto nunca pago tambem nao, no regime de caixa.
 *
 * 2. O que esta DENTRO do DAS nunca soma no total. A guia unica ja e um valor
 *    fechado; a quebra por tributo existe so para leitura.
 *
 * 3. Tributo do regime que esta INATIVO nao some em silencio -- ele volta em
 *    `inativosDoRegime` para a tela poder dizer "o ICMS nao esta nesta conta".
 */

import { paraNumero, type Pedido } from "@/types/nuvemshop";
import type { Influencer } from "@/types/dominio";
import type {
  ConfiguracaoFiscal,
  EsferaImposto,
  Imposto,
  RegimeTributario,
} from "@/types/fiscal";
import { chaveProduto, type ChaveProduto, type Produto } from "@/types/produto";
import { razaoSegura } from "@/lib/format";
import { chaveMes, pedidosRecebidos, reconciliar } from "@/lib/metrics";
import {
  apurarSimples,
  monitorarTeto,
  type ApuracaoSimples,
  type MonitorTeto,
} from "@/lib/simplesNacional";

// ---------------------------------------------------------------------------
// Indice do cadastro de produtos
// ---------------------------------------------------------------------------

export interface IndiceProdutos {
  porVariante: Map<ChaveProduto, Produto>;
  porProduto: Map<number, Produto>;
}

export function indexarProdutos(produtos: Produto[]): IndiceProdutos {
  const porVariante = new Map<ChaveProduto, Produto>();
  const porProduto = new Map<number, Produto>();

  for (const produto of produtos) {
    if (!produto.ativo) continue;
    if (produto.varianteId === null) porProduto.set(produto.produtoId, produto);
    else porVariante.set(produto.chave, produto);
  }

  return { porVariante, porProduto };
}

/**
 * Cadastro de um item vendido, ou `null`.
 *
 * Assim como no custo, a ficha da variante tem precedencia sobre a do produto
 * inteiro: NCM e ICMS-ST podem mudar entre tamanhos do mesmo produto.
 */
export function produtoDoItem(
  indice: IndiceProdutos,
  produtoId: number,
  varianteId: number,
): Produto | null {
  return (
    indice.porVariante.get(chaveProduto(produtoId, varianteId)) ??
    indice.porProduto.get(produtoId) ??
    null
  );
}

// ---------------------------------------------------------------------------
// Impostos sugeridos por regime
// ---------------------------------------------------------------------------

/**
 * Impostos que incidem automaticamente num regime.
 *
 * E o que faz o cadastro de produto se preencher sozinho: escolhido o
 * influencer, o painel sabe o regime dele e ja marca estes. Continuam
 * editaveis -- o cadastro sugere, quem entende decide.
 */
export function impostosDoRegime(
  impostos: Imposto[],
  regime: RegimeTributario,
): Imposto[] {
  return impostos.filter((i) => i.regimes.includes(regime));
}

/** Ids sugeridos para um produto, dado o regime do influencer dono. */
export function idsSugeridosPorRegime(
  impostos: Imposto[],
  regime: RegimeTributario,
): string[] {
  return impostosDoRegime(impostos, regime).map((i) => i.id);
}

// ---------------------------------------------------------------------------
// RBT12
// ---------------------------------------------------------------------------

export interface ResultadoRBT12 {
  valor: number;
  /** Quantos meses de historico entraram na conta. */
  mesesConsiderados: number;
  /** `true` quando faltavam meses e o valor foi projetado para 12. */
  projetado: boolean;
  origem: "informado" | "historico" | "projecao";
}

/**
 * Receita bruta dos ultimos 12 meses.
 *
 * Com menos de 12 meses de historico, projeta pela media -- e o que a propria
 * legislacao manda a empresa nova fazer. O painel sinaliza que houve projecao
 * em vez de apresentar o numero como se fosse historico fechado.
 */
export function calcularRBT12(
  pedidos: Pedido[],
  rbt12Manual: number | null,
): ResultadoRBT12 {
  if (rbt12Manual !== null && rbt12Manual > 0) {
    return {
      valor: rbt12Manual,
      mesesConsiderados: 12,
      projetado: false,
      origem: "informado",
    };
  }

  const porMes = new Map<string, Pedido[]>();
  for (const pedido of pedidos) {
    const mes = chaveMes(pedido.created_at);
    const lista = porMes.get(mes);
    if (lista) lista.push(pedido);
    else porMes.set(mes, [pedido]);
  }

  const meses = [...porMes.keys()].sort((a, b) => b.localeCompare(a)).slice(0, 12);
  const soma = meses.reduce(
    (total, mes) => total + reconciliar(porMes.get(mes)!).recebido,
    0,
  );

  if (meses.length === 0) {
    return { valor: 0, mesesConsiderados: 0, projetado: false, origem: "historico" };
  }

  if (meses.length < 12) {
    return {
      valor: (soma / meses.length) * 12,
      mesesConsiderados: meses.length,
      projetado: true,
      origem: "projecao",
    };
  }

  return { valor: soma, mesesConsiderados: 12, projetado: false, origem: "historico" };
}

// ---------------------------------------------------------------------------
// Apuracao
// ---------------------------------------------------------------------------

export interface LinhaImposto {
  impostoId: string;
  sigla: string;
  nome: string;
  esfera: EsferaImposto;
  /** Percentual aplicado. */
  aliquota: number;
  /** Valor sobre o qual a aliquota incidiu. */
  base: number;
  valor: number;
  /** `false` enquanto ninguem confirmou a aliquota com o contador. */
  confirmado: boolean;
  /** `true` quando o imposto so vale para os produtos que o marcaram. */
  porProduto: boolean;
}

export interface ApuracaoDeUmInfluencer {
  /** `null` quando os pedidos nao pertencem a nenhum influencer cadastrado. */
  influencerId: string | null;
  nome: string;
  marca: string;
  regime: RegimeTributario;
  /** Receita que serviu de base. */
  baseReceita: number;

  rbt12: ResultadoRBT12;
  /** DAS do mes. `null` fora do Simples. */
  simples: ApuracaoSimples | null;
  monitorTeto: MonitorTeto | null;

  /** Tributos que somam, fora da guia unica. */
  linhas: LinhaImposto[];
  /** Quebra do que ha dentro do DAS. Detalhamento: NAO soma. */
  detalheDoDAS: LinhaImposto[];

  /**
   * Tributos do regime que estao INATIVOS no cadastro.
   *
   * Existem para a tela poder dizer "o ICMS nao esta nesta conta" em vez de
   * apresentar um total menor sem explicar por que.
   */
  inativosDoRegime: Array<{ sigla: string; nome: string; observacao: string | null }>;

  total: number;
  cargaSobreReceita: number;
}

export interface ResultadoImpostos {
  /** Uma apuracao por influencer, cada uma no seu regime. */
  porInfluencer: ApuracaoDeUmInfluencer[];

  /** Soma das bases de todas as apuracoes. */
  baseReceita: number;
  /** Soma de tudo que e recolhido. */
  totalSobreVenda: number;
  /** Fracao da receita que vira imposto, no consolidado. */
  cargaSobreReceita: number;

  /** Receita de itens sem cadastro fiscal -- lacuna declarada, nao escondida. */
  receitaSemCadastro: number;
  produtosSemCadastro: number;
  /** Fracao da receita coberta por cadastro fiscal. */
  cobertura: number;

  /** `true` se algum imposto usado ainda nao passou pelo contador. */
  temImpostoNaoConfirmado: boolean;
  /** `true` se algum regime tem tributo relevante desativado. */
  temTributoDoRegimeInativo: boolean;
}

/** Receita por imposto marcado, dentro de um conjunto de pedidos. */
function receitaPorImposto(
  pedidos: Pedido[],
  indice: IndiceProdutos,
): Map<string, number> {
  const mapa = new Map<string, number>();

  for (const pedido of pedidosRecebidos(pedidos)) {
    for (const item of pedido.products) {
      const produto = produtoDoItem(indice, item.product_id, item.variant_id);
      if (!produto) continue;

      const receitaItem = paraNumero(item.price) * item.quantity;
      for (const impostoId of produto.impostosIds) {
        mapa.set(impostoId, (mapa.get(impostoId) ?? 0) + receitaItem);
      }
    }
  }

  return mapa;
}

/** Apura um unico grupo (um influencer, ou a sobra sem influencer). */
function apurarGrupo(
  identidade: { influencerId: string | null; nome: string; marca: string },
  fiscal: {
    regime: RegimeTributario;
    rbt12Manual: number | null;
  },
  pedidosDoMes: Pedido[],
  pedidosHistorico: Pedido[],
  indice: IndiceProdutos,
  impostos: Imposto[],
): ApuracaoDeUmInfluencer {
  const baseReceita = reconciliar(pedidosDoMes).recebido;
  const doRegime = impostosDoRegime(impostos, fiscal.regime);
  const porImposto = receitaPorImposto(pedidosDoMes, indice);

  const noSimples = fiscal.regime === "simples_nacional";
  const rbt12 = calcularRBT12(pedidosHistorico, fiscal.rbt12Manual);
  const simples = noSimples ? apurarSimples(rbt12.valor, baseReceita) : null;
  const monitorTeto = noSimples ? monitorarTeto(rbt12.valor) : null;

  // --- Tributos que somam ---------------------------------------------------
  const linhas: LinhaImposto[] = [];

  for (const imposto of doRegime) {
    if (!imposto.ativo || imposto.dentroDoDAS) continue;

    const base =
      imposto.baseIncidencia === "lucro"
        ? // Base presumida: um percentual da receita, menos a deducao mensal
          // (o adicional de IRPJ so incide sobre o que passa de R$ 20 mil).
          Math.max(
            0,
            (baseReceita * (imposto.percentualPresuncao ?? 100)) / 100 -
              (imposto.deducaoMensal ?? 0),
          )
        : imposto.aplicacaoPorProduto
          ? (porImposto.get(imposto.id) ?? 0)
          : baseReceita;

    if (base <= 0 || imposto.aliquota <= 0) continue;

    linhas.push({
      impostoId: imposto.id,
      sigla: imposto.sigla,
      nome: imposto.nome,
      esfera: imposto.esfera,
      aliquota: imposto.aliquota,
      base,
      valor: (base * imposto.aliquota) / 100,
      confirmado: imposto.confirmadoPeloContador,
      porProduto: imposto.aplicacaoPorProduto,
    });
  }

  if (simples) {
    linhas.unshift({
      impostoId: `das-${identidade.influencerId ?? "geral"}`,
      sigla: "DAS",
      nome: "Simples Nacional (guia unica)",
      esfera: "federal",
      aliquota: simples.aliquotaEfetiva,
      base: simples.baseDoMes,
      valor: simples.valorDAS,
      confirmado: true,
      porProduto: false,
    });
  }

  // --- Detalhamento da guia unica ------------------------------------------
  const detalheDoDAS: LinhaImposto[] = simples
    ? simples.composicao.map((t) => ({
        impostoId: `das-${identidade.influencerId ?? "geral"}-${t.sigla}`,
        sigla: t.sigla,
        nome: t.nome,
        esfera: t.sigla === "ICMS" ? ("estadual" as const) : ("federal" as const),
        aliquota: t.aliquotaSobreReceita,
        base: baseReceita,
        valor: t.valor,
        confirmado: true,
        porProduto: false,
      }))
    : [];

  // --- Lacunas declaradas ---------------------------------------------------
  const inativosDoRegime = doRegime
    .filter((i) => !i.ativo || i.aliquota <= 0)
    .map((i) => ({ sigla: i.sigla, nome: i.nome, observacao: i.observacao }));

  const total = linhas.reduce((s, l) => s + l.valor, 0);

  return {
    ...identidade,
    regime: fiscal.regime,
    baseReceita,
    rbt12,
    simples,
    monitorTeto,
    linhas: linhas.sort((a, b) => b.valor - a.valor),
    detalheDoDAS,
    inativosDoRegime,
    total,
    cargaSobreReceita: razaoSegura(total, baseReceita),
  };
}

/**
 * Apura os impostos do periodo, um grupo por influencer.
 *
 * `pedidosHistorico` e a base inteira: o RBT12 olha 12 meses para tras, nao so
 * o mes da tela -- e olha por marca, nao no consolidado.
 */
export function apurarImpostos(
  pedidosDoMes: Pedido[],
  pedidosHistorico: Pedido[],
  produtos: Produto[],
  impostos: Imposto[],
  influencers: Influencer[],
  configPadrao: ConfiguracaoFiscal,
): ResultadoImpostos {
  const indice = indexarProdutos(produtos);

  // Um influencer por marca. Havendo mais de um cadastrado para a mesma marca,
  // o primeiro ativo manda -- produto pertence a um influencer so.
  const influencerDaMarca = new Map<string, Influencer>();
  for (const influencer of influencers) {
    if (!influencer.ativo) continue;
    if (!influencerDaMarca.has(influencer.marca)) {
      influencerDaMarca.set(influencer.marca, influencer);
    }
  }

  const marcas = [...new Set(pedidosDoMes.map((p) => p.marca))].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );

  const porInfluencer = marcas.map((marca) => {
    const influencer = influencerDaMarca.get(marca) ?? null;
    const doMes = pedidosDoMes.filter((p) => p.marca === marca);
    const historico = pedidosHistorico.filter((p) => p.marca === marca);

    return apurarGrupo(
      {
        influencerId: influencer?.id ?? null,
        nome: influencer?.nome ?? "Sem influencer vinculado",
        marca,
      },
      {
        regime: influencer?.regime ?? configPadrao.regime,
        rbt12Manual: influencer?.rbt12Manual ?? configPadrao.rbt12Manual,
      },
      doMes,
      historico,
      indice,
      impostos,
    );
  });

  // --- Cobertura do cadastro fiscal ----------------------------------------
  let receitaSemCadastro = 0;
  let receitaComCadastro = 0;
  const semCadastro = new Set<number>();

  for (const pedido of pedidosRecebidos(pedidosDoMes)) {
    for (const item of pedido.products) {
      const receitaItem = paraNumero(item.price) * item.quantity;
      const produto = produtoDoItem(indice, item.product_id, item.variant_id);

      if (produto) receitaComCadastro += receitaItem;
      else {
        receitaSemCadastro += receitaItem;
        semCadastro.add(item.product_id);
      }
    }
  }

  const baseReceita = porInfluencer.reduce((s, a) => s + a.baseReceita, 0);
  const totalSobreVenda = porInfluencer.reduce((s, a) => s + a.total, 0);
  const receitaTotal = receitaComCadastro + receitaSemCadastro;

  return {
    porInfluencer: porInfluencer.sort((a, b) => b.total - a.total),
    baseReceita,
    totalSobreVenda,
    cargaSobreReceita: razaoSegura(totalSobreVenda, baseReceita),
    receitaSemCadastro,
    produtosSemCadastro: semCadastro.size,
    cobertura: razaoSegura(receitaComCadastro, receitaTotal),
    temImpostoNaoConfirmado: porInfluencer.some((a) =>
      a.linhas.some((l) => !l.confirmado),
    ),
    temTributoDoRegimeInativo: porInfluencer.some(
      (a) => a.inativosDoRegime.length > 0,
    ),
  };
}

/** Consolida as linhas de todas as apuracoes, somando por sigla. */
export function linhasConsolidadas(resultado: ResultadoImpostos): LinhaImposto[] {
  const porSigla = new Map<string, LinhaImposto>();

  for (const apuracao of resultado.porInfluencer) {
    for (const linha of apuracao.linhas) {
      const atual = porSigla.get(linha.sigla);
      if (atual) {
        atual.base += linha.base;
        atual.valor += linha.valor;
        atual.confirmado = atual.confirmado && linha.confirmado;
      } else {
        porSigla.set(linha.sigla, { ...linha, impostoId: linha.sigla });
      }
    }
  }

  return [...porSigla.values()].sort((a, b) => b.valor - a.valor);
}
