"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { obterRepositorioCadastros } from "@/data";
import { assinaturaTemTinta, normalizarTracos } from "@/lib/ordens";
import { origemDaRequisicao } from "@/lib/requisicao";
import { exigirArea } from "@/lib/sessao";
import type { EstadoFormulario } from "@/types/formulario";
import {
  MAXIMO_DE_ITENS,
  QUANTIDADE_MAXIMA,
  type ItemOrdem,
} from "@/types/ordemFabricacao";

/*
 * O que o navegador manda: a CHAVE do produto e a quantidade. Nada mais.
 *
 * Nome e SKU sao resolvidos aqui, contra o cadastro. Aceitar o nome que veio
 * do formulario deixaria assinar um documento dizendo "Serum Vitamina C" que
 * na verdade aponta para outro produto -- e o documento e justamente o que vai
 * servir de prova depois.
 */
const itemEnviado = z.object({
  chave: z.string().trim().min(1).max(60),
  quantidade: z.coerce.number().int().positive().max(QUANTIDADE_MAXIMA),
});

const listaDeItens = z.preprocess((entrada) => {
  if (typeof entrada !== "string" || entrada.trim() === "") return null;
  try {
    return JSON.parse(entrada);
  } catch {
    return null;
  }
}, z.array(itemEnviado).min(1, "Escolha pelo menos um produto").max(MAXIMO_DE_ITENS).nullable());

const tracosEnviados = z.preprocess((entrada) => {
  if (typeof entrada !== "string") return [];
  try {
    return normalizarTracos(JSON.parse(entrada));
  } catch {
    return [];
  }
}, z.array(z.array(z.number())));

const esquema = z.object({
  itens: listaDeItens,
  dataLancamento: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data de lançamento"),
  observacao: z.string().trim().max(600).nullable().optional(),
  nome: z
    .string()
    .trim()
    .min(3, "Escreva o seu nome completo")
    .max(120),
  tracos: tracosEnviados,
});

export async function criarOrdemDeFabricacao(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await exigirArea("produtos");

  const analise = esquema.safeParse({
    itens: formData.get("itens"),
    dataLancamento: formData.get("dataLancamento"),
    observacao: formData.get("observacao") || null,
    nome: formData.get("nome"),
    tracos: formData.get("tracos"),
  });

  if (!analise.success) {
    return { ok: false, mensagem: analise.error.issues[0]?.message ?? "Confira os campos." };
  }

  const dados = analise.data;
  if (dados.itens === null) {
    return { ok: false, mensagem: "Escolha pelo menos um produto." };
  }

  if (!assinaturaTemTinta(dados.tracos)) {
    return { ok: false, mensagem: "Assine no quadro antes de enviar o pedido." };
  }

  // Data no passado nao e pedido de fabricacao, e erro de digitacao. Hoje vale.
  const hoje = new Date().toISOString().slice(0, 10);
  if (dados.dataLancamento < hoje) {
    return { ok: false, mensagem: "A data de lançamento não pode estar no passado." };
  }

  const repositorio = await obterRepositorioCadastros();
  const produtos = await repositorio.listarProdutos();
  const porChave = new Map(produtos.map((p) => [p.chave, p]));

  const itens: ItemOrdem[] = [];
  for (const enviado of dados.itens) {
    const produto = porChave.get(enviado.chave);
    if (!produto) {
      return { ok: false, mensagem: "Um dos produtos escolhidos não existe mais no cadastro." };
    }
    if (itens.some((i) => i.chave === produto.chave)) {
      return { ok: false, mensagem: `"${produto.nome}" foi escolhido duas vezes.` };
    }
    itens.push({
      chave: produto.chave,
      // Copia do nome, no momento do pedido: renomear o produto depois nao
      // pode mudar o que ficou escrito no documento assinado.
      nome: produto.nome,
      sku: produto.sku,
      quantidade: enviado.quantidade,
    });
  }

  const origem = await origemDaRequisicao();

  try {
    await repositorio.criarOrdem({
      itens,
      dataLancamento: dados.dataLancamento,
      observacao: dados.observacao ?? null,
      solicitante: {
        nome: dados.nome,
        papel: "solicitante",
        tracos: dados.tracos,
        assinadoEm: new Date().toISOString(),
        ip: origem.ip,
        agente: origem.agente,
      },
    });
  } catch (erro) {
    return {
      ok: false,
      mensagem: `Nao foi possivel criar a ordem: ${
        erro instanceof Error ? erro.message : "erro desconhecido"
      }`,
    };
  }

  revalidatePath("/ordens");

  return {
    ok: true,
    mensagem: "Ordem criada e assinada. Copie o link e mande para a fábrica.",
  };
}

/**
 * Cancela uma ordem que ainda nao foi respondida.
 *
 * Cancelar nao apaga: a ordem fica na lista com a situacao trocada. Sumir com
 * o registro apagaria a evidencia de que o pedido chegou a ser feito, que e o
 * ponto inteiro desta tela.
 */
export async function cancelarOrdem(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await exigirArea("produtos");

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, mensagem: "Ordem não encontrada." };

  const repositorio = await obterRepositorioCadastros();
  const ordem = await repositorio.buscarOrdemPorId(id);
  if (!ordem) return { ok: false, mensagem: "Ordem não encontrada." };

  if (ordem.situacao !== "aguardando") {
    return { ok: false, mensagem: `A ordem ${ordem.numero} ja foi respondida.` };
  }

  await repositorio.gravarOrdem({
    ...ordem,
    situacao: "cancelada",
    fechadoEm: new Date().toISOString(),
  });

  revalidatePath("/ordens");
  return { ok: true, mensagem: `Ordem ${ordem.numero} cancelada.` };
}
