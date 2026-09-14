/**
 * Tipos do NOSSO dominio -- o que a Nuvemshop nao sabe.
 *
 * A Nuvemshop conhece o preco de venda. Ela nao conhece quanto custa fabricar
 * o produto, quanto o influencer leva, nem em que regime tributario aquela
 * marca esta. Esses cadastros sao o que transforma um relatorio de vendas num
 * raio-x de lucro.
 */

import type { AnexoSimples, RegimeTributario } from "@/types/fiscal";

/** Ficha de custo de fabricacao de um produto (ou variante). */
export interface CustoProduto {
  id: string;
  /** `product_id` da Nuvemshop. E a chave do vinculo. */
  produtoId: number;
  /** `variant_id` da Nuvemshop. `null` = custo vale para todas as variantes. */
  varianteId: number | null;
  /** SKU, para o dono conferir contra a planilha dele. */
  sku: string | null;
  /** Nome do produto na Nuvemshop, copiado para leitura humana. */
  nome: string;
  /** Materia-prima por unidade, em reais. */
  custoMateriaPrima: number;
  /** Embalagem por unidade, em reais. */
  custoEmbalagem: number;
  /** Mao de obra por unidade, em reais. */
  custoMaoDeObra: number;
  /** Rateio de custo indireto por unidade (energia, aluguel de fabrica). */
  custoIndireto: number;
  atualizadoEm: string;
}

/** Soma dos componentes de custo de uma ficha. */
export function custoUnitarioTotal(custo: CustoProduto): number {
  return (
    custo.custoMateriaPrima +
    custo.custoEmbalagem +
    custo.custoMaoDeObra +
    custo.custoIndireto
  );
}

/**
 * Base sobre a qual a comissao do influencer e calculada.
 *
 * `bruto`       -- percentual sobre tudo que foi faturado, inclusive pedido
 *                  cancelado e boleto nunca pago. E como o cliente paga hoje.
 * `recebido`    -- percentual sobre o dinheiro que efetivamente entrou.
 * `receitaReal` -- percentual sobre o recebido menos o frete.
 *
 * Em NENHUMA base entra o frete: ele e cobrado do cliente por fora e vai para
 * a transportadora. Com isso `recebido` e `receitaReal` dao o mesmo valor --
 * as duas continuam existindo para nao invalidar contratos ja cadastrados.
 */
export type BaseComissao = "bruto" | "recebido" | "receitaReal";

/**
 * Como cada base se chama e o que ela quer dizer, na tela.
 *
 * Moram aqui, e nao no componente, porque duas telas falam da mesma base -- o
 * cadastro de contrato e o simulador do painel. Textos diferentes para a mesma
 * coisa fariam parecer que sao duas contas.
 */
export const ROTULO_BASE: Record<BaseComissao, string> = {
  bruto: "Faturamento bruto",
  recebido: "Dinheiro recebido",
  receitaReal: "Receita real (sem frete)",
};

export const EXPLICACAO_BASE: Record<BaseComissao, string> = {
  bruto:
    "Todos os pedidos criados, inclusive cancelados, reembolsados e boletos que nunca foram pagos. O frete cobrado do cliente não entra.",
  recebido:
    "Somente pedidos efetivamente pagos, sem o frete cobrado do cliente — na prática, o mesmo valor da receita real.",
  receitaReal: "Pedidos pagos, sem o frete cobrado do cliente.",
};

/**
 * Cadastro de um influencer: contrato de comissao E enquadramento fiscal.
 *
 * Cada influencer tem a sua marca, a sua loja Nuvemshop e os seus produtos --
 * um produto nunca pertence a dois influencers. Na pratica cada um e uma
 * operacao separada, e por isso o REGIME TRIBUTARIO mora aqui, e nao numa
 * configuracao global: uma marca de R$ 300 mil/mes cabe no Simples, uma de
 * R$ 900 mil/mes nao cabe, e as duas convivem na mesma tela.
 *
 * E dai que sai o imposto de cada produto: produto -> influencer -> regime.
 */
export interface Influencer {
  id: string;
  nome: string;
  /** Marca a que o influencer esta vinculado. Casa com `Pedido.marca`. */
  marca: string;
  /** Percentual do contrato, ex.: 30 para 30%. */
  percentual: number;
  baseComissao: BaseComissao;

