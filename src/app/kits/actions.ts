"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { obterRepositorioCadastros } from "@/data";
import { limparAvisoDeKit, MAXIMO_ITENS_KIT, validarComposicao } from "@/lib/kits";
import { exigirArea } from "@/lib/sessao";
import type { EstadoFormulario } from "@/types/formulario";
import type { EntradaProduto, Produto } from "@/types/produto";

const listaDoFormulario = z
  .array(
    z.object({
      chave: z.string().trim().min(1).max(80),
      quantidade: z.coerce.number(),
    }),
  )
  .max(MAXIMO_ITENS_KIT * 3, "Itens demais para um kit.");

/** Kit e cadastro de produto: muda custo, estoque e imposto de uma vez. */
function revalidarTelas() {
  revalidatePath("/kits");
  revalidatePath("/produtos");
  revalidatePath("/custos");
  revalidatePath("/estoque");
  revalidatePath("/");
}

function semIdentidade(produto: Produto): EntradaProduto {
  const { id: _id, atualizadoEm: _atualizadoEm, ...entrada } = produto;
  return entrada;
}

/**
 * Grava a composicao de um kit.
 *
 * Do formulario so vem o id do kit e a lista de {chave, quantidade}; o resto
 * (nome dos itens, existencia, ciclo) e conferido aqui, contra o cadastro.
 */
export async function salvarComposicaoKit(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await exigirArea("produtos");

  let bruto: unknown;
  try {
    bruto = JSON.parse(String(formData.get("componentes") ?? "[]"));
  } catch {
    return { ok: false, mensagem: "Composição inválida. Recarregue a página e tente de novo." };
  }
  const lista = listaDoFormulario.safeParse(bruto);
  if (!lista.success) {
    return { ok: false, mensagem: lista.error.issues[0]?.message ?? "Composição inválida." };
  }

  try {
    const repositorio = await obterRepositorioCadastros();
    const produtos = await repositorio.listarProdutos();
    const kit = produtos.find((p) => p.id === String(formData.get("id") ?? ""));
    if (!kit) return { ok: false, mensagem: "Kit não encontrado. Ele pode ter sido removido." };

    const resultado = validarComposicao(kit, lista.data, produtos);
    if (!resultado.ok) return resultado;

    const { componentes } = resultado;
    await repositorio.salvarProduto(
      {
        ...semIdentidade(kit),
        ehKit: true,
        componentes,
        observacao: componentes.length > 0 ? limparAvisoDeKit(kit.observacao) : kit.observacao,
      },
      kit.id,
    );
    revalidarTelas();

    const unidades = componentes.reduce((s, c) => s + c.quantidade, 0);
    return {
      ok: true,
      mensagem:
        componentes.length === 0
          ? `"${kit.nome}" ficou sem itens. O custo dele volta a depender da ficha própria.`
          : `Composição salva: ${componentes.length} item(ns), ${unidades} unidade(s) por kit.`,
    };
  } catch (erro) {
    return {
      ok: false,
      mensagem: `Não foi possível salvar: ${erro instanceof Error ? erro.message : "erro desconhecido"}`,
    };
  }
}

/**
 * Marca como kit um produto que a importacao nao reconheceu pelo nome.
 * Entra sem itens; a composicao se monta na propria aba.
 */
export async function incluirKit(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await exigirArea("produtos");

  try {
    const repositorio = await obterRepositorioCadastros();
    const produtos = await repositorio.listarProdutos();
    const produto = produtos.find((p) => p.id === String(formData.get("id") ?? ""));
    if (!produto) return { ok: false, mensagem: "Escolha um produto da lista." };
    if (produto.ehKit) return { ok: true, mensagem: `"${produto.nome}" já está entre os kits.` };

    await repositorio.salvarProduto({ ...semIdentidade(produto), ehKit: true, componentes: [] }, produto.id);
    revalidarTelas();
    return { ok: true, mensagem: `"${produto.nome}" entrou nos kits. Agora é só montar.` };
  } catch (erro) {
    return {
      ok: false,
      mensagem: `Não foi possível incluir: ${erro instanceof Error ? erro.message : "erro desconhecido"}`,
    };
  }
}
