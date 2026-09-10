"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { obterRepositorioCadastros } from "@/data";
import {
  criarTokenSessao,
  DURACAO_SESSAO_SEGUNDOS,
  NOME_COOKIE_SESSAO,
  verificarSenha,
} from "@/lib/auth";
import { ROTA_INICIAL } from "@/types/usuario";
import type { EstadoFormulario } from "@/types/formulario";

const esquema = z.object({
  usuario: z.string().trim().min(1, "Informe o usuario").max(80),
  senha: z.string().min(1, "Informe a senha").max(200),
});

/**
 * Mensagem unica para usuario inexistente, senha errada e conta desativada.
 *
 * Dizer "usuario nao encontrado" entrega quais logins existem, e a partir dai
 * so falta a senha. A resposta e sempre a mesma, custe o que custar em
 * simpatia.
 */
const RECUSA = "Usuario ou senha invalidos.";

export async function entrar(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const analise = esquema.safeParse({
    usuario: formData.get("usuario"),
    senha: formData.get("senha"),
  });

  if (!analise.success) {
    return {
      ok: false,
      mensagem: analise.error.issues[0]?.message ?? RECUSA,
    };
  }

  const repositorio = await obterRepositorioCadastros();
  const usuario = await repositorio.buscarUsuarioPorLogin(analise.data.usuario);

  // O scrypt roda mesmo sem usuario encontrado: sem isso, a resposta volta
  // instantaneamente para login inexistente e devagar para login existente --
  // e o tempo de resposta vira um oraculo de quais contas existem.
  const senhaConfere = await verificarSenha(analise.data.senha, {
    senhaHash: usuario?.senhaHash ?? "00".repeat(64),
    senhaSal: usuario?.senhaSal ?? "sal-inexistente",
  });

  if (!usuario || !usuario.ativo || !senhaConfere) {
    return { ok: false, mensagem: RECUSA };
  }

  const jar = await cookies();
  jar.set(NOME_COOKIE_SESSAO, criarTokenSessao(usuario.id, usuario.perfil), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DURACAO_SESSAO_SEGUNDOS,
  });

  // Fora do try/catch: `redirect` sinaliza por excecao, e engoli-la deixaria
  // o usuario autenticado parado na tela de login.
  redirect(ROTA_INICIAL[usuario.perfil]);
}

export async function sair(): Promise<void> {
  const jar = await cookies();
  jar.delete(NOME_COOKIE_SESSAO);
  redirect("/entrar");
}
