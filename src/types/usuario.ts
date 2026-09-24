/**
 * Usuarios e perfis de acesso.
 *
 * A regra que motivou isto: o dono precisa ver todas as financas; a pessoa que
 * cadastra produto e conta estoque NAO pode ver faturamento, custo, margem,
 * comissao nem lucro. Nao e preferencia de layout -- e separacao de acesso, e
 * por isso e verificada no servidor, nunca escondendo elemento no navegador.
 */

export type PerfilUsuario = "dono" | "estoque";

/**
 * Minimo de caracteres da senha. **Oito**, por decisao do dono em 23/09/2026.
 *
 * Era 10, escolhido por mim sem perguntar quando o cadastro de usuarios foi
 * feito -- e isso cobrou caro: ele trocou a senha para uma de 8, a tela
 * RECUSOU a troca, ele nao viu a mensagem, e ficou trancado do lado de fora
 * tentando entrar com uma senha que nunca chegou a ser gravada.
 *
 * Vale a licao, e nao so o numero: uma regra de seguranca que o dono nao
 * escolheu ele nao defende, e quando ela o atrapalha o efeito nao e uma senha
 * mais forte -- e um chamado, uma redefinicao pelo banco, e a proxima senha
 * escolhida com raiva. Se for para subir de novo, pergunte antes.
 *
 * As outras travas de `problemaNaSenha` continuam e valem mais que o
 * comprimento: nada de senha publicada aqui, nada igual ao login, nada so de
 * numeros. A do `prisma/seed.ts` e outra conta -- ali sao 12, porque a senha
 * inicial nasce num arquivo de ambiente e ninguem a digita.
 *
 * Mora aqui, e nao em `lib/usuarios.ts`, porque o formulario e componente de
 * NAVEGADOR: importar de la traria `data/seeds` junto, e com ele o
 * `node:crypto` -- o build quebra com "Reading from node:util is not handled".
 * Tipo e constante sem dependencia viajam para os dois lados.
 */
export const TAMANHO_MINIMO_SENHA = 8;

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
export type Area =
  | "financeiro"
  | "custos"
  | "produtos"
  | "estoque"
  | "fiscal"
  | "usuarios";

// DIFAL e parte da area fiscal: quem ve imposto ve o diferencial de aliquota.

const PERMISSOES: Record<PerfilUsuario, Area[]> = {
  // O dono ve tudo.
  dono: ["financeiro", "custos", "produtos", "estoque", "fiscal", "usuarios"],
  /*
   * Quem cuida do estoque cadastra produto, conta e informa custo de
   * fabricacao -- e quem esta na fabrica que sabe quanto custa a materia-prima.
   *
   * `custos` e uma area separada de `financeiro` justamente por isso: dar
   * acesso a tela de custo nao abre faturamento, margem, comissao nem lucro.
   * A propria tela esconde preco de venda e margem para quem nao tem
   * `financeiro`.
   */
  estoque: ["custos", "produtos", "estoque"],
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
};

export const DESCRICAO_PERFIL: Record<PerfilUsuario, string> = {
  dono: "Vê o painel inteiro, incluindo faturamento, comissões, lucro e o cadastro de usuários.",
  estoque:
    "Produtos, kits, ordens de fabricação, estoque e custo de fabricação. Não vê faturamento, comissão, margem nem lucro.",
};

/** Rota inicial de cada perfil apos o login. */
export const ROTA_INICIAL: Record<PerfilUsuario, string> = {
  dono: "/",
  estoque: "/estoque",
};
