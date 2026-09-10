/**
 * Tipos do NOSSO dominio -- o que a Nuvemshop nao sabe.
 *
 * A Nuvemshop conhece o preco de venda. Ela nao conhece quanto custa fabricar
 * o produto nem quanto o influencer leva. Esses dois cadastros sao o que
 * transforma um relatorio de vendas num raio-x de lucro.
 */

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
 */
export type BaseComissao = "bruto" | "recebido" | "receitaReal";

/** Cadastro de um influencer e seu contrato de comissao. */
export interface Influencer {
  id: string;
  nome: string;
  /** Marca a que o influencer esta vinculado. Casa com `Pedido.marca`. */
  marca: string;
  /** Percentual do contrato, ex.: 30 para 30%. */
  percentual: number;
  baseComissao: BaseComissao;
  ativo: boolean;
  observacao: string | null;
  atualizadoEm: string;
}

/** Entrada para criar/editar uma ficha de custo. */
export type EntradaCustoProduto = Omit<CustoProduto, "id" | "atualizadoEm">;

/** Entrada para criar/editar um influencer. */
export type EntradaInfluencer = Omit<Influencer, "id" | "atualizadoEm">;
