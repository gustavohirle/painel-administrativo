"use server";

import { obterRepositorioCadastros } from "@/data";
import { criarHashSenha, verificarSenha } from "@/lib/auth";
import { exigirUsuario } from "@/lib/sessao";
import { problemaNaSenha } from "@/lib/usuarios";
import type { EstadoFormulario } from "@/types/formulario";

/**
 * Troca da propria senha. Vale para QUALQUER pessoa logada, inclusive quem e
 * da producao e nao enxerga o cadastro de usuarios.
 *
 * Pede a senha atual de propósito: sem isso, um computador deixado aberto
 * deixa trocar a senha e tomar a conta. Quem esqueceu a senha pede a um
 * administrador, que a redefine pela tela de usuarios.
 */
export async function trocarMinhaSenha(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const sessao = await exigirUsuario();

  const atual = String(formData.get("atual") ?? "");
  const nova = String(formData.get("nova") ?? "");
  const repeticao = String(formData.get("repeticao") ?? "");

  if (nova !== repeticao) {
    return { ok: false, mensagem: "A nova senha e a repetição não são iguais." };
  }

  const repositorio = await obterRepositorioCadastros();
  const usuario = await repositorio.buscarUsuarioPorId(sessao.id);
  if (!usuario) return { ok: false, mensagem: "Usuário não encontrado." };

  if (!(await verificarSenha(atual, usuario))) {
    return { ok: false, mensagem: "A senha atual está errada." };
  }

  const problema = problemaNaSenha(nova, usuario.usuario);
  if (problema) return { ok: false, mensagem: problema };

  if (await verificarSenha(nova, usuario)) {
    return { ok: false, mensagem: "A nova senha é igual à atual." };
  }

  await repositorio.salvarUsuario({
    ...usuario,
    ...(await criarHashSenha(nova)),
    atualizadoEm: new Date().toISOString(),
  });

  return { ok: true, mensagem: "Senha trocada. Use a nova na próxima vez que entrar." };
}
