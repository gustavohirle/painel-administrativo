/**
 * Vocabulario dos relatorios: dimensoes, metricas e o que pode cruzar com o que.
 *
 * Mora em `types/` pelo mesmo motivo que `ROTULO_BASE` (secao 5.9): a tela de
 * relatorios e a de impressao falam das mesmas metricas, e dois textos
 * diferentes para a mesma conta fariam parecer que sao duas contas.
 *
 * Este arquivo nao calcula nada -- so nomeia. O calculo vive em
 * `lib/relatorios.ts`.
 */

// ---------------------------------------------------------------------------
// Dimensoes
// ---------------------------------------------------------------------------

/**
 * Por onde quebrar o periodo.
 *
 * Repare na divisao que sustenta todo o resto deste arquivo:
 *
 * - `marca`, `influencer`, `estado`, `pagamento` e `mes` PARTICIONAM pedidos:
 *   cada pedido cai em exatamente um grupo, entao somar os grupos devolve o
 *   total do periodo.
 * - `produto` NAO particiona: um pedido com tres produtos aparece em tres
 *   grupos. Somar "faturamento bruto por produto" contaria o mesmo frete tres
 *   vezes.
 *
 * E por isso que nem toda metrica vale para toda dimensao -- ver
 * `metricaDisponivel`.
 */
export type Dimensao =
  | "marca"
  | "influencer"
  | "estado"
  | "pagamento"
  | "mes"
  | "produto";

export const DIMENSOES: Dimensao[] = [
  "marca",
  "influencer",
  "estado",
  "pagamento",
  "mes",
  "produto",
];

export const ROTULO_DIMENSAO: Record<Dimensao, string> = {
  marca: "Marca",
  influencer: "Influencer",
  estado: "Estado de destino",
  pagamento: "Meio de pagamento",
  mes: "Mês",
  produto: "Produto",
};

/** Dimensoes em que cada pedido cai num grupo so. */
export const DIMENSOES_QUE_PARTICIONAM: Dimensao[] = [
  "marca",
  "influencer",
  "estado",
  "pagamento",
  "mes",
];

export function particionaPedidos(dimensao: Dimensao): boolean {
  return DIMENSOES_QUE_PARTICIONAM.includes(dimensao);
}

// ---------------------------------------------------------------------------
// Metricas
// ---------------------------------------------------------------------------

export type Metrica =
  | "pedidos"
  | "bruto"
  | "naoPago"
  | "percentualNaoPago"
  | "cancelado"
  | "reembolsado"
  | "recebido"
  | "frete"
  | "receitaReal"
  | "ticketMedio"
  | "unidades"
  | "receitaItens"
  | "cmv"
  | "margemContribuicao"
  | "margemItens"
  | "impostos"
  | "taxas"
  | "comissao"
  | "lucro"
  | "margemPercentual";

export const METRICAS: Metrica[] = [
  "pedidos",
  "bruto",
  "naoPago",
  "percentualNaoPago",
  "cancelado",
  "reembolsado",
  "recebido",
  "frete",
  "receitaReal",
  "ticketMedio",
  "unidades",
  "receitaItens",
  "cmv",
  "margemContribuicao",
  "margemItens",
  "impostos",
  "taxas",
  "comissao",
  "lucro",
  "margemPercentual",
];

export const ROTULO_METRICA: Record<Metrica, string> = {
  pedidos: "Pedidos",
  bruto: "Faturamento bruto",
  naoPago: "Não pago",
  percentualNaoPago: "% não pago",
  cancelado: "Cancelado",
  reembolsado: "Reembolsado",
  recebido: "Recebido",
  frete: "Frete",
  receitaReal: "Receita real",
  ticketMedio: "Ticket médio",
  unidades: "Unidades vendidas",
  receitaItens: "Receita dos itens",
  cmv: "Custo de fabricação",
  margemContribuicao: "Margem de contribuição",
  margemItens: "Margem bruta do item",
  impostos: "Impostos",
  taxas: "Taxa Nuvemshop",
  comissao: "Comissão",
  lucro: "Lucro operacional",
  margemPercentual: "Margem operacional",
};

