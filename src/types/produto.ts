/**
 * Cadastro de produto, composicao de kit e contagem de estoque.
 *
 * Por que existe um cadastro proprio se a Nuvemshop ja tem produtos:
 *
 * A Nuvemshop sabe o que foi vendido e por quanto. Ela NAO sabe (a) quais
 * tributos incidem sobre cada item, (b) que um "Kit Barba" tira do estoque um
 * shampoo e um tonico, e (c) quanto ha em estoque de cada componente. Esses
 * tres vinculos sao nossos, e e deles que sai o calculo preciso.
 */

/**
 * Chave que liga nosso cadastro ao item da Nuvemshop.
 *
 * O custo, o imposto e o estoque mudam por VARIANTE (um creme de 30ml nao
 * custa nem pesa o mesmo que o de 200ml), entao a chave carrega as duas partes.
 * Formato: "produtoId:varianteId", ou "produtoId:*" para o produto inteiro.
 */
export type ChaveProduto = string;

export function chaveProduto(
  produtoId: number,
  varianteId: number | null,
): ChaveProduto {
  return `${produtoId}:${varianteId ?? "*"}`;
}

export function partesDaChave(chave: ChaveProduto): {
  produtoId: number;
  varianteId: number | null;
} {
  const [p, v] = chave.split(":");
  return {
    produtoId: Number(p),
    varianteId: v === "*" || v === undefined ? null : Number(v),
  };
}

/**
 * Trava contra kit que contem a si mesmo, direta ou indiretamente.
 * Sem ela, uma composicao circular cadastrada por engano trava o servidor.
 */
export const PROFUNDIDADE_MAXIMA_KIT = 5;

/** Um componente de kit: qual item e quantas unidades ele consome. */
export interface ComponenteKit {
  /** Chave do produto componente. */
  chave: ChaveProduto;
  /** Nome copiado, para leitura humana na tela. */
  nome: string;
  quantidade: number;
}

export type OrigemProduto = "nuvemshop" | "manual";

export interface Produto {
  id: string;
  chave: ChaveProduto;
  produtoId: number;
  varianteId: number | null;

  nome: string;
  sku: string | null;
  /** Nomenclatura Comum do Mercosul. Define IPI e ICMS-ST. */
  ncm: string | null;

  origem: OrigemProduto;

  /** Ids dos impostos marcados no cadastro (os `aplicacaoPorProduto`). */
  impostosIds: string[];

  /**
   * `true` quando este item e vendido como kit.
   *
   * A Nuvemshop entrega o kit como UM produto, com product_id proprio -- ela
   * nao decompoe. A composicao abaixo e o que permite baixar o estoque dos
   * componentes certos e somar o custo de fabricacao real do kit.
   */
  ehKit: boolean;
  componentes: ComponenteKit[];

  ativo: boolean;
  observacao: string | null;
  atualizadoEm: string;
}

export type EntradaProduto = Omit<Produto, "id" | "atualizadoEm">;

// ---------------------------------------------------------------------------
// Estoque
// ---------------------------------------------------------------------------

/**
 * Uma contagem de estoque feita por uma pessoa, numa data.
 *
 * DECISAO: o painel guarda CONTAGENS, nao um saldo mutavel.
 *
 * Saldo mutavel exige que todo pedido seja processado exatamente uma vez; se a
 * pagina recalcular, o estoque despenca sozinho. Guardando a contagem e a data,
 * o saldo atual e sempre `contagem - vendido desde a contagem` -- uma funcao
 * pura, que da o mesmo resultado quantas vezes rodar.
 */
export interface ContagemEstoque {
  id: string;
  chave: ChaveProduto;
  nome: string;
  quantidade: number;
  /** Data da contagem, ISO 8601. Vendas anteriores a ela sao ignoradas. */
  dataContagem: string;
  /** Quem contou. */
  responsavel: string | null;
  observacao: string | null;
  registradoEm: string;
}

export type EntradaContagemEstoque = Omit<ContagemEstoque, "id" | "registradoEm">;

/** Saldo calculado de um item. */
export interface SaldoEstoque {
  chave: ChaveProduto;
  nome: string;
  sku: string | null;
  /** Quantidade da ultima contagem. `null` quando nunca foi contado. */
  quantidadeContada: number | null;
  dataContagem: string | null;
  /** Unidades vendidas depois da contagem, ja decompondo kits. */
  vendidoDesdeContagem: number;
  /** quantidadeContada - vendidoDesdeContagem. `null` sem contagem. */
  saldoAtual: number | null;
  /** Vendas do periodo analisado, para dimensionar a cobertura. */
  vendidoNoPeriodo: number;
  /** Quantos dias o saldo cobre no ritmo de venda do periodo. */
  diasDeCobertura: number | null;
  situacao: "sem_contagem" | "negativo" | "critico" | "baixo" | "saudavel";
}

/** Abaixo destes dias de cobertura o item entra em alerta. */
export const DIAS_ESTOQUE_CRITICO = 7;
export const DIAS_ESTOQUE_BAIXO = 21;
