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
import type { EntradaInfluencer, Influencer } from "@/types/dominio";
import type { EntradaImposto, Imposto } from "@/types/fiscal";
import type {
  ContagemEstoque,
  EntradaContagemEstoque,
  EntradaProduto,
  Produto,
} from "@/types/produto";
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

  // --- Impostos -----------------------------------------------------------
  listarImpostos(): Promise<Imposto[]>;
  salvarImposto(entrada: EntradaImposto, id?: string): Promise<Imposto>;
  removerImposto(id: string): Promise<void>;

  // --- Produtos e kits ----------------------------------------------------
  listarProdutos(): Promise<Produto[]>;
  salvarProduto(entrada: EntradaProduto, id?: string): Promise<Produto>;
  removerProduto(id: string): Promise<void>;

  // --- Estoque ------------------------------------------------------------
  listarContagens(): Promise<ContagemEstoque[]>;
  salvarContagem(entrada: EntradaContagemEstoque): Promise<ContagemEstoque>;
  removerContagem(id: string): Promise<void>;

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
