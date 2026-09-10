"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { obterRepositorioCadastros } from "@/data";
import { exigirArea } from "@/lib/sessao";
import type { EstadoFormulario } from "@/types/formulario";

/**
 * Numero digitado por humano brasileiro: "12,50" e "R$ 1.234,56" sao entradas
 * legitimas. Normaliza antes de validar, em vez de exigir formato do usuario.
 */
const valorMonetario = z.preprocess((entrada) => {
  if (typeof entrada !== "string") return entrada;
  const limpo = entrada
    .replace(/[R$\s]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  if (limpo === "") return 0;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : Number.NaN;
}, z.number({ invalid_type_error: "Valor invalido" }).min(0, "Nao pode ser negativo"));

const esquemaCusto = z.object({
  id: z.string().optional(),
  produtoId: z.coerce.number().int().positive("Produto invalido"),
  varianteId: z.preprocess(
    (v) => (v === "" || v === "todas" || v === null || v === undefined ? null : v),
    z.coerce.number().int().positive().nullable(),
  ),
  sku: z.string().trim().max(120).nullable().optional(),
  nome: z.string().trim().min(1, "Informe o nome do produto").max(200),
  custoMateriaPrima: valorMonetario,
  custoEmbalagem: valorMonetario,
  custoMaoDeObra: valorMonetario,
  custoIndireto: valorMonetario,
});

export async function salvarCusto(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  // A tela ja verifica, mas a action tambem precisa: Server Action e um
  // endpoint publico -- da para chama-la sem nunca abrir a pagina.
  await exigirArea("custos");

  const analise = esquemaCusto.safeParse({
    id: formData.get("id") || undefined,
    produtoId: formData.get("produtoId"),
    varianteId: formData.get("varianteId"),
    sku: formData.get("sku") || null,
    nome: formData.get("nome"),
    custoMateriaPrima: formData.get("custoMateriaPrima") ?? "0",
    custoEmbalagem: formData.get("custoEmbalagem") ?? "0",
    custoMaoDeObra: formData.get("custoMaoDeObra") ?? "0",
    custoIndireto: formData.get("custoIndireto") ?? "0",
  });

  if (!analise.success) {
    const primeiro = analise.error.issues[0];
    return {
      ok: false,
      mensagem: primeiro?.message ?? "Confira os campos preenchidos.",
    };
  }

  const { id, ...entrada } = analise.data;

  try {
    const repositorio = await obterRepositorioCadastros();
    await repositorio.salvarCusto({ ...entrada, sku: entrada.sku ?? null }, id);
  } catch (erro) {
    return {
      ok: false,
      mensagem: `Nao foi possivel salvar: ${
        erro instanceof Error ? erro.message : "erro desconhecido"
      }`,
    };
  }

  // O custo entra no CMV: o painel inteiro muda junto.
  revalidatePath("/custos");
  revalidatePath("/");

  return { ok: true, mensagem: `Custo de "${entrada.nome}" salvo.` };
}

export async function removerCusto(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await exigirArea("custos");

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, mensagem: "Ficha nao encontrada." };

  try {
    const repositorio = await obterRepositorioCadastros();
    await repositorio.removerCusto(id);
  } catch (erro) {
    return {
      ok: false,
      mensagem: `Nao foi possivel remover: ${
        erro instanceof Error ? erro.message : "erro desconhecido"
      }`,
    };
  }

  revalidatePath("/custos");
  revalidatePath("/");
  return { ok: true, mensagem: "Ficha de custo removida." };
}
