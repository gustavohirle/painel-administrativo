"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { obterRepositorioCadastros } from "@/data";
import { criarHashSenha } from "@/lib/auth";
import { novoId } from "@/data/repositorio";
import { exigirArea } from "@/lib/sessao";
import {
  normalizarLogin,
  problemaAoAlterar,
  problemaAoRemover,
  problemaNaSenha,
  problemaNoLogin,
} from "@/lib/usuarios";
import type { EstadoFormulario } from "@/types/formulario";
import type { PerfilUsuario } from "@/types/usuario";

/*
 * Cadastro de usuarios. Area `usuarios`, que so o administrador tem.
 *
 * Server Action e endpoint publico (secao 5.13): cada funcao daqui confere a
 * area de novo, mesmo a pagina ja conferindo. E as travas do cadastro
 * (`lib/usuarios.ts`) rodam AQUI, no servidor -- desabilitar um botao no
 * navegador nao impede nada.
 */

const perfis = ["dono", "estoque"] as const satisfies readonly PerfilUsuario[];

const esquemaNovo = z.object({
  nome: z.string().trim().min(3, "Escreva o nome da pessoa").max(80),
  usuario: z.string().trim().min(1, "Informe o login"),
  senha: z.string().min(1, "Informe a senha"),
  perfil: z.enum(perfis, { errorMap: () => ({ message: "Escolha a função" }) }),
});

export async function criarUsuario(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await exigirArea("usuarios");

  const analise = esquemaNovo.safeParse({
    nome: formData.get("nome"),
    usuario: formData.get("usuario"),
    senha: formData.get("senha"),
    perfil: formData.get("perfil"),
  });
  if (!analise.success) {
    return { ok: false, mensagem: analise.error.issues[0]?.message ?? "Confira os campos." };
  }

  const repositorio = await obterRepositorioCadastros();
  const existentes = await repositorio.listarUsuarios();
  const login = normalizarLogin(analise.data.usuario);

  const problema =
    problemaNoLogin(login, existentes) ?? problemaNaSenha(analise.data.senha, login);
  if (problema) return { ok: false, mensagem: problema };

  const agora = new Date().toISOString();
  try {
    await repositorio.salvarUsuario({
      id: novoId("usuario"),
      nome: analise.data.nome,
      usuario: login,
      perfil: analise.data.perfil,
      ativo: true,
      ...(await criarHashSenha(analise.data.senha)),
      criadoEm: agora,
      atualizadoEm: agora,
    });
  } catch (erro) {
    return {
      ok: false,
      mensagem: `Não foi possível criar: ${erro instanceof Error ? erro.message : "erro desconhecido"}`,
    };
  }

  revalidatePath("/usuarios");
  return { ok: true, mensagem: `Usuário "${login}" criado. Avise a senha a ele por um caminho seguro.` };
}

const esquemaAlteracao = z.object({
  id: z.string().trim().min(1),
  nome: z.string().trim().min(3, "Escreva o nome da pessoa").max(80),
  perfil: z.enum(perfis, { errorMap: () => ({ message: "Escolha a função" }) }),
  ativo: z.boolean(),
});

export async function alterarUsuario(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const quemPede = await exigirArea("usuarios");

  const analise = esquemaAlteracao.safeParse({
    id: formData.get("id"),
    nome: formData.get("nome"),
    perfil: formData.get("perfil"),
    // Caixa desmarcada nao vai no formulario.
    ativo: formData.get("ativo") === "on",
  });
  if (!analise.success) {
    return { ok: false, mensagem: analise.error.issues[0]?.message ?? "Confira os campos." };
  }

  const repositorio = await obterRepositorioCadastros();
  const usuarios = await repositorio.listarUsuarios();
  const atual = usuarios.find((u) => u.id === analise.data.id);
  if (!atual) return { ok: false, mensagem: "Usuário não encontrado." };

  const problema = problemaAoAlterar(usuarios, atual.id, quemPede.id, {
    perfil: analise.data.perfil,
    ativo: analise.data.ativo,
  });
  if (problema) return { ok: false, mensagem: problema };

  // O hash e o login nao mudam aqui: senha tem acao propria, e trocar login
  // deixaria a pessoa sem saber como entrar.
  await repositorio.salvarUsuario({
    ...atual,
    nome: analise.data.nome,
    perfil: analise.data.perfil,
    ativo: analise.data.ativo,
    atualizadoEm: new Date().toISOString(),
  });

  revalidatePath("/usuarios");
  return { ok: true, mensagem: "Usuário atualizado." };
}

export async function definirSenha(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await exigirArea("usuarios");

  const id = String(formData.get("id") ?? "");
  const senha = String(formData.get("senha") ?? "");

  const repositorio = await obterRepositorioCadastros();
  const atual = (await repositorio.listarUsuarios()).find((u) => u.id === id);
  if (!atual) return { ok: false, mensagem: "Usuário não encontrado." };

  const problema = problemaNaSenha(senha, atual.usuario);
  if (problema) return { ok: false, mensagem: problema };

  await repositorio.salvarUsuario({
    ...atual,
    ...(await criarHashSenha(senha)),
    atualizadoEm: new Date().toISOString(),
  });

  revalidatePath("/usuarios");
  return {
    ok: true,
    mensagem: `Senha de "${atual.usuario}" trocada. As sessões abertas dele continuam valendo até expirar.`,
  };
}

export async function removerUsuario(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const quemPede = await exigirArea("usuarios");
  const id = String(formData.get("id") ?? "");

  const repositorio = await obterRepositorioCadastros();
  const usuarios = await repositorio.listarUsuarios();

  const problema = problemaAoRemover(usuarios, id, quemPede.id);
  if (problema) return { ok: false, mensagem: problema };

  try {
    await repositorio.removerUsuario(id);
  } catch (erro) {
    return {
      ok: false,
      mensagem: `Não foi possível remover: ${erro instanceof Error ? erro.message : "erro desconhecido"}`,
    };
  }

  revalidatePath("/usuarios");
  return { ok: true, mensagem: "Usuário removido." };
}
