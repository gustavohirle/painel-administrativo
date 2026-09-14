"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { obterRepositorioCadastros } from "@/data";
import { modoDemonstracao } from "@/lib/config";
import {
  assinaturaTemTinta,
  gerarDocumento,
  normalizarTracos,
} from "@/lib/ordens";
import { origemDaRequisicao } from "@/lib/requisicao";
import type { EstadoFormulario } from "@/types/formulario";
import type { AssinaturaOrdem, OrdemFabricacao } from "@/types/ordemFabricacao";

/*
 * ATENCAO: este arquivo NAO chama `exigirArea`. E deliberado.
 *
 * O responsavel pela fabricacao nao tem conta no painel, e exigir que tivesse
 * trocaria uma assinatura de trinta segundos no celular por um cadastro que
 * ninguem faz. Quem autoriza aqui e o TOKEN -- 32 bytes de `randomBytes`, no
 * link que a pessoa recebeu.
 *
 * Como Server Action e endpoint publico (secao 5.13), tudo que protege esta
 * escrito aqui dentro, e nao na pagina:
 *
 *   1. o token e revalidado a cada chamada, contra o banco;
 *   2. so ordem em `aguardando` aceita decisao -- assinar duas vezes nao
 *      sobrescreve o documento ja gerado;
 *   3. o formulario so consegue mandar nome, tracos e motivo. Item,
 *      quantidade e data vem do registro, nunca do corpo da requisicao. Se
 *      viessem, quem tivesse o link poderia assinar um documento com numeros
 *      diferentes dos que foram pedidos.
 */

const tracosEnviados = z.preprocess((entrada) => {
  if (typeof entrada !== "string") return [];
  try {
    return normalizarTracos(JSON.parse(entrada));
  } catch {
    return [];
  }
}, z.array(z.array(z.number())));

const esquemaAssinatura = z.object({
  token: z.string().trim().min(10).max(200),
  nome: z.string().trim().min(3, "Escreva o seu nome completo").max(120),
  tracos: tracosEnviados,
});

const esquemaRecusa = z.object({
  token: z.string().trim().min(10).max(200),
  nome: z.string().trim().min(3, "Escreva o seu nome completo").max(120),
  motivo: z
    .string()
    .trim()
    .min(5, "Diga o motivo -- e o que quem pediu vai ler")
    .max(600),
});

/** Busca a ordem pelo token e confirma que ela ainda aceita decisao. */
async function ordemAberta(
  token: string,
): Promise<{ ordem: OrdemFabricacao } | { erro: string }> {
  const repositorio = await obterRepositorioCadastros();
  const ordem = await repositorio.buscarOrdemPorToken(token);

  // Mesma mensagem para link errado e link inexistente: dizer "esta ordem
  // existe mas ja foi assinada" para um token invalido entregaria informacao
  // a quem esta tentando adivinhar.
  if (!ordem) return { erro: "Este link não vale mais." };

  if (ordem.situacao !== "aguardando") {
    return {
      erro: `A ordem ${ordem.numero} ja foi respondida. Recarregue a pagina para ver.`,
    };
  }

  return { ordem };
}

export async function assinarOrdem(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const analise = esquemaAssinatura.safeParse({
    token: formData.get("token"),
    nome: formData.get("nome"),
    tracos: formData.get("tracos"),
  });

  if (!analise.success) {
    return { ok: false, mensagem: analise.error.issues[0]?.message ?? "Confira os campos." };
  }

  const dados = analise.data;

  if (!assinaturaTemTinta(dados.tracos)) {
    return { ok: false, mensagem: "Assine no quadro antes de aprovar." };
  }

  const resultado = await ordemAberta(dados.token);
  if ("erro" in resultado) return { ok: false, mensagem: resultado.erro };

  const origem = await origemDaRequisicao();
  const agora = new Date();

  const aprovador: AssinaturaOrdem = {
    nome: dados.nome,
    papel: "aprovador",
    tracos: dados.tracos,
    assinadoEm: agora.toISOString(),
    ip: origem.ip,
    agente: origem.agente,
  };

  const assinada: OrdemFabricacao = {
    ...resultado.ordem,
    situacao: "aprovada",
    aprovador,
    fechadoEm: agora.toISOString(),
    documento: null,
  };

  /*
   * O PDF e gerado AGORA, uma vez, e guardado com a ordem.
   *
   * Nao e regerado no download: um documento reconstruido a cada leitura
   * mudaria junto com o codigo que o desenha, e a assinatura deixaria de se
   * referir a alguma coisa fixa. O que se guarda e o arquivo, com o hash dos
   * bytes ao lado.
   */
  assinada.documento = gerarDocumento(assinada, {
    demonstracao: modoDemonstracao(),
    geradoEm: agora,
  });

  const repositorio = await obterRepositorioCadastros();
  await repositorio.gravarOrdem(assinada);

  revalidatePath("/ordens");
  revalidatePath(`/assinar/${dados.token}`);

  return {
    ok: true,
    mensagem: `Ordem ${assinada.numero} aprovada e assinada. O PDF ja esta guardado.`,
  };
}

export async function recusarOrdem(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const analise = esquemaRecusa.safeParse({
    token: formData.get("token"),
    nome: formData.get("nome"),
    motivo: formData.get("motivo"),
  });

  if (!analise.success) {
    return { ok: false, mensagem: analise.error.issues[0]?.message ?? "Confira os campos." };
  }

  const dados = analise.data;
  const resultado = await ordemAberta(dados.token);
  if ("erro" in resultado) return { ok: false, mensagem: resultado.erro };

  /*
   * Recusa NAO gera PDF, e nao e esquecimento.
   *
   * O documento existe para provar um acordo, e recusa nao e acordo -- alem de
   * nao ter a assinatura dos dois lados, que e o que o papel afirma ter. Fica
   * o registro em tela, com quem recusou, quando e por que.
   */
  const repositorio = await obterRepositorioCadastros();
  await repositorio.gravarOrdem({
    ...resultado.ordem,
    situacao: "recusada",
    motivoRecusa: `${dados.motivo} (${dados.nome})`,
    fechadoEm: new Date().toISOString(),
  });

  revalidatePath("/ordens");
  revalidatePath(`/assinar/${dados.token}`);

  return { ok: true, mensagem: `Ordem ${resultado.ordem.numero} recusada. Quem pediu ja consegue ver o motivo.` };
}