/** Texto curto de apoio, para a coluna nao depender de o leitor adivinhar. */
export const EXPLICACAO_METRICA: Record<Metrica, string> = {
  pedidos: "Quantidade de pedidos criados no período.",
  bruto: "Tudo que foi pedido, incluindo o que nunca entrou.",
  naoPago: "Boleto e Pix gerados e nunca pagos.",
  percentualNaoPago: "Quanto do bruto nunca virou dinheiro.",
  cancelado: "Pedidos cancelados.",
  reembolsado: "Reembolsos e estornos.",
  recebido: "Bruto menos não pago, cancelado e reembolsado.",
  frete: "Frete cobrado do cliente nos pedidos recebidos.",
  receitaReal: "Recebido menos o frete. O número que sustenta a comissão.",
  ticketMedio: "Recebido dividido pelos pedidos recebidos.",
  unidades: "Unidades vendidas nos pedidos recebidos.",
  receitaItens: "Preço dos itens vendidos, sem frete e sem rateio de pedido.",
  cmv: "Matéria-prima, embalagem, mão de obra e rateio.",
  margemContribuicao: "Receita líquida de impostos, menos o custo de fabricar.",
  margemItens: "Receita dos itens menos o custo de fabricá-los. Antes de imposto e comissão.",
  impostos: "Tributos sobre a venda no período, DIFAL incluído.",
  taxas: "O que a plataforma e o gateway retiveram, por meio de pagamento.",
  comissao: "Comissão devida pelos contratos cadastrados.",
  lucro: "Margem de contribuição menos as comissões.",
  margemPercentual: "Lucro operacional sobre a receita real.",
};

export type FormatoMetrica = "moeda" | "inteiro" | "percentual";

export const FORMATO_METRICA: Record<Metrica, FormatoMetrica> = {
  pedidos: "inteiro",
  bruto: "moeda",
  naoPago: "moeda",
  percentualNaoPago: "percentual",
  cancelado: "moeda",
  reembolsado: "moeda",
  recebido: "moeda",
  frete: "moeda",
  receitaReal: "moeda",
  ticketMedio: "moeda",
  unidades: "inteiro",
  receitaItens: "moeda",
  cmv: "moeda",
  margemContribuicao: "moeda",
  margemItens: "moeda",
  impostos: "moeda",
  taxas: "moeda",
  comissao: "moeda",
  lucro: "moeda",
  margemPercentual: "percentual",
};

/**
 * Metricas que NAO podem ser somadas entre grupos (media e percentual).
 * A linha de total recalcula essas a partir dos acumulados, em vez de somar
 * as celulas -- somar percentual de cinco marcas daria 300%.
 */
export const METRICAS_NAO_SOMAVEIS: Metrica[] = [
  "percentualNaoPago",
  "ticketMedio",
  "margemPercentual",
];

// ---------------------------------------------------------------------------
// O que cruza com o que
// ---------------------------------------------------------------------------

/**
 * Metricas que so existem quando o grupo e uma marca inteira.
 *
 * O contrato de comissao e da MARCA (secao 5.2) e o regime tributario e do
 * INFLUENCER da marca (secao 5.10). Nao existe "a comissao de Sao Paulo" nem
 * "o DAS do cartao de credito": o contrato nao fala de estado, e a guia do
 * Simples e mensal sobre o recebido da marca, indivisivel por destino ou por
 * meio de pagamento.
 *
 * Ratear proporcionalmente produziria um numero plausivel e inventado --
 * exatamente o que a secao 8 do CLAUDE.md proibe. Entao a celula vem vazia,
 * com o motivo escrito.
 */
const METRICAS_QUE_EXIGEM_MARCA: Metrica[] = ["impostos", "comissao", "lucro", "margemPercentual"];

