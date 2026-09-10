"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { obterRepositorioCadastros } from "@/data";
import { exigirArea } from "@/lib/sessao";
import type { EstadoFormulario } from "@/types/formulario";

const esquema = z.object({
  chave: z.string().trim().min(1, "Selecione o produto"),
  nome: z.string().trim().min(1).max(200),
  quantidade: z.coerce
    .number({ invalid_type_error: "Informe a quantidade" })
    .int("Use um numero inteiro de unidades")
    .min(0, "Nao pode ser negativa")
    .max(10_000_000),
  /** Data no formato do input HTML (yyyy-mm-dd). */
  dataContagem: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data invalida"),
  responsavel: z.string().trim().max(120).nullable().optional(),
  observacao: z.string().trim().max(400).nullable().optional(),
});

export async function registrarContagem(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const usuario = await exigirArea("estoque");

  const analise = esquema.safeParse({
    chave: formData.get("chave"),
    nome: formData.get("nome"),
    quantidade: formData.get("quantidade"),
    dataContagem: formData.get("dataContagem"),
    responsavel: formData.get("responsavel") || usuario.nome,
    observacao: formData.get("observacao") || null,
  });

  if (!analise.success) {
    return {
      ok: false,
      mensagem: analise.error.issues[0]?.message ?? "Confira os campos.",
    };
  }

  const dados = analise.data;

  // Contagem no futuro esconderia vendas que ja aconteceram: o saldo passa a
  // descontar apenas o que veio DEPOIS da data, e nada veio depois de amanha.
  const data = new Date(`${dados.dataContagem}T12:00:00.000Z`);
  if (data.getTime() > Date.now()) {
    return { ok: false, mensagem: "A data da contagem nao pode estar no futuro." };
  }

  try {
    const repositorio = await obterRepositorioCadastros();
    await repositorio.salvarContagem({
      chave: dados.chave,
      nome: dados.nome,
      quantidade: dados.quantidade,
      dataContagem: data.toISOString(),
      responsavel: dados.responsavel ?? null,
      observacao: dados.observacao ?? null,
    });
  } catch (erro) {
    return {
      ok: false,
      mensagem: `Nao foi possivel registrar: ${
        erro instanceof Error ? erro.message : "erro desconhecido"
      }`,
    };
  }

  revalidatePath("/estoque");
  return {
    ok: true,
    mensagem: `Contagem de "${dados.nome}" registrada: ${dados.quantidade} un.`,
  };
}

export async function removerContagem(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await exigirArea("estoque");

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, mensagem: "Contagem nao encontrada." };

  try {
    const repositorio = await obterRepositorioCadastros();
    await repositorio.removerContagem(id);
  } catch (erro) {
    return {
      ok: false,
      mensagem: `Nao foi possivel remover: ${
        erro instanceof Error ? erro.message : "erro desconhecido"
      }`,
    };
  }

  revalidatePath("/estoque");
  return { ok: true, mensagem: "Contagem removida." };
}
