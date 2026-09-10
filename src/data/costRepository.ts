/**
 * Fronteira dos CADASTROS: custos de fabricacao e comissoes de influencer.
 *
 * Mesma ideia do `FonteDePedidos`: a interface e estavel, as implementacoes
 * trocam. Em demonstracao os dados moram num arquivo local (funciona offline);
 * em producao, no Postgres via Prisma.
 */

import {
  type CustoProduto,
  type EntradaCustoProduto,
  type EntradaInfluencer,
  type Influencer,
} from "@/types/dominio";
import { MARCAS } from "@/data/catalogo";

export interface RepositorioCadastros {
  readonly tipo: "demo" | "postgres";

  listarCustos(): Promise<CustoProduto[]>;
  salvarCusto(entrada: EntradaCustoProduto, id?: string): Promise<CustoProduto>;
  removerCusto(id: string): Promise<void>;

  listarInfluencers(): Promise<Influencer[]>;
  salvarInfluencer(entrada: EntradaInfluencer, id?: string): Promise<Influencer>;
  removerInfluencer(id: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Composicao do custo
// ---------------------------------------------------------------------------

/**
 * Proporcao tipica de uma industria de cosmeticos para quebrar um custo
 * unitario fechado nos quatro componentes do cadastro.
 *
 * So e usada para SEMEAR a demonstracao. Quando o dono cadastrar de verdade,
 * ele informa cada componente separadamente.
 */
const COMPOSICAO_CUSTO = {
  materiaPrima: 0.55,
  embalagem: 0.18,
  maoDeObra: 0.17,
  indireto: 0.1,
} as const;

function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/**
 * Produtos deixados DE PROPOSITO sem ficha de custo na demonstracao.
 *
 * Nao e descuido: e o gancho de venda. O painel mostra "4 produtos sem custo
 * cadastrado, representando X% do faturamento" e o dono entende na hora por
 * que o cadastro importa -- da para cadastrar um ao vivo na reuniao.
 */
export const PRODUTOS_SEM_CUSTO_NA_DEMO = new Set([1005, 2005, 3005, 4005]);

/** Fichas de custo iniciais, derivadas do catalogo. */
export function custosIniciais(): CustoProduto[] {
  const agora = new Date().toISOString();
  const fichas: CustoProduto[] = [];

  for (const marca of MARCAS) {
    for (const produto of marca.produtos) {
      if (PRODUTOS_SEM_CUSTO_NA_DEMO.has(produto.id)) continue;

      for (const variante of produto.variantes) {
        fichas.push({
          id: `custo-${variante.id}`,
          produtoId: produto.id,
          varianteId: variante.id,
          sku: `${produto.sku}-${variante.rotulo.replace(/\s+/g, "").toUpperCase()}`,
          nome: `${produto.nome} ${variante.rotulo}`,
          custoMateriaPrima: arredondar(
            variante.custoFabricacao * COMPOSICAO_CUSTO.materiaPrima,
          ),
          custoEmbalagem: arredondar(
            variante.custoFabricacao * COMPOSICAO_CUSTO.embalagem,
          ),
          custoMaoDeObra: arredondar(
            variante.custoFabricacao * COMPOSICAO_CUSTO.maoDeObra,
          ),
          custoIndireto: arredondar(
            variante.custoFabricacao * COMPOSICAO_CUSTO.indireto,
          ),
          atualizadoEm: agora,
        });
      }
    }
  }

  return fichas;
}

/**
 * Influencers iniciais.
 *
 * Todos em 30% sobre o BRUTO porque e assim que o cliente paga hoje -- e
 * exatamente esse o ponto que o painel precisa deixar visivel.
 */
export function influencersIniciais(): Influencer[] {
  const agora = new Date().toISOString();

  const base: Array<Omit<Influencer, "id" | "atualizadoEm">> = [
    {
      nome: "Marina Costa",
      marca: "Aurora Beleza",
      percentual: 30,
      baseComissao: "bruto",
      ativo: true,
      observacao: "Contrato anual, renovacao em janeiro.",
    },
    {
      nome: "Bianca Reis",
      marca: "Luma Cosmeticos",
      percentual: 30,
      baseComissao: "bruto",
      ativo: true,
      observacao: null,
    },
    {
      nome: "Camila Prado",
      marca: "Verte Natural",
      percentual: 25,
      baseComissao: "bruto",
      ativo: true,
      observacao: "Percentual menor negociado na renovacao.",
    },
    {
      nome: "Rodrigo Salles",
      marca: "Nitro Hair",
      percentual: 30,
      baseComissao: "bruto",
      ativo: true,
      observacao: "Publico jovem, muito boleto.",
    },
    {
      nome: "Helena Duarte",
      marca: "Petra Skin",
      percentual: 30,
      baseComissao: "bruto",
      ativo: true,
      observacao: null,
    },
    {
      nome: "Tais Moreira",
      marca: "Aurora Beleza",
      percentual: 12,
      baseComissao: "recebido",
      ativo: true,
      observacao: "Contrato novo, ja fechado sobre o recebido.",
    },
  ];

  return base.map((influencer, indice) => ({
    ...influencer,
    id: `influencer-${indice + 1}`,
    atualizadoEm: agora,
  }));
}

/** Id simples e legivel, suficiente para os dois repositorios. */
export function novoId(prefixo: string): string {
  return `${prefixo}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
