"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { obterRepositorioCadastros } from "@/data";
import { exigirArea } from "@/lib/sessao";
import { estadoPorUF } from "@/types/estados";
import type { EstadoFormulario } from "@/types/formulario";

/**
 * Percentual digitado por humano brasileiro: "18,5" e "18.5" sao a mesma coisa.
 * Normaliza antes de validar, em vez de exigir formato do usuario.
 */
const aliquotaDigitada = z.preprocess((entrada) => {
  if (typeof entrada !== "string") return entrada;
  const limpo = entrada.replace(/[%\s]/g, "").replace(",", ".");
  if (limpo === "") return 0;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : Number.NaN;
}, z
  .number({ invalid_type_error: "Aliquota invalida" })
  .min(0, "Nao pode ser negativa")
  .max(40, "Aliquota interna de ICMS acima de 40% nao existe -- confira"));

const booleano = z.preprocess(
  (v) => v === "on" || v === "true" || v === true,
  z.boolean(),
);

const esquema = z.object({
  uf: z.string().trim().length(2, "UF tem 2 letras").toUpperCase(),
  aliquotaInterna: aliquotaDigitada,
  ativo: booleano,
  confirmadoPeloContador: booleano,
  observacao: z.string().trim().max(400).nullable().optional(),
});

export async function salvarAliquotaEstadual(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await exigirArea("fiscal");

  const analise = esquema.safeParse({
    uf: formData.get("uf"),
    aliquotaInterna: formData.get("aliquotaInterna") ?? "0",
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

  const dados = analise.data;
  const estado = estadoPorUF(dados.uf);
  if (!estado) {
    return { ok: false, mensagem: `"${dados.uf}" nao e um estado brasileiro.` };
  }

  try {
    const repositorio = await obterRepositorioCadastros();
    await repositorio.salvarAliquotaEstadual({
      uf: estado.uf,
      // O nome vem da tabela, nao do formulario: nao ha por que deixar alguem
      // renomear "Sao Paulo" e quebrar o cruzamento com o pedido.
      nome: estado.nome,
      aliquotaInterna: dados.aliquotaInterna,
      ativo: dados.ativo,
      confirmadoPeloContador: dados.confirmadoPeloContador,
      observacao: dados.observacao ?? null,
    });
  } catch (erro) {
    return {
      ok: false,
      mensagem: `Nao foi possivel salvar: ${
        erro instanceof Error ? erro.message : "erro desconhecido"
      }`,
    };
  }

  // O DIFAL entra no total de impostos: o painel inteiro muda junto.
  revalidatePath("/difal");
  revalidatePath("/impostos");
  revalidatePath("/");

  return {
    ok: true,
    mensagem: `${estado.nome}: aliquota salva.`,
  };
}
