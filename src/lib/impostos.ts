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
 * 1. A base e o FATURADO: o valor de TODO pedido criado no mes, com o frete
 *    cobrado do cliente, pago ou nao. Vale para TODO tributo -- DAS, PIS,
 *    COFINS, ICMS, IRPJ, CSLL e DIFAL -- e para o RBT12, entao a faixa do
 *    Simples acompanha.
 *
 *    Duas decisoes do dono, no mesmo dia (18/09/2026): primeiro o frete
 *    entrou na base (na legislacao o frete cobrado do destinatario integra a
 *    base do ICMS, do PIS/COFINS e a receita bruta do Simples), depois a base
 *    passou do recebido para o faturado.
 *
 *    RESSALVA REGISTRADA: pedido cancelado e boleto nunca pago normalmente
 *    nao geram nota nem saida de mercadoria, e tributa-los cobra imposto de
 *    venda que nao aconteceu. O painel passa a superestimar o imposto nessa
 *    medida. Foi dito ao dono e ele manteve a decisao -- so mude de volta se
 *    ele pedir.
 *
 *    A COMISSAO do influencer NAO acompanhou: ela continua sobre o que cai na
 *    conta, sem frete (5.1.2). Sao decisoes separadas, e mexer numa nao
 *    autoriza mexer na outra.
 *
 * 2. O que esta DENTRO do DAS nunca soma no total. A guia unica ja e um valor
 *    fechado; a quebra por tributo existe so para leitura.
 *
 * 3. Tributo do regime que esta INATIVO nao some em silencio -- ele volta em
 *    `inativosDoRegime` para a tela poder dizer "o ICMS nao esta nesta conta".
 *
 * 4. No SIMPLES, o RBT12 e da EMPRESA, nao da marca (23/09/2026). As marcas do
 *    Simples sao lojas do mesmo CNPJ, e o RBT12, a faixa e os limites do
 *    regime sao do CNPJ: somam-se os faturamentos de todas elas, e todas caem
 *    na MESMA faixa. Ver `apurarImpostos`.
 */

import { paraNumero, type Pedido } from "@/types/nuvemshop";
import type { Influencer } from "@/types/dominio";
import type {
  AliquotaEstado,
  EsferaImposto,
  Imposto,
  RegimeTributario,
} from "@/types/fiscal";
import { REGIME_SEM_INFLUENCER } from "@/lib/config";
import { chaveProduto, type ChaveProduto, type Produto } from "@/types/produto";
import { razaoSegura } from "@/lib/format";
import { apurarDifal, somarDifal, type ResultadoDifal } from "@/lib/difal";
import { chaveMes, reconciliar } from "@/lib/metrics";
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
 * É o que faz o cadastro de produto se preencher sozinho: escolhido o
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

/**
 * Os tributos que ja nascem MARCADOS num produto do regime.
 *
 * E so a sugestao: quem marca de verdade e quem cadastra. `aplicacaoPorProduto`
 * passou a significar exatamente isso -- "vem marcado" --, porque a conta nao
 * o le mais: desde 16/09/2026 todo tributo sobre receita incide apenas onde o
 * produto o marcou (`apurarGrupo`).
 *
 * No Lucro Presumido isso deixa ICMS, ICMS-ST e IPI: os que dependem do NCM.
 * PIS e COFINS ficam desmarcados, por decisao do cliente, e passam a valer
 * assim que ele marcar. Aliquota zero entra marcada de proposito: nao muda o
 * total hoje e deixa o produto pronto para quando a aliquota chegar.
 */