  /** Regime tributario da operacao desta marca. */
  regime: RegimeTributario;
  /** Anexo do Simples. So vale quando `regime` e `simples_nacional`. */
  anexoSimples: AnexoSimples;
  /** UF da empresa. Muda aliquota interna de ICMS e beneficios estaduais. */
  uf: string;
  /**
   * Receita bruta de 12 meses informada a mao. `null` = calcular do historico
   * de pedidos desta marca.
   */
  rbt12Manual: number | null;

  ativo: boolean;
  observacao: string | null;
  atualizadoEm: string;
}

/** Entrada para criar/editar uma ficha de custo. */
export type EntradaCustoProduto = Omit<CustoProduto, "id" | "atualizadoEm">;

/** Entrada para criar/editar um influencer. */
export type EntradaInfluencer = Omit<Influencer, "id" | "atualizadoEm">;

// ---------------------------------------------------------------------------
// Despesas de influencer
// ---------------------------------------------------------------------------

/**
 * O que um influencer custa ALEM da comissao: produto enviado para gravar,
 * viagem para um evento, cache fixo, anuncio impulsionado.
 *
 * Antes disso o painel so enxergava a comissao, e o lucro operacional saia
 * maior do que o verdadeiro: o dinheiro gasto com o influencer existia, so nao
 * estava em lugar nenhum. A comissao continua CALCULADA (secao 5.2) e nunca e
 * gravada aqui; so se cadastra o que nao sai de conta nenhuma.
 *
 * Despesa e avulsa e pertence a um mes pela data. Um cache fixo mensal e
 * cadastrado uma vez em cada mes. Recorrencia automatica foi descartada de
 * proposito: o que esta na grade e o que foi gasto, sem regra escondida.
 */
export const CATEGORIAS_DESPESA = [
  "operacional",
  "produto_enviado",
  "viagem",
  "cache",
  "anuncio",
  "outros",
] as const;

export type CategoriaDespesa = (typeof CATEGORIAS_DESPESA)[number];

export const ROTULO_CATEGORIA_DESPESA: Record<CategoriaDespesa, string> = {
  operacional: "Operacional",
  produto_enviado: "Produto enviado",
  viagem: "Viagem e hospedagem",
  cache: "Cachê",
  anuncio: "Anúncio impulsionado",
  outros: "Outros",
};

export interface DespesaInfluencer {
  id: string;
  /**
   * Dono da despesa. `null` = COMPARTILHADA: gravada uma vez, com o valor
   * total, e dividida entre os influencers pelo faturamento sem frete de cada
   * marca no mes (`ratearDespesas`, em costing.ts). A parte de cada um nunca e
   * gravada, pelo mesmo motivo da comissao: mudaria com as vendas e ficaria
   * velha.
   */
  influencerId: string | null;
  /** Data de calendario "aaaa-mm-dd". E ela que decide o mes da despesa. */
  data: string;
  categoria: CategoriaDespesa;
  descricao: string;
  /** Em reais. Sempre positivo: e custo. */
  valor: number;
  atualizadoEm: string;
}

export type EntradaDespesaInfluencer = Omit<DespesaInfluencer, "id" | "atualizadoEm">;

/** De onde saiu a parte de um influencer numa despesa compartilhada. */
export interface RateioDespesa {
  /** Id da despesa compartilhada gravada. */
  despesaId: string;
  /** Valor total cadastrado, antes da divisao. */
  total: number;
  /** Fracao do total que coube a este influencer. */
  fracao: number;
}

/**
 * Despesa ja com dono: a propria de um influencer (`rateio: null`) ou a parte
 * dele numa compartilhada. E o que as contas e a grade consomem.
 */
export interface DespesaAtribuida extends Omit<DespesaInfluencer, "influencerId"> {
  influencerId: string;
  rateio: RateioDespesa | null;
}

/** Id do registro gravado: o da compartilhada, quando for uma parte dela. */
export function idDeOrigem(despesa: DespesaInfluencer | DespesaAtribuida): string {
  return "rateio" in despesa && despesa.rateio ? despesa.rateio.despesaId : despesa.id;
}

/**
 * "2026-09" a partir de "2026-09-14", por fatia de texto.
 *
 * Sem `new Date`: "2026-09-01" viraria meia-noite em UTC, que no Brasil ainda
 * e 31 de agosto, e a despesa do dia primeiro cairia no mes anterior.
 */
export function mesDaDespesa(despesa: Pick<DespesaInfluencer, "data">): string {
  return despesa.data.slice(0, 7);
}
