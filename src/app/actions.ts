"use server";

import { revalidatePath } from "next/cache";

import { obterRepositorioCadastros } from "@/data";
import { lerReais } from "@/lib/fechamento";
import { moeda } from "@/lib/format";
import { exigirArea } from "@/lib/sessao";
import {
  CAMPOS_FECHAMENTO,
  ROTULO_CAMPO_FECHAMENTO,
  type CampoFechamento,
} from "@/types/fechamento";
import type { EstadoFormulario } from "@/types/formulario";

/** Teto de sanidade: um valor desses no fechamento e erro de digitacao. */
const MAXIMO = 10_000_000_000;

/**
 * Grava UM valor do fechamento do mes (5.1.3). Campo vazio volta ao calculado.
 *
 * Os outros dois campos do mes sao lidos do cadastro e mantidos: o formulario
 * so manda o campo que mudou.
 */
export async function salvarValorDoFechamento(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  // Server Action e endpoint publico (5.13).
  await exigirArea("financeiro");

  const mes = String(formData.get("mes") ?? "");
  const campo = String(formData.get("campo") ?? "") as CampoFechamento;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return { ok: false, mensagem: "Mês inválido." };
  if (!CAMPOS_FECHAMENTO.includes(campo)) return { ok: false, mensagem: "Campo inválido." };

  const valor = lerReais(String(formData.get("valor") ?? ""));
  if (valor !== null && (!Number.isFinite(valor) || valor < 0 || valor > MAXIMO)) {
    return { ok: false, mensagem: "Valor inválido. Use o formato 12.345,67." };
  }

  try {
    const repositorio = await obterRepositorioCadastros();
    const atual = (await repositorio.listarFechamentos()).find((f) => f.mes === mes);
    await repositorio.salvarFechamento({
      mes,
      impostos: atual?.impostos ?? null,
      difal: atual?.difal ?? null,
      frete: atual?.frete ?? null,
      [campo]: valor === null ? null : Math.round(valor * 100) / 100,
    });
  } catch (erro) {
    return {
      ok: false,
      mensagem: `Não foi possível salvar: ${erro instanceof Error ? erro.message : "erro desconhecido"}`,
    };
  }

  revalidatePath("/");
  const rotulo = ROTULO_CAMPO_FECHAMENTO[campo];
  return {
    ok: true,
    mensagem:
      valor === null
        ? `${rotulo}: voltou ao valor calculado.`
        : `${rotulo}: ${moeda(valor)} informado.`,
  };
}
