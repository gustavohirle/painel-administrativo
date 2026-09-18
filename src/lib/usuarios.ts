/**
 * Regras do cadastro de usuarios.
 *
 * Funcoes PURAS, sem banco e sem React: sao elas que decidem quem pode ser
 * criado, trocado ou removido. Ficam aqui, e nao dentro da Server Action, para
 * terem teste -- as travas abaixo so aparecem no dia em que alguem tenta, e
 * nesse dia o painel ja esta em producao.
 *
 * As tres travas que importam:
 *
 * 1. Sempre sobra um administrador ativo. Sem isso, um clique tira o acesso ao
 *    cadastro de usuarios de todo mundo, para sempre -- so mexendo no banco na
 *    mao para voltar.
 * 2. Ninguem se remove nem se rebaixa. O caminho e outra pessoa fazer, e o
 *    engano fica reversivel.
 * 3. Senha de verdade: tamanho minimo, e nunca uma das publicadas no CLAUDE.md.
 */

import { CREDENCIAIS_DEMO } from "@/data/seeds";
import {
  TAMANHO_MINIMO_SENHA,
  type PerfilUsuario,
  type Usuario,
  type UsuarioPublico,
} from "@/types/usuario";

/** As senhas da demonstracao estao no CLAUDE.md, que e publico. */
const SENHAS_PUBLICADAS = new Set(CREDENCIAIS_DEMO.map((c) => c.senha));

/**
 * Login em minusculas, sem acento e sem espaco.
 *
 * E chave de busca (`buscarUsuarioPorLogin`) e vai para um cookie: aceitar
 * "Joao Silva" e " joao " como logins diferentes criaria duas contas que a
 * pessoa le como a mesma.
 */
export function normalizarLogin(bruto: string): string {
  return bruto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, ".");
}

export function problemaNoLogin(
  login: string,
  existentes: Array<{ id: string; usuario: string }>,
  idAtual?: string,
): string | null {
  if (login.length < 3) return "O login precisa ter pelo menos 3 letras.";
  if (login.length > 32) return "O login é longo demais.";
  if (!/^[a-z0-9._-]+$/.test(login)) {
    return "Use apenas letras, números, ponto, hífen ou sublinhado no login.";
  }
  if (existentes.some((u) => u.usuario === login && u.id !== idAtual)) {
    return `Já existe um usuário com o login "${login}".`;
  }
  return null;
}

export function problemaNaSenha(senha: string, login: string): string | null {
  if (senha.length < TAMANHO_MINIMO_SENHA) {
    return `A senha precisa ter pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`;
  }
  if (senha.length > 200) return "Senha longa demais.";
  if (SENHAS_PUBLICADAS.has(senha)) {
    return "Essa é uma senha da demonstração, que é pública. Escolha outra.";
  }
  if (senha.toLowerCase() === login.toLowerCase()) {
    return "A senha não pode ser igual ao login.";
  }
  if (/^\d+$/.test(senha)) return "Use letras também, não só números.";
  return null;
}

type Cadastrado = Pick<Usuario | UsuarioPublico, "id" | "perfil" | "ativo">;

/** Administradores ativos, sem contar um id que esta saindo ou mudando. */
function administradoresAtivos(usuarios: Cadastrado[], exceto?: string): number {
  return usuarios.filter((u) => u.perfil === "dono" && u.ativo && u.id !== exceto).length;
}

/**
 * Pode remover? Devolve o motivo quando nao.
 *
 * Remover usuario e diferente de desativar: o registro some. Quem so vai
 * parar de usar o painel deve ser DESATIVADO -- assim o login continua
 * reservado e da para religar.
 */
export function problemaAoRemover(
  usuarios: Cadastrado[],
  id: string,
  idDeQuemPede: string,
): string | null {
  const alvo = usuarios.find((u) => u.id === id);
  if (!alvo) return "Usuário não encontrado.";
  if (id === idDeQuemPede) return "Você não pode remover a sua própria conta.";
  if (alvo.perfil === "dono" && alvo.ativo && administradoresAtivos(usuarios, id) === 0) {
    return "Este é o último administrador ativo. Promova outra pessoa antes de removê-lo.";
  }
  return null;
}

/** Pode salvar esta alteracao de perfil ou de situacao? Motivo quando nao. */
export function problemaAoAlterar(
  usuarios: Cadastrado[],
  id: string,
  idDeQuemPede: string,
  mudanca: { perfil: PerfilUsuario; ativo: boolean },
): string | null {
  const alvo = usuarios.find((u) => u.id === id);
  if (!alvo) return "Usuário não encontrado.";

  const continuaAdministrando = mudanca.perfil === "dono" && mudanca.ativo;
  if (alvo.perfil === "dono" && alvo.ativo && !continuaAdministrando) {
    if (id === idDeQuemPede) {
      return "Você não pode tirar o próprio acesso de administrador. Peça a outro administrador.";
    }
    if (administradoresAtivos(usuarios, id) === 0) {
      return "Este é o último administrador ativo. Promova outra pessoa antes.";
    }
  }
  return null;
}

/** Ordem da lista: ativos primeiro, administradores antes, depois por nome. */
export function ordenarUsuarios<T extends { nome: string; perfil: PerfilUsuario; ativo: boolean }>(
  usuarios: T[],
): T[] {
  return [...usuarios].sort(
    (a, b) =>
      Number(b.ativo) - Number(a.ativo) ||
      Number(b.perfil === "dono") - Number(a.perfil === "dono") ||
      a.nome.localeCompare(b.nome, "pt-BR"),
  );
}
