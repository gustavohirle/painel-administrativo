"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { obterFonteDePedidos, obterRepositorioCadastros } from "@/data";
import { produtosParaCadastrar } from "@/lib/costing";
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
    return { ok: false, mensagem: "Composição do kit inválida." };
  }
  // Kit sem componentes e aceito: a importacao da Nuvemshop marca os kits pelo
  // nome e a composicao vem depois. Ate la ele conta como item unico no
  // estoque, e o custo sai da ficha do proprio kit.

  // Produto novo sem id da Nuvemshop ganha um id interno na faixa reservada.
  const produtoId =
    dados.produtoId ?? FAIXA_MANUAL + Math.floor(Math.random() * 900_000);
  const varianteId = dados.varianteId ?? produtoId * 10 + 1;
  const chave = chaveProduto(produtoId, varianteId);

  // Kit que contem a si mesmo trava a expansao recursiva. Barra na entrada.
  if (dados.ehKit && dados.componentes.some((c) => c.chave === chave)) {
    return { ok: false, mensagem: "Um kit não pode conter ele mesmo." };
  }

  try {
    const repositorio = await obterRepositorioCadastros();

    /*
     * Cada loja Nuvemshop e de UM influencer. Havendo um influencer ativo so,
     * o produto e dele -- inclusive o criado a mao, que nao veio de loja
     * nenhuma. Resolvido no servidor: a tela manda o campo escondido, e
     * Server Action e endpoint publico (5.13).
     */
    let influencerId = dados.influencerId;
    if (!influencerId) {
      const ativos = (await repositorio.listarInfluencers()).filter((i) => i.ativo);
      if (ativos.length === 1) influencerId = ativos[0]!.id;
    }

    await repositorio.salvarProduto(
      {
        chave,
        produtoId,
        varianteId,
        nome: dados.nome,
        sku: dados.sku ?? null,
        ncm: dados.ncm ?? null,
        origem: dados.origem,
        influencerId,
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

/**
 * Grava no cadastro os produtos da Nuvemshop que ainda nao estao nele: o
 * catalogo da loja (pela API) mais o que vendeu.
 *
 * Nao recebe nada do formulario alem do clique: a lista sai do catalogo e dos
 * pedidos, no servidor. Aceitar a lista do navegador deixaria quem chama a
 * action (que e um endpoint publico, 5.13) gravar produto com qualquer id e nome.
 *
 * Se a API falhar, traz o que vendeu e diz que o catalogo ficou de fora --
 * melhor que nao trazer nada.
 */
export async function trazerProdutosDaNuvemshop(
  _anterior: EstadoFormulario,
  _formData: FormData,
): Promise<EstadoFormulario> {
  await exigirArea("produtos");

  try {
    const repositorio = await obterRepositorioCadastros();
    const fonte = obterFonteDePedidos();
    const [pedidos, produtos, impostos, influencers] = await Promise.all([
      fonte.listarPedidos(),
      repositorio.listarProdutos(),
      repositorio.listarImpostos(),
      repositorio.listarInfluencers(),
    ]);

    let catalogo: Awaited<ReturnType<typeof fonte.listarCatalogo>> = [];
    let avisoCatalogo = "";
    try {
      catalogo = await fonte.listarCatalogo();
    } catch (erro) {
      avisoCatalogo = ` O catálogo da Nuvemshop não respondeu (${
        erro instanceof Error ? erro.message : "erro desconhecido"
      }); vieram só os produtos vendidos.`;
    }

    const novos = produtosParaCadastrar(pedidos, produtos, impostos, influencers, catalogo);
    if (novos.length === 0) {
      return {
        ok: avisoCatalogo === "",
        mensagem: `Todos os produtos da Nuvemshop já estão no cadastro.${avisoCatalogo}`,
      };
    }
    for (const entrada of novos) await repositorio.salvarProduto(entrada);

    revalidatePath("/produtos");
    revalidatePath("/estoque");
    revalidatePath("/custos");
    revalidatePath("/impostos");
    revalidatePath("/");

    return {
      ok: true,
      mensagem: `${novos.length} produto(s) trazido(s) da Nuvemshop. Confira o influencer, o NCM e monte os kits.${avisoCatalogo}`,
    };
  } catch (erro) {
    return {
      ok: false,
      mensagem: `Não foi possível trazer os produtos: ${
        erro instanceof Error ? erro.message : "erro desconhecido"
      }`,
    };
  }
}

export async function removerProduto(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await exigirArea("produtos");

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, mensagem: "Produto não encontrado." };

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
