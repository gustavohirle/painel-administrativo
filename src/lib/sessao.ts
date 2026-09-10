/**
 * Sessao do lado do servidor: le o cookie, resolve o usuario e barra acesso.
 *
 * REGRA: a verificacao de permissao acontece AQUI, no servidor, antes de a
 * pagina montar. Esconder um link no menu nao e controle de acesso -- quem
 * digitar a URL veria os numeros do mesmo jeito.
 */

import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  lerTokenSessao,
  NOME_COOKIE_SESSAO,
  type Sessao,
} from "@/lib/auth";
import { obterRepositorioCadastros } from "@/data";
import {
  paraUsuarioPublico,
  podeAcessar,
  ROTA_INICIAL,
  type Area,
  type UsuarioPublico,
} from "@/types/usuario";

/** Sessao crua do cookie, sem ir ao repositorio. */
export async function sessaoAtual(): Promise<Sessao | null> {
  const jar = await cookies();
  return lerTokenSessao(jar.get(NOME_COOKIE_SESSAO)?.value);
}

/**
 * Usuario autenticado, ou `null`.
 *
 * Confere o cadastro a cada requisicao em vez de confiar no cookie: assim,
 * desativar um usuario ou trocar o perfil dele tem efeito imediato, sem
 * esperar a sessao vencer.
 */
export async function usuarioAtual(): Promise<UsuarioPublico | null> {
  const sessao = await sessaoAtual();
  if (!sessao) return null;

  const repositorio = await obterRepositorioCadastros();
  const usuario = await repositorio.buscarUsuarioPorId(sessao.usuarioId);
  if (!usuario || !usuario.ativo) return null;

  return paraUsuarioPublico(usuario);
}

/** Exige alguem autenticado. Sem sessao, manda para o login. */
export async function exigirUsuario(): Promise<UsuarioPublico> {
  const usuario = await usuarioAtual();
  if (!usuario) redirect("/entrar");
  return usuario;
}

/**
 * Exige acesso a uma area.
 *
 * Quem esta autenticado mas nao tem permissao vai para a propria pagina
 * inicial, nao para o login: mandar de volta ao login daria a impressao de
 * sessao quebrada, quando o caso e simplesmente falta de permissao.
 */
export async function exigirArea(area: Area): Promise<UsuarioPublico> {
  const usuario = await exigirUsuario();
  if (!podeAcessar(usuario.perfil, area)) redirect(ROTA_INICIAL[usuario.perfil]);
  return usuario;
}