export function idsMarcadosPorPadrao(
  impostos: Imposto[],
  regime: RegimeTributario,
): string[] {
  return impostosDoRegime(impostos, regime)
    .filter((i) => i.aplicacaoPorProduto && i.ativo)
    .map((i) => i.id);
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
    // Faturado COM frete, a mesma base do imposto do mes (decisao 1).
    (total, mes) => total + reconciliar(porMes.get(mes)!).bruto,
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
  /**
   * `true` quando o RBT12 acima e o da EMPRESA -- somado das marcas do
   * Simples -- e nao o desta marca sozinha. A tela precisa dizer isso: sem
   * aviso, o RBT12 de uma loja de R$ 23 mil/mes apareceria em milhoes e
   * pareceria defeito.
   */
  rbt12Compartilhado: boolean;
  /** DAS do mes. `null` fora do Simples. */
  simples: ApuracaoSimples | null;
  monitorTeto: MonitorTeto | null;

  /**
   * DIFAL desta marca, aberto por estado de destino.
   *
   * Ja entra em `linhas` como uma linha unica; este campo existe para a tela
   * poder mostrar de quais estados o valor veio.
   */
  difal: ResultadoDifal;

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

/**
 * O grupo do Simples Nacional: as marcas que dividem o mesmo CNPJ e, com ele,
 * o mesmo RBT12, a mesma faixa e os mesmos limites do regime.
 *
 * `null` quando nenhuma marca do mes esta no Simples.
 */
export interface GrupoSimples {
  /** Marcas do Simples, na ordem em que aparecem na apuracao. */
  marcas: string[];
  /** RBT12 da empresa: soma dos ultimos 12 meses de TODAS as marcas acima. */
  rbt12: ResultadoRBT12;
  faixa: number;
  aliquotaNominal: number;
  /** A mesma para todas as marcas -- e o que a decisao 4 garante. */
  aliquotaEfetiva: number;
  /** Faturamento do mes somado das marcas do grupo. */
  baseDoMes: number;
  /** DAS do mes da empresa: a soma do DAS das marcas. */
  valorDAS: number;
  /** Sublimite de ICMS e teto do regime, medidos no RBT12 da empresa. */
  monitorTeto: MonitorTeto;
}

export interface ResultadoImpostos {
  /** Uma apuracao por influencer, cada uma no seu regime. */
  porInfluencer: ApuracaoDeUmInfluencer[];

  /**
   * As marcas do Simples vistas como a empresa unica que elas sao. `null`
   * quando nenhuma marca do mes esta no regime.
   */
  grupoSimples: GrupoSimples | null;

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

  /** DIFAL consolidado de todas as marcas, por estado de destino. */
  difal: ResultadoDifal;
}

/** Receita por imposto marcado, dentro de um conjunto de pedidos. */
/**
 * Base de cada item do pedido: preco x quantidade MAIS a parte do frete.
 *
 * O frete e cobrado do PEDIDO e o tributo por produto incide sobre o ITEM,
 * entao ele precisa ser rateado. O criterio e o valor, que e o mesmo da taxa
 * de plataforma na margem por produto (5.13.1) e nao exige arbitragem: um item
 * que vale metade do pedido carrega metade do frete.
 *
 * Pedido so de brinde (itens a R$ 0) nao tem por onde ratear -- ali o frete
 * fica fora da base, em vez de virar uma divisao por zero ou uma parte igual
 * que cobraria imposto de quem nao faturou nada.
 */
function basesDosItens(pedido: Pedido): Array<{
  item: Pedido["products"][number];
  base: number;
}> {
  const itens = pedido.products.map((item) => ({
    item,
    receita: paraNumero(item.price) * item.quantity,
  }));
  const soma = itens.reduce((s, i) => s + i.receita, 0);
  const frete = paraNumero(pedido.shipping_cost_customer);

  if (soma <= 0 || frete <= 0) return itens.map(({ item, receita }) => ({ item, base: receita }));
  return itens.map(({ item, receita }) => ({
    item,
    base: receita + (frete * receita) / soma,
  }));
}

function receitaPorImposto(
  pedidos: Pedido[],
  indice: IndiceProdutos,
): Map<string, number> {
  const mapa = new Map<string, number>();

  // TODO pedido criado, pago ou nao: a base e o faturado (decisao 1).
  for (const pedido of pedidos) {
    for (const { item, base } of basesDosItens(pedido)) {
      const produto = produtoDoItem(indice, item.product_id, item.variant_id);
      if (!produto) continue;

      for (const impostoId of produto.impostosIds) {
        mapa.set(impostoId, (mapa.get(impostoId) ?? 0) + base);
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
    uf: string;
    rbt12Manual: number | null;
  },
  pedidosDoMes: Pedido[],
  pedidosHistorico: Pedido[],
  indice: IndiceProdutos,
  impostos: Imposto[],
  aliquotasEstaduais: AliquotaEstado[],
  /**
   * RBT12 da EMPRESA, quando este grupo esta no Simples. Vem pronto de
   * `apurarImpostos`, somado de todas as marcas do regime: o RBT12 e do CNPJ,
   * e nao de cada loja.
   */
  rbt12DoGrupo: ResultadoRBT12 | null,
): ApuracaoDeUmInfluencer {
  // Faturado: todo pedido criado, com o frete (decisao 1 no topo).
  const r = reconciliar(pedidosDoMes);
  const baseReceita = r.bruto;
  const doRegime = impostosDoRegime(impostos, fiscal.regime);
  const porImposto = receitaPorImposto(pedidosDoMes, indice);

  const noSimples = fiscal.regime === "simples_nacional";
  /*
   * No Simples vale o RBT12 da empresa; fora dele, o da propria marca -- que e
   * so referencia, porque no Lucro Presumido nao ha faixa nem teto.
   */
  const rbt12 =
    (noSimples ? rbt12DoGrupo : null) ?? calcularRBT12(pedidosHistorico, fiscal.rbt12Manual);

  /*
   * Optante do Simples nao recolhe DIFAL como remetente -- o STF suspendeu a
   * exigencia na ADI 5464. A apuracao roda mesmo assim, com valor zerado, para
   * a tela poder mostrar a distribuicao por estado das marcas do Simples.
   */
  const difal = apurarDifal(pedidosDoMes, aliquotasEstaduais, fiscal.uf, !noSimples);
  const simples = noSimples ? apurarSimples(rbt12.valor, baseReceita) : null;
  const monitorTeto = noSimples ? monitorarTeto(rbt12.valor) : null;

  // --- Tributos que somam ---------------------------------------------------
  const linhas: LinhaImposto[] = [];

  for (const imposto of doRegime) {
    if (!imposto.ativo || imposto.dentroDoDAS) continue;

    /*
     * Tributo sobre a RECEITA so incide onde o produto o marcou: e o cadastro
     * de produto que diz o que cada item paga. Nenhum produto marcado, nenhuma
     * base -- e a tela mostra a receita sem cadastro fiscal, para a lacuna nao
     * passar por "imposto baixo".
     *
     * Tributo sobre o LUCRO (IRPJ, CSLL) nao se reparte por produto: a base e
     * a presuncao sobre a receita da marca inteira, menos a deducao mensal (o
     * adicional de IRPJ so incide sobre o que passa de R$ 20 mil).
     */
    const base =
      imposto.baseIncidencia === "lucro"
        ? Math.max(
            0,
            (baseReceita * (imposto.percentualPresuncao ?? 100)) / 100 -
              (imposto.deducaoMensal ?? 0),
          )
        : (porImposto.get(imposto.id) ?? 0);

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
      // Depende da marcacao do produto? Todo tributo sobre receita depende.
      porProduto: imposto.baseIncidencia !== "lucro",
    });
  }

  if (difal.total > 0) {
    linhas.push({
      impostoId: `difal-${identidade.influencerId ?? "geral"}`,
      sigla: "DIFAL",
      nome: "Diferencial de aliquota de ICMS",
      esfera: "estadual",
      // Aliquota media efetiva: o DIFAL nao tem uma so, ele varia por destino.
      aliquota: (difal.total / (difal.baseInterestadual || 1)) * 100,
      base: difal.baseInterestadual,
      valor: difal.total,
      confirmado: !difal.temEstadoNaoConfirmado,
      porProduto: false,
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
    rbt12Compartilhado: noSimples && rbt12DoGrupo !== null,
    simples,
    monitorTeto,
    difal,
    linhas: linhas.sort((a, b) => b.valor - a.valor),
    detalheDoDAS,
    inativosDoRegime,
    total,
    cargaSobreReceita: razaoSegura(total, baseReceita),
  };
}

/**
 * RBT12 informado a mao para o grupo do Simples.
 *
 * O campo e por influencer, mas o numero e da EMPRESA: informar num contrato
 * basta. Divergindo entre dois, vale o MAIOR -- subestimar a faixa cobra
 * imposto a menos, que e o erro caro; e a divergencia fica visivel na tela,
 * porque o RBT12 exibido e o mesmo para todas as marcas.
 */
function rbt12ManualDoGrupo(
  marcas: string[],
  influencerDaMarca: Map<string, Influencer>,
): number | null {
  const informados = marcas
    .map((m) => influencerDaMarca.get(m)?.rbt12Manual ?? null)
    .filter((v): v is number => v !== null && v > 0);

  return informados.length ? Math.max(...informados) : null;
}

/**
 * Apura os impostos do periodo, um grupo por influencer.
 *
 * `pedidosHistorico` e a base inteira: o RBT12 olha 12 meses para tras, e nao
 * so o mes da tela.
 *
 * Fora do Simples ele e por marca, e serve so de referencia. DENTRO do
 * Simples ele e da empresa: soma das marcas do regime, uma faixa so para todas
 * (decisao 4 no topo).
 */
export function apurarImpostos(
  pedidosDoMes: Pedido[],
  pedidosHistorico: Pedido[],
  produtos: Produto[],
  impostos: Imposto[],
  influencers: Influencer[],
  aliquotasEstaduais: AliquotaEstado[] = [],
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

  const regimeDaMarca = (marca: string): RegimeTributario =>
    // Sem influencer nao ha regime proprio: cai no padrao ate alguem vincular
    // a marca a um influencer.
    influencerDaMarca.get(marca)?.regime ?? REGIME_SEM_INFLUENCER;

  /*
   * O RBT12 do SIMPLES e da EMPRESA, e nao de cada loja (23/09/2026, decisao
   * do dono). As marcas do Simples sao lojas Nuvemshop do mesmo CNPJ, e o
   * RBT12 -- com ele a faixa, a aliquota efetiva, o sublimite de ICMS e o teto
   * do regime -- e apurado por CNPJ. Uma marca por vez colocava cada loja numa
   * faixa propria, e quase sempre numa faixa mais BAIXA do que a devida: quatro
   * lojas de R$ 1 mi/ano cada nao sao quatro empresas na 2a faixa, sao uma
   * empresa de R$ 4 mi na 5a.
   *
   * O DAS continua saindo marca a marca (aliquota efetiva do grupo x base do
   * mes da marca). Como a aliquota e a mesma para todas, a soma das partes e
   * exatamente o DAS da empresa -- e assim o raio-x e o relatorio continuam
   * conseguindo atribuir imposto a uma marca. Ha teste.
   */
  /*
   * As marcas do grupo saem do CADASTRO, e nao dos pedidos do mes. E o que faz
   * o imposto de uma marca ser o mesmo na tela inicial e num relatorio
   * filtrado so nela: se o grupo fosse montado a partir dos pedidos em tela,
   * filtrar por "marca = Ka" apuraria o RBT12 so da Ka, numa faixa mais baixa,
   * e o painel teria duas versoes do mesmo numero (5.14).
   */
  const marcasNoSimples = [...influencerDaMarca.values()]
    .filter((i) => i.regime === "simples_nacional")
    .map((i) => i.marca)
    .sort((a, b) => a.localeCompare(b, "pt-BR"));

  const doSimples = new Set(marcasNoSimples);
  const rbt12DoGrupo = marcasNoSimples.length
    ? calcularRBT12(
        pedidosHistorico.filter((p) => doSimples.has(p.marca)),
        rbt12ManualDoGrupo(marcasNoSimples, influencerDaMarca),
      )
    : null;

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
        regime: regimeDaMarca(marca),
        uf: influencer?.uf ?? "GO",
        rbt12Manual: influencer?.rbt12Manual ?? null,
      },
      doMes,
      historico,
      indice,
      impostos,
      aliquotasEstaduais,
      rbt12DoGrupo,
    );
  });

  // --- Cobertura do cadastro fiscal ----------------------------------------
  let receitaSemCadastro = 0;
  let receitaComCadastro = 0;
  const semCadastro = new Set<number>();

  // Mesma base do tributo por produto -- todo pedido criado, frete rateado
  // incluido: senao a "receita sem cadastro fiscal" declararia uma lacuna
  // menor do que a real.
  for (const pedido of pedidosDoMes) {
    for (const { item, base } of basesDosItens(pedido)) {
      const produto = produtoDoItem(indice, item.product_id, item.variant_id);

      if (produto) receitaComCadastro += base;
      else {
        receitaSemCadastro += base;
        semCadastro.add(item.product_id);
      }
    }
  }

  const baseReceita = porInfluencer.reduce((s, a) => s + a.baseReceita, 0);
  const totalSobreVenda = porInfluencer.reduce((s, a) => s + a.total, 0);
  const receitaTotal = receitaComCadastro + receitaSemCadastro;

  const noSimples = porInfluencer.filter((a) => a.simples !== null);
  const primeiro = noSimples[0];
  const grupoSimples: GrupoSimples | null =
    primeiro && primeiro.simples && primeiro.monitorTeto && rbt12DoGrupo
      ? {
          // As marcas que formam o RBT12 -- todas as do regime, mesmo as que
          // nao venderam neste mes. Os totais abaixo sao das que venderam.
          marcas: marcasNoSimples,
          rbt12: rbt12DoGrupo,
          faixa: primeiro.simples.faixa,
          aliquotaNominal: primeiro.simples.aliquotaNominal,
          aliquotaEfetiva: primeiro.simples.aliquotaEfetiva,
          baseDoMes: noSimples.reduce((s, a) => s + a.baseReceita, 0),
          valorDAS: noSimples.reduce((s, a) => s + (a.simples?.valorDAS ?? 0), 0),
          monitorTeto: primeiro.monitorTeto,
        }
      : null;

  return {
    porInfluencer: porInfluencer.sort((a, b) => b.total - a.total),
    grupoSimples,
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
    difal: somarDifal(
      porInfluencer.map((a) => a.difal),
      porInfluencer[0]?.difal.ufOrigem ?? "GO",
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
