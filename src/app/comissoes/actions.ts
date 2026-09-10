"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { obterRepositorioCadastros } from "@/data";
import { exigirArea } from "@/lib/sessao";
import type { EstadoFormulario } from "@/types/formulario";

const percentualDigitado = z.preprocess((entrada) => {
  if (typeof entrada !== "string") return entrada;
  const limpo = entrada.replace(/[%\s]/g, "").replace(",", ".");
  if (limpo === "") return Number.NaN;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : Number.NaN;
}, z.number({ invalid_type_error: "Informe um percentual" }).min(0, "Nao pode ser negativo").max(100, "Nao pode passar de 100%"));

/** Receita de 12 meses digitada a mao. Vazio = calcular do historico. */
const rbt12Digitado = z.preprocess((entrada) => {
  if (typeof entrada !== "string") return entrada;
  const limpo = entrada
    .replace(/[R$\s]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  if (limpo === "") return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : Number.NaN;
}, z.number({ invalid_type_error: "Receita de 12 meses invalida" }).min(0).nullable());

const esquemaInfluencer = z.object({
  id: z.string().optional(),
  nome: z.string().trim().min(1, "Informe o nome do influencer").max(120),
  marca: z.string().trim().min(1, "Selecione a marca").max(120),
  percentual: percentualDigitado,
  baseComissao: z.enum(["bruto", "recebido", "receitaReal"], {
    errorMap: () => ({ message: "Base de calculo invalida" }),
  }),
  // O regime mora no influencer: cada marca e uma operacao separada, com o
  // seu proprio enquadramento. E dele que sai o imposto de cada produto.
  regime: z.enum(["simples_nacional", "lucro_presumido", "lucro_real"], {
    errorMap: () => ({ message: "Regime tributario invalido" }),
  }),
  anexoSimples: z.enum(["I", "II", "III", "IV", "V"]),
  uf: z.string().trim().length(2, "UF tem 2 letras").toUpperCase(),
  rbt12Manual: rbt12Digitado,
  ativo: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
  observacao: z.string().trim().max(400).nullable().optional(),
});

export async function salvarInfluencer(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  // Server Action e endpoint publico: verificar so na pagina nao basta.
  await exigirArea("financeiro");

  const analise = esquemaInfluencer.safeParse({
    id: formData.get("id") || undefined,
    nome: formData.get("nome"),
    marca: formData.get("marca"),
    percentual: formData.get("percentual"),
    baseComissao: formData.get("baseComissao"),
    regime: formData.get("regime") ?? "simples_nacional",
    anexoSimples: formData.get("anexoSimples") ?? "II",
    uf: formData.get("uf") ?? "GO",
    rbt12Manual: formData.get("rbt12Manual") ?? "",
    ativo: formData.get("ativo") ?? "false",
    observacao: formData.get("observacao") || null,
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
    await repositorio.salvarInfluencer(
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

  // A comissao entra na DRE: o painel principal muda junto.
  // Mudar o regime muda o imposto de todos os produtos deste influencer.
  revalidatePath("/comissoes");
  revalidatePath("/impostos");
  revalidatePath("/produtos");
  revalidatePath("/");

  return { ok: true, mensagem: `Contrato de "${entrada.nome}" salvo.` };
}

export async function removerInfluencer(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await exigirArea("financeiro");

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, mensagem: "Contrato nao encontrado." };

  try {
    const repositorio = await obterRepositorioCadastros();
    await repositorio.removerInfluencer(id);
  } catch (erro) {
    return {
      ok: false,
      mensagem: `Nao foi possivel remover: ${
        erro instanceof Error ? erro.message : "erro desconhecido"
      }`,
    };
  }

  revalidatePath("/comissoes");
  revalidatePath("/");
  return { ok: true, mensagem: "Contrato removido." };
}
