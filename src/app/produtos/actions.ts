"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { obterRepositorioCadastros } from "@/data";
import { exigirArea } from "@/lib/sessao";
import { chaveProduto } from "@/types/produto";
import type { EstadoFormulario } from "@/types/formulario";

/**
 * Faixa reservada para produto cadastrado a mao.
 *
 * Produto criado aqui ainda nao existe na Nuvemshop, entao nao tem
 * `product_id`. Um id proprio numa faixa alta evita colidir com os ids reais
 * quando o produto for criado na loja depois -- e a tela avisa que, ate os ids
 * reais serem informados, ele nao casa com nenhuma venda.
 */
const FAIXA_MANUAL = 9_000_000;

const componente = z.object({
  chave: z.string().trim().min(1),
  nome: z.string().trim().min(1).max(200),
  quantidade: z.coerce.number().int().positive().max(9999),
});

const listaDeComponentes = z.preprocess((entrada) => {
  if (typeof entrada !== "string") return [];
  if (entrada.trim() === "") return [];
  try {
    return JSON.parse(entrada);
  } catch {
    return null;
  }
}, z.array(componente).max(30, "Kit com componentes demais").nullable());

const booleano = z.preprocess(
  (v) => v === "on" || v === "true" || v === true,
  z.boolean(),
);

const idOpcional = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : v),
  z.coerce.number().int().positive().nullable(),
);

const esquema = z.object({
  id: z.string().optional(),
  produtoId: idOpcional,
  varianteId: idOpcional,
  nome: z.string().trim().min(1, "Informe o nome do produto").max(200),
  sku: z.string().trim().max(120).nullable().optional(),
  ncm: z.string().trim().max(20).nullable().optional(),
  origem: z.enum(["nuvemshop", "manual"]),
  // Um produto pertence a UM influencer. E dele que vem o regime, e do regime
  // vem o conjunto de impostos sugerido no formulario.
  influencerId: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : v),
    z.string().nullable(),
  ),
  impostosIds: z.preprocess(
    (v) => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]),
    z.array(z.string()),
  ),
  ehKit: booleano,
  componentes: listaDeComponentes,
  ativo: booleano,
  observacao: z.string().trim().max(600).nullable().optional(),
});

export async function salvarProduto(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await exigirArea("produtos");

  const analise = esquema.safeParse({
    id: formData.get("id") || undefined,
    produtoId: formData.get("produtoId"),
    varianteId: formData.get("varianteId"),
    nome: formData.get("nome"),
    sku: formData.get("sku") || null,
    ncm: formData.get("ncm") || null,
    origem: formData.get("origem") ?? "manual",
    influencerId: formData.get("influencerId") ?? null,
    // Checkbox repetido chega como varios valores no mesmo nome.
    impostosIds: formData.getAll("impostosIds"),
    ehKit: formData.get("ehKit") ?? "false",
    componentes: formData.get("componentes") ?? "[]",
    ativo: formData.get("ativo") ?? "false",
    observacao: formData.get("observacao") || null,
  });

  if (!analise.success) {
    return {
      ok: false,
      mensagem: analise.error.issues[0]?.message ?? "Confira os campos.",
    };
  }

  const dados = analise.data;

  if (dados.componentes === null) {
    return { ok: false, mensagem: "Composicao do kit invalida." };
  }
  if (dados.ehKit && dados.componentes.length === 0) {
    return {
      ok: false,
      mensagem: "Um kit precisa de pelo menos um componente.",
    };
  }

  // Produto novo sem id da Nuvemshop ganha um id interno na faixa reservada.
  const produtoId =
    dados.produtoId ?? FAIXA_MANUAL + Math.floor(Math.random() * 900_000);
  const varianteId = dados.varianteId ?? produtoId * 10 + 1;
  const chave = chaveProduto(produtoId, varianteId);

  // Kit que contem a si mesmo trava a expansao recursiva. Barra na entrada.
  if (dados.ehKit && dados.componentes.some((c) => c.chave === chave)) {
    return { ok: false, mensagem: "Um kit nao pode conter ele mesmo." };
  }

  try {
    const repositorio = await obterRepositorioCadastros();
    await repositorio.salvarProduto(
      {
        chave,
        produtoId,
        varianteId,
        nome: dados.nome,
        sku: dados.sku ?? null,
        ncm: dados.ncm ?? null,
        origem: dados.origem,
        influencerId: dados.influencerId,
        impostosIds: dados.impostosIds,
        ehKit: dados.ehKit,
        componentes: dados.ehKit ? dados.componentes : [],
        ativo: dados.ativo,
        observacao: dados.observacao ?? null,
      },
      dados.id,
    );
  } catch (erro) {
    return {
      ok: false,
      mensagem: `Nao foi possivel salvar: ${
        erro instanceof Error ? erro.message : "erro desconhecido"
      }`,
    };
  }

  // Produto muda imposto, custo de kit e estoque ao mesmo tempo.
  revalidatePath("/produtos");
  revalidatePath("/estoque");
  revalidatePath("/custos");
  revalidatePath("/");

  return { ok: true, mensagem: `Produto "${dados.nome}" salvo.` };
}

export async function removerProduto(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await exigirArea("produtos");

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, mensagem: "Produto nao encontrado." };

  try {
    const repositorio = await obterRepositorioCadastros();
    await repositorio.removerProduto(id);
  } catch (erro) {
    return {
      ok: false,
      mensagem: `Nao foi possivel remover: ${
        erro instanceof Error ? erro.message : "erro desconhecido"
      }`,
    };
  }

  revalidatePath("/produtos");
  revalidatePath("/estoque");
  revalidatePath("/custos");
  revalidatePath("/");
  return { ok: true, mensagem: "Produto removido do cadastro." };
}