/**
 * Metricas que so existem no nivel do ITEM vendido.
 *
 * `receitaItens` e `margemItens` existem separadas de `receitaReal` e
 * `margemContribuicao` de proposito. Sao contas diferentes:
 *
 *   receitaReal        = recebido - frete           (do pedido inteiro)
 *   receitaItens       = soma de preco x quantidade (so dos itens)
 *   margemContribuicao = receitaLiquida - CMV       (ja depois de imposto)
 *   margemItens        = receitaItens - CMV         (antes de imposto)
 *
 * Dar o mesmo nome as duas faria parecer que o painel tem duas versoes da
 * mesma verdade quando os numeros nao batessem -- e eles nao batem, porque uma
 * inclui frete e imposto e a outra nao.
 */
const METRICAS_DE_ITEM: Metrica[] = ["unidades", "receitaItens", "cmv", "margemItens", "taxas"];

/** Dimensoes em que o grupo corresponde a uma marca inteira. */
const DIMENSOES_ALINHADAS_A_MARCA: Dimensao[] = ["marca", "influencer", "mes"];

/**
 * A metrica faz sentido nesta dimensao?
 *
 * E a regra que torna o relatorio "guiado": em vez de deixar montar um
 * cruzamento invalido e devolver um numero errado, a opcao aparece desmarcada
 * e explicada.
 */
export function metricaDisponivel(dimensao: Dimensao, metrica: Metrica): boolean {
  // Produto nao particiona pedidos: valor de pedido inteiro (bruto, frete,
  // ticket) nao e atribuivel a um produto sem um rateio inventado.
  if (dimensao === "produto") return METRICAS_DE_ITEM.includes(metrica);

  /*
   * A recroca NAO vale: metrica de item continua bem definida em qualquer
   * dimensao, porque os itens particionam dentro do grupo. A receita dos itens
   * de uma marca e a soma dos itens dos pedidos recebidos dela.
   *
   * Isso e o que permite descer de marca para produto mantendo as colunas: a
   * linha da marca mostra o total e as filhas mostram a quebra. Bloquear
   * `receitaItens` no nivel de cima deixaria a tabela com o cabecalho vazio
   * justamente no cruzamento mais util.
   */

  if (METRICAS_QUE_EXIGEM_MARCA.includes(metrica)) {
    return DIMENSOES_ALINHADAS_A_MARCA.includes(dimensao);
  }

  return true;
}

/** Por que a celula esta vazia. Aparece como nota de rodape na tela. */
export function motivoIndisponivel(dimensao: Dimensao, metrica: Metrica): string | null {
  if (metricaDisponivel(dimensao, metrica)) return null;

  if (dimensao === "produto") {
    return `${ROTULO_METRICA[metrica]} e um valor do pedido inteiro. Um pedido com varios produtos teria que ser rateado entre eles, e o rateio seria invencao.`;
  }

  return `${ROTULO_METRICA[metrica]} so existe por marca: o contrato de comissao e o regime tributario sao da marca, nao de ${ROTULO_DIMENSAO[dimensao].toLowerCase()}.`;
}

/** Metricas utilizaveis na dimensao, na ordem canonica. */
export function metricasDisponiveis(dimensao: Dimensao): Metrica[] {
  return METRICAS.filter((m) => metricaDisponivel(dimensao, m));
}

// ---------------------------------------------------------------------------
// Configuracao de um relatorio
// ---------------------------------------------------------------------------

export interface FiltrosRelatorio {
  /** Chave de mes `AAAA-MM`. Vazio = desde o inicio da base. */
  mesInicial: string;
  /** Chave de mes `AAAA-MM`. Vazio = ate o fim da base. */
  mesFinal: string;
  /** Vazio = todas. */
  marcas: string[];
  /** Siglas de UF. Vazio = todos. */
  estados: string[];
  /** `credit_card`, `boleto`, `pix`... Vazio = todos. */
  pagamentos: string[];
}

