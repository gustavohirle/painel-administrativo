/**
 * Usuarios e perfis de acesso.
 *
 * A regra que motivou isto: o dono precisa ver todas as financas; a pessoa que
 * cadastra produto e conta estoque NAO pode ver faturamento, custo, margem,
 * comissao nem lucro. Nao e preferencia de layout -- e separacao de acesso, e
 * por isso e verificada no servidor, nunca escondendo elemento no navegador.
 *
 * Desde 18/09/2026 os perfis tambem dizem QUEM ASSINA CADA ETAPA da ordem de
 * fabricacao (5.15). Os quatro perfis do processo veem quase nada do painel: a
 * fila de ordens deles, e mais nada. Um perfil por etapa, e nao uma permissao
 * solta "pode assinar", porque assim a pergunta "quem faz a conferencia?" tem
 * uma resposta so, no cadastro de usuarios.
 */

export type PerfilUsuario =
  | "dono"
  | "estoque"
  | "conferencia"
  | "fabricacao"
  | "estoque_demazon"
  | "estoque_criar";

export const PERFIS: readonly PerfilUsuario[] = [
  "dono",
  "estoque",
  "conferencia",
  "fabricacao",
  "estoque_demazon",
  "estoque_criar",
] as const;

/**
 * Minimo para senha de painel financeiro exposto na internet.
 *
 * Mora aqui, e nao em `lib/usuarios.ts`, porque o formulario e componente de
 * NAVEGADOR: importar de la traria `data/seeds` junto, e com ele o
 * `node:crypto` -- o build quebra com "Reading from node:util is not handled".
 * Tipo e constante sem dependencia viajam para os dois lados.
 */
export const TAMANHO_MINIMO_SENHA = 10;

export interface Usuario {
  id: string;
  nome: string;
  /** Identificador de login. Sempre em minusculas. */
  usuario: string;
  perfil: PerfilUsuario;
  ativo: boolean;

  /**
   * Para onde vai o aviso quando uma ordem chega na etapa desta pessoa.
   *
   * `null` e permitido: sem e-mail a pessoa continua entrando no painel e
   * vendo a fila dela, so nao e avisada. A tela diz isso, em vez de calar --
   * um aviso que nunca chega e pior que aviso nenhum.
   */
  email: string | null;

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
  email: string | null;
}

export function paraUsuarioPublico(usuario: Usuario): UsuarioPublico {
  return {
    id: usuario.id,
    nome: usuario.nome,
    usuario: usuario.usuario,
    perfil: usuario.perfil,
    ativo: usuario.ativo,
    email: usuario.email,
  };
}

// ---------------------------------------------------------------------------
// Permissoes
// ---------------------------------------------------------------------------

/**
 * Areas do painel. A lista e curta de proposito: permissao granular demais
 * vira configuracao que ninguem entende e todo mundo marca tudo.
 *
 * `ordens` nasceu separada de `produtos` quando o processo de fabricacao
 * ganhou etapas (5.15): a conferencia e a fabricacao precisam da fila de
 * ordens e de mais nada -- nao do cadastro de produtos, nem dos kits.
 */
export type Area =
  | "financeiro"
  | "custos"
  | "produtos"
  | "ordens"
  | "estoque"
  | "fiscal"
  | "usuarios";

// DIFAL e parte da area fiscal: quem ve imposto ve o diferencial de aliquota.

const PERMISSOES: Record<PerfilUsuario, Area[]> = {
  // O dono ve tudo.
  dono: ["financeiro", "custos", "produtos", "ordens", "estoque", "fiscal", "usuarios"],
  /*
   * Quem cuida do estoque cadastra produto, conta e informa custo de
   * fabricacao -- e quem esta na fabrica que sabe quanto custa a materia-prima.
   *
   * `custos` e uma area separada de `financeiro` justamente por isso: dar
   * acesso a tela de custo nao abre faturamento, margem, comissao nem lucro.
   * A propria tela esconde preco de venda e margem para quem nao tem
   * `financeiro`.
   */
  estoque: ["custos", "produtos", "ordens", "estoque"],

  /*
   * Os quatro perfis do processo: a fila de ordens e nada mais.
   *
   * Os dois estoquistas ganham tambem a aba Estoque, porque e o trabalho
   * deles e porque a contagem que fazem na ordem cai exatamente ali -- ver o
   * resultado do proprio lancamento nao e privilegio, e conferencia.
   */
  conferencia: ["ordens"],
  fabricacao: ["ordens"],
  estoque_demazon: ["ordens", "estoque"],
  estoque_criar: ["ordens", "estoque"],
};

export function podeAcessar(perfil: PerfilUsuario, area: Area): boolean {
  return PERMISSOES[perfil].includes(area);
}

export function areasDoPerfil(perfil: PerfilUsuario): Area[] {
  return PERMISSOES[perfil];
}

export const ROTULO_PERFIL: Record<PerfilUsuario, string> = {
  dono: "Administrador",
  estoque: "Produção",
  conferencia: "Conferência",
  fabricacao: "Fabricação",
  estoque_demazon: "Estoque Demazon",
  estoque_criar: "Estoque Criar",
};

export const DESCRICAO_PERFIL: Record<PerfilUsuario, string> = {
  dono: "Vê o painel inteiro, incluindo faturamento, comissões, lucro e o cadastro de usuários. Abre as ordens de fabricação.",
  estoque:
    "Produtos, kits, ordens de fabricação, estoque e custo de fabricação. Não vê faturamento, comissão, margem nem lucro.",
  conferencia:
    "Só a fila de ordens. Confere se há embalagem, tampa, caixa e matéria-prima, e diz se dá para entregar na data.",
  fabricacao:
    "Só a fila de ordens. Assina quando a fabricação termina, com a data e a quantidade que saiu.",
  estoque_demazon:
    "A fila de ordens e o estoque. Conta o que foi fabricado e despacha para a Criar.",
  estoque_criar:
    "A fila de ordens e o estoque. Recebe e conta o que chegou da Demazon — é esta contagem que entra no estoque do painel.",
};

/** Rota inicial de cada perfil apos o login. */
export const ROTA_INICIAL: Record<PerfilUsuario, string> = {
  dono: "/",
  estoque: "/estoque",
  conferencia: "/ordens",
  fabricacao: "/ordens",
  estoque_demazon: "/ordens",
  estoque_criar: "/ordens",
};

/**
 * Perfis que so existem para o processo de fabricacao.
 *
 * A tela de usuarios usa isto para agrupar a lista: sem o agrupamento, seis
 * perfis numa combo viram uma escolha as cegas.
 */
export function ehPerfilDoProcesso(perfil: PerfilUsuario): boolean {
  return perfil !== "dono" && perfil !== "estoque";
}
