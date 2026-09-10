"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { obterRepositorioCadastros } from "@/data";
import { exigirArea } from "@/lib/sessao";
import type { EstadoFormulario } from "@/types/formulario";

/**
 * Numero digitado por humano brasileiro: "12,5" e "12.5" sao a mesma coisa.
 * Normaliza antes de validar, em vez de exigir formato do usuario.
 */
const percentualDigitado = z.preprocess((entrada) => {
  if (typeof entrada !== "string") return entrada;
  const limpo = entrada.replace(/[%\s]/g, "").replace(",", ".");
  if (limpo === "") return 0;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : Number.NaN;
}, z.number({ invalid_type_error: "Aliquota invalida" }).min(0, "Nao pode ser negativa").max(100, "Nao pode passar de 100%"));

const booleano = z.preprocess(
  (v) => v === "on" || v === "true" || v === true,
  z.boolean(),
);

const esquemaImposto = z.object({
  id: z.string().optional(),
  nome: z.string().trim().min(1, "Informe o nome do imposto").max(160),
  sigla: z.string().trim().min(1, "Informe a sigla").max(20),
  esfera: z.enum(["federal", "estadual", "municipal"]),
  baseIncidencia: z.enum(["receita", "lucro"]),
  aliquota: percentualDigitado,
  dentroDoDAS: booleano,
  aplicacaoPorProduto: booleano,
  ativo: booleano,
  confirmadoPeloContador: booleano,
  observacao: z.string().trim().max(600).nullable().optional(),
});

export async function salvarImposto(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await exigirArea("fiscal");

  const analise = esquemaImposto.safeParse({
    id: formData.get("id") || undefined,
    nome: formData.get("nome"),
    sigla: formData.get("sigla"),
    esfera: formData.get("esfera"),
    baseIncidencia: formData.get("baseIncidencia") ?? "receita",
    aliquota: formData.get("aliquota") ?? "0",
    dentroDoDAS: formData.get("dentroDoDAS") ?? "false",
    aplicacaoPorProduto: formData.get("aplicacaoPorProduto") ?? "false",
    ativo: formData.get("ativo") ?? "false",
    confirmadoPeloContador: formData.get("confirmadoPeloContador") ?? "false",
    observacao: formData.get("observacao") || null,
  });

  if (!analise.success) {
    return {
      ok: false,
      mensagem: analise.error.issues[0]?.message ?? "Confira os campos.",
    };
  }

  const { id, ...entrada } = analise.data;

  try {
    const repositorio = await obterRepositorioCadastros();
    await repositorio.salvarImposto(
      { ...entrada, observacao: entrada.observacao ?? null },
      id,
    );
  } catch (erro) {
    return {
      ok: false,
      mensagem: `Nao foi possivel salvar: ${
        erro instanceof Error ? erro.message : "erro desconhecido"
      }`,
    };
  }

  // Imposto entra na DRE: o painel inteiro muda junto.
  revalidatePath("/impostos");
  revalidatePath("/");
  revalidatePath("/produtos");

  return { ok: true, mensagem: `Imposto "${entrada.sigla}" salvo.` };
}

export async function removerImposto(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await exigirArea("fiscal");

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, mensagem: "Imposto nao encontrado." };

  try {
    const repositorio = await obterRepositorioCadastros();
    await repositorio.removerImposto(id);
  } catch (erro) {
    return {
      ok: false,
      mensagem: `Nao foi possivel remover: ${
        erro instanceof Error ? erro.message : "erro desconhecido"
      }`,
    };
  }

  revalidatePath("/impostos");
  revalidatePath("/");
  revalidatePath("/produtos");
  return { ok: true, mensagem: "Imposto removido." };
}

// ---------------------------------------------------------------------------

const valorMonetario = z.preprocess((entrada) => {
  if (typeof entrada !== "string") return entrada;
  const limpo = entrada
    .replace(/[R$\s]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  if (limpo === "") return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : Number.NaN;
}, z.number({ invalid_type_error: "Valor invalido" }).min(0).nullable());

const esquemaConfig = z.object({
  regime: z.enum(["simples_nacional", "lucro_presumido", "lucro_real"]),
  anexoSimples: z.enum(["I", "II", "III", "IV", "V"]),
  uf: z.string().trim().length(2, "UF tem 2 letras").toUpperCase(),
  rbt12Manual: valorMonetario,
});

export async function salvarConfiguracaoFiscal(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await exigirArea("fiscal");

  const analise = esquemaConfig.safeParse({
    regime: formData.get("regime"),
    anexoSimples: formData.get("anexoSimples") ?? "II",
    uf: formData.get("uf") ?? "GO",
    rbt12Manual: formData.get("rbt12Manual") ?? "",
  });

  if (!analise.success) {
    return {
      ok: false,
      mensagem: analise.error.issues[0]?.message ?? "Confira os campos.",
    };
  }

  try {
    const repositorio = await obterRepositorioCadastros();
    await repositorio.salvarConfiguracaoFiscal(analise.data);
  } catch (erro) {
    return {
      ok: false,
      mensagem: `Nao foi possivel salvar: ${
        erro instanceof Error ? erro.message : "erro desconhecido"
      }`,
    };
  }

  revalidatePath("/impostos");
  revalidatePath("/");
  return { ok: true, mensagem: "Configuracao fiscal salva." };
}