export interface ConfiguracaoRelatorio {
  agruparPor: Dimensao;
  /** Segundo nivel, opcional. `null` deixa o relatorio com um nivel so. */
  depoisPor: Dimensao | null;
  metricas: Metrica[];
  /** Metrica usada para ordenar, da maior para a menor. */
  ordenarPor: Metrica;
  filtros: FiltrosRelatorio;
}

export const FILTROS_VAZIOS: FiltrosRelatorio = {
  mesInicial: "",
  mesFinal: "",
  marcas: [],
  estados: [],
  pagamentos: [],
};

// ---------------------------------------------------------------------------
// Combinacoes prontas
// ---------------------------------------------------------------------------

/**
 * O relatorio abre numa combinacao pronta, nunca em branco.
 *
 * Tela de montar relatorio em branco e tela que nao responde nada: quem abre
 * precisa saber o que perguntar antes de ter a resposta. Estas sao as
 * perguntas que o painel ja se propoe a responder (secao 5), cada uma agora
 * com o periodo e os filtros abertos.
 */
export interface CombinacaoPronta {
  id: string;
  titulo: string;
  /** O que essa combinacao responde, em uma frase. */
  pergunta: string;
  configuracao: Omit<ConfiguracaoRelatorio, "filtros">;
}

export const COMBINACOES_PRONTAS: CombinacaoPronta[] = [
  {
    id: "lucro-por-marca",
    titulo: "Lucro por marca",
    pergunta: "Depois de imposto, fabricacao e comissao, o que sobra em cada marca?",
    configuracao: {
      agruparPor: "marca",
      depoisPor: null,
      metricas: ["bruto", "recebido", "receitaReal", "impostos", "cmv", "comissao", "lucro", "margemPercentual"],
      ordenarPor: "lucro",
    },
  },
  {
    id: "margem-por-produto",
    titulo: "Margem por produto",
    pergunta: "Quais produtos pagam a conta e quais estao saindo no prejuizo?",
    configuracao: {
      agruparPor: "produto",
      depoisPor: null,
      metricas: ["unidades", "receitaItens", "cmv", "margemItens"],
      ordenarPor: "margemItens",
    },
  },
  {
    id: "vazamento-por-pagamento",
    titulo: "Vazamento por meio de pagamento",
    pergunta: "De onde vem o dinheiro que e pedido e nunca entra?",
    configuracao: {
      agruparPor: "pagamento",
      depoisPor: null,
      metricas: ["pedidos", "bruto", "naoPago", "percentualNaoPago", "recebido"],
      ordenarPor: "naoPago",
    },
  },
  {
    id: "destino-por-estado",
    titulo: "Vendas por estado de destino",
    pergunta: "Para onde as vendas estao indo, e quanto de frete cada destino custa?",
    configuracao: {
      agruparPor: "estado",
      depoisPor: null,
      metricas: ["pedidos", "recebido", "frete", "receitaReal"],
      ordenarPor: "recebido",
    },
  },
  {
    id: "marca-por-mes",
    titulo: "Marca mês a mês",
    pergunta: "O resultado de cada marca esta melhorando ou piorando?",
    configuracao: {
      agruparPor: "marca",
      depoisPor: "mes",
      metricas: ["bruto", "recebido", "percentualNaoPago", "receitaReal"],
      ordenarPor: "recebido",
    },
  },
  {
    id: "produto-por-marca",
    titulo: "Produtos dentro de cada marca",
    pergunta: "Dentro de cada marca, quais produtos sustentam a margem?",
    configuracao: {
      agruparPor: "marca",
      depoisPor: "produto",
      metricas: ["unidades", "receitaItens", "cmv", "margemItens"],
      ordenarPor: "receitaItens",
    },
  },
];

/**
 * Com que o relatorio abre. Declarada explicitamente, e nao como
 * `COMBINACOES_PRONTAS[0]`, para que reordenar a lista acima nao troque em
 * silencio a tela que o cliente ve primeiro.
 */
export const COMBINACAO_PADRAO: CombinacaoPronta =
  COMBINACOES_PRONTAS.find((c) => c.id === "lucro-por-marca") ?? COMBINACOES_PRONTAS[0]!;
