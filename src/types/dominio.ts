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
 */
export type BaseComissao = "bruto" | "recebido" | "receitaReal";

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
