/**
 * Usuarios e perfis de acesso.
 *
 * A regra que motivou isto: o dono precisa ver todas as financas; a pessoa que
 * cadastra produto e conta estoque NAO pode ver faturamento, custo, margem,
 * comissao nem lucro. Nao e preferencia de layout -- e separacao de acesso, e
 * por isso e verificada no servidor, nunca escondendo elemento no navegador.
 */

export type PerfilUsuario = "dono" | "estoque";

export interface Usuario {
  id: string;
  nome: string;
  /** Identificador de login. Sempre em minusculas. */
  usuario: string;
  perfil: PerfilUsuario;
  ativo: boolean;

  /** Hash scrypt da senha. NUNCA sai do servidor. */
  senhaHash: string;
  /** Sal em hexadecimal. NUNCA sai do servidor. */
  senhaSal: string;

  criadoEm: string;
  atualizadoEm: string;
}

/**
 * Usuario como ele pode trafegar para o cliente: sem hash, sem sal.
 *
 * Ter um tipo separado evita o acidente classico de passar o registro inteiro
 * para um componente e vazar o hash no HTML da pagina.
 */
export interface UsuarioPublico {
  id: string;
  nome: string;
  usuario: string;
  perfil: PerfilUsuario;
  ativo: boolean;
}

export function paraUsuarioPublico(usuario: Usuario): UsuarioPublico {
  return {
    id: usuario.id,
    nome: usuario.nome,
    usuario: usuario.usuario,
    perfil: usuario.perfil,
    ativo: usuario.ativo,
  };
}

// ---------------------------------------------------------------------------
// Permissoes
// ---------------------------------------------------------------------------

/**
 * Areas do painel. A lista e curta de proposito: permissao granular demais
 * vira configuracao que ninguem entende e todo mundo marca tudo.
 */
export type Area = "financeiro" | "produtos" | "estoque" | "fiscal" | "usuarios";

const PERMISSOES: Record<PerfilUsuario, Area[]> = {
  // O dono ve tudo.
  dono: ["financeiro", "produtos", "estoque", "fiscal", "usuarios"],
  // Quem cuida do estoque cadastra produto e conta -- e nao ve dinheiro.
  estoque: ["produtos", "estoque"],
};

export function podeAcessar(perfil: PerfilUsuario, area: Area): boolean {
  return PERMISSOES[perfil].includes(area);
}

export function areasDoPerfil(perfil: PerfilUsuario): Area[] {
  return PERMISSOES[perfil];
}

export const ROTULO_PERFIL: Record<PerfilUsuario, string> = {
  dono: "Dono",
  estoque: "Estoque e produtos",
};

export const DESCRICAO_PERFIL: Record<PerfilUsuario, string> = {
  dono: "Ve o painel inteiro, incluindo faturamento, custos, comissoes e lucro.",
  estoque:
    "Cadastra produtos e registra contagens de estoque. Nao ve nenhum valor financeiro.",
};

/** Rota inicial de cada perfil apos o login. */
export const ROTA_INICIAL: Record<PerfilUsuario, string> = {
  dono: "/",
  estoque: "/estoque",
};
