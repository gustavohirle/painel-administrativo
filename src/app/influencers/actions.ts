"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { obterRepositorioCadastros } from "@/data";
import { aplicarDonosPelaLoja } from "@/data/donosPelaLoja";
import { exigirArea } from "@/lib/sessao";
import type { EstadoFormulario } from "@/types/formulario";

const percentualDigitado = z.preprocess((entrada) => {
  if (typeof entrada !== "string") return entrada;
  const limpo = entrada.replace(/[%\s]/g, "").replace(",", ".");
  if (limpo === "") return Number.NaN;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : Number.NaN;
}, z.number({ invalid_type_error: "Informe um percentual" }).min(0, "Não pode ser negativo").max(100, "Não pode passar de 100%"));

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
}, z.number({ invalid_type_error: "Receita de 12 meses inválida" }).min(0).nullable());

/**
 * CNPJ: guarda so os digitos, e recusa o que nao for um CNPJ de verdade.
 *
 * E a CHAVE do grupo do Simples (5.10.1). Se o mesmo CNPJ for digitado numa
 * loja com pontuacao e noutra sem, as duas viram grupos diferentes e cada uma
 * cai numa faixa que nao e a dela -- por isso a normalizacao acontece aqui, na
 * gravacao, e nao na leitura.
 *
 * Os digitos verificadores sao conferidos porque um erro de digitacao aqui nao
 * da erro em lugar nenhum: ele apenas separa em silencio duas lojas que
 * deveriam somar.
 */
const cnpjDigitado = z.preprocess(
  (entrada) => {
    if (typeof entrada !== "string") return entrada;
    const digitos = entrada.replace(/\D/g, "");
    return digitos === "" ? null : digitos;
  },
  z
    .string()
    .nullable()
    .refine((v) => v === null || v.length === 14, "CNPJ tem 14 dígitos")
    .refine((v) => v === null || cnpjValido(v), "CNPJ inválido — confira os dígitos"),
);

/** Digitos verificadores do CNPJ (modulo 11). */
function cnpjValido(digitos: string): boolean {
  if (/^(\d)\1{13}$/.test(digitos)) return false;
  const conta = (ate: number) => {
    let peso = ate - 7;
    let soma = 0;
    for (let i = ate - 1; i >= 0; i--) {
      soma += Number(digitos[i]) * peso;
      peso = peso === 2 ? 9 : peso - 1;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return conta(12) === Number(digitos[12]) && conta(13) === Number(digitos[13]);
}

/** Data "aaaa-mm-dd", ou `null` quando o campo vem vazio. */
const dataDigitada = z.preprocess(
  (entrada) => (typeof entrada === "string" && entrada.trim() === "" ? null : entrada),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data de início inválida")
    .nullable(),
);

const esquemaInfluencer = z.object({
  id: z.string().optional(),
  nome: z.string().trim().min(1, "Informe o nome do influencer").max(120),
  marca: z.string().trim().min(1, "Selecione a marca").max(120),
  percentual: percentualDigitado,
  baseComissao: z.enum(["bruto", "recebido", "receitaReal", "liquido"], {
    errorMap: () => ({ message: "Base de cálculo inválida" }),
  }),
  // O regime mora no influencer: cada marca e uma operacao separada, com o
  // seu proprio enquadramento. E dele que sai o imposto de cada produto.
  regime: z.enum(["simples_nacional", "lucro_presumido", "lucro_real"], {
    errorMap: () => ({ message: "Regime tributário inválido" }),
  }),
  anexoSimples: z.enum(["I", "II", "III", "IV", "V"]),
  uf: z.string().trim().length(2, "UF tem 2 letras").toUpperCase(),
  cnpj: cnpjDigitado,
  inicioAtividade: dataDigitada,
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
    cnpj: formData.get("cnpj") ?? "",
    inicioAtividade: formData.get("inicioAtividade") ?? "",
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

    // Um contrato ativo por marca (5.9): cada loja e de um influencer. Um
    // segundo contrato ativo na mesma marca ficaria sem efeito (o primeiro
    // manda) e deixaria a loja de origem dele sem dono.
    if (entrada.ativo) {
      const ocupada = (await repositorio.listarInfluencers()).find(
        (i) => i.ativo && i.marca === entrada.marca && i.id !== id,
      );
      if (ocupada) {
        return {
          ok: false,
          mensagem: `A marca "${entrada.marca}" já é do contrato de ${ocupada.nome}. Cada loja tem um influencer: confira a marca.`,
        };
      }
    }

    await repositorio.salvarInfluencer(
      { ...entrada, observacao: entrada.observacao ?? null },
      id,
    );
    // A loja decide o dono do produto: influencer novo (ou que mudou de
    // marca, ou foi desativado) leva junto os produtos da loja dele.
    await aplicarDonosPelaLoja(repositorio);
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
  revalidatePath("/influencers");
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
  if (!id) return { ok: false, mensagem: "Contrato não encontrado." };

  try {
    const repositorio = await obterRepositorioCadastros();
    await repositorio.removerInfluencer(id);
    await aplicarDonosPelaLoja(repositorio);
  } catch (erro) {
    return {
      ok: false,
      mensagem: `Nao foi possivel remover: ${
        erro instanceof Error ? erro.message : "erro desconhecido"
      }`,
    };
  }

  revalidatePath("/influencers");
  revalidatePath("/produtos");
  revalidatePath("/");
  return { ok: true, mensagem: "Contrato removido." };
}
