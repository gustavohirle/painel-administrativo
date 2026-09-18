/**
 * Fronteira dos CADASTROS -- tudo que a Nuvemshop nao sabe.
 *
 * Mesma ideia do `FonteDePedidos`: a interface e estavel, as implementacoes
 * trocam. Em demonstracao os dados moram num arquivo local (funciona offline);
 * em producao, no Postgres via Prisma.
 *
 * A interface e grande porque o dominio e grande, mas todo metodo aqui existe
 * porque alguma tela precisa dele. Nao ha CRUD por simetria.
 */

import type { CustoProduto, EntradaCustoProduto } from "@/types/dominio";
import type {
  DespesaInfluencer,
  EntradaDespesaInfluencer,
  EntradaInfluencer,
  Influencer,
} from "@/types/dominio";
import type {
  AliquotaEstado,
  EntradaAliquotaEstado,
  EntradaImposto,
  Imposto,
} from "@/types/fiscal";
import type {
  EntradaOrdem,
  OrdemFabricacao,
} from "@/types/ordemFabricacao";
import type {
  EntradaTaxaPlataforma,
  TaxaPlataforma,
} from "@/types/plataforma";
import type {
  ContagemEstoque,
  EntradaContagemEstoque,
  EntradaProduto,
  Produto,
} from "@/types/produto";
import type { EntradaFechamentoMes, FechamentoMes } from "@/types/fechamento";
import type { Usuario } from "@/types/usuario";

export interface RepositorioCadastros {
  readonly tipo: "demo" | "postgres";

  // --- Custo de fabricacao ------------------------------------------------
  listarCustos(): Promise<CustoProduto[]>;
  salvarCusto(entrada: EntradaCustoProduto, id?: string): Promise<CustoProduto>;
  removerCusto(id: string): Promise<void>;

  // --- Comissoes ----------------------------------------------------------
  listarInfluencers(): Promise<Influencer[]>;
  salvarInfluencer(entrada: EntradaInfluencer, id?: string): Promise<Influencer>;
  removerInfluencer(id: string): Promise<void>;

  /** Despesas de influencer de todos os meses. Quem separa por mes e a DRE. */
  listarDespesasInfluencer(): Promise<DespesaInfluencer[]>;
  salvarDespesaInfluencer(
    entrada: EntradaDespesaInfluencer,
    id?: string,
  ): Promise<DespesaInfluencer>;
  removerDespesaInfluencer(id: string): Promise<void>;

  // --- Impostos -----------------------------------------------------------
  listarImpostos(): Promise<Imposto[]>;
  salvarImposto(entrada: EntradaImposto, id?: string): Promise<Imposto>;
  removerImposto(id: string): Promise<void>;

  // --- DIFAL: aliquota interna de cada estado -----------------------------
  listarAliquotasEstaduais(): Promise<AliquotaEstado[]>;
  /** Chave e a UF: salvar duas vezes o mesmo estado atualiza, nao duplica. */
  salvarAliquotaEstadual(entrada: EntradaAliquotaEstado): Promise<AliquotaEstado>;

  // --- Produtos e kits ----------------------------------------------------
  /** Taxas de plataforma e meio de pagamento. Chave: o metodo. */
  listarTaxasPlataforma(): Promise<TaxaPlataforma[]>;
  /** Salvar duas vezes o mesmo metodo atualiza, nao duplica. */
  salvarTaxaPlataforma(entrada: EntradaTaxaPlataforma): Promise<TaxaPlataforma>;

  listarProdutos(): Promise<Produto[]>;
  salvarProduto(entrada: EntradaProduto, id?: string): Promise<Produto>;
  removerProduto(id: string): Promise<void>;

  // --- Estoque ------------------------------------------------------------
  listarContagens(): Promise<ContagemEstoque[]>;
  salvarContagem(entrada: EntradaContagemEstoque): Promise<ContagemEstoque>;
  removerContagem(id: string): Promise<void>;

  // --- Ordens de fabricacao -----------------------------------------------

  listarOrdens(): Promise<OrdemFabricacao[]>;
  buscarOrdemPorId(id: string): Promise<OrdemFabricacao | null>;
  criarOrdem(entrada: EntradaOrdem): Promise<OrdemFabricacao>;
  /**
   * Grava a ordem inteira, por id.
   *
   * Nao ha `salvarOrdem(entrada)` como nos outros cadastros porque ordem nao
   * se edita: ela ANDA. Cada etapa assinada acrescenta um passo e move a etapa
   * atual, e quem chama monta o registro novo e grava de uma vez -- as regras
   * de para onde ela pode andar ficam em `lib/processoOrdem.ts`.
   */
  gravarOrdem(ordem: OrdemFabricacao): Promise<OrdemFabricacao>;

  // --- Fechamento do mes -------------------------------------------------
  /** Valores informados a mao no fim do mes. Chave: o mes. */
  listarFechamentos(): Promise<FechamentoMes[]>;
  /** Salvar duas vezes o mesmo mes atualiza, nao duplica. */
  salvarFechamento(entrada: EntradaFechamentoMes): Promise<FechamentoMes>;

  // --- Usuarios -----------------------------------------------------------
  listarUsuarios(): Promise<Usuario[]>;
  buscarUsuarioPorId(id: string): Promise<Usuario | null>;
  /** Busca por login, sempre em minusculas. */
  buscarUsuarioPorLogin(usuario: string): Promise<Usuario | null>;
  salvarUsuario(usuario: Usuario): Promise<Usuario>;
  removerUsuario(id: string): Promise<void>;
}

/** Id simples e legivel, suficiente para os dois repositorios. */
export function novoId(prefixo: string): string {
  return `${prefixo}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
