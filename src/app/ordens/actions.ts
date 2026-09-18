"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { obterRepositorioCadastros } from "@/data";
import { modoDemonstracao } from "@/lib/config";
import { assinaturaTemTinta, gerarDocumento, normalizarTracos } from "@/lib/ordens";
import {
  aplicarPasso,
  cancelarOrdem as fecharComCancelamento,
  conferenciaAprova,
  podeAssinar,
  podeCancelar,
  podeDecidirNaRevisao,
  problemaNoPasso,
  retomarOrdem as devolverParaConferencia,
} from "@/lib/processoOrdem";
import { origemDaRequisicao } from "@/lib/requisicao";
import { exigirArea } from "@/lib/sessao";
import type { EstadoFormulario } from "@/types/formulario";
import {
  ITENS_DE_CONFERENCIA,
  MAXIMO_DE_ITENS,
  QUANTIDADE_MAXIMA,
  type AssinaturaOrdem,
  type EtapaOrdem,
  type ItemDeConferencia,
  type ItemOrdem,
  type OrdemFabricacao,
  type PassoDaOrdem,
  type QuantidadePorItem,
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

const esquemaDaAbertura = z.object({
  itens: listaDeItens,
  dataLancamento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data de lançamento"),
  observacao: z.string().trim().max(600).nullable().optional(),
  nome: z.string().trim().min(3, "Escreva o seu nome completo").max(120),
  tracos: tracosEnviados,
});

/** A assinatura, montada no SERVIDOR: a hora e a origem nao vem do formulario. */
async function montarAssinatura(nome: string, tracos: number[][]): Promise<AssinaturaOrdem> {
  const origem = await origemDaRequisicao();
  return {
    nome,
    tracos,
    assinadoEm: new Date().toISOString(),
    ip: origem.ip,
    agente: origem.agente,
  };
}

// ---------------------------------------------------------------------------
// Abrir
// ---------------------------------------------------------------------------

export async function criarOrdemDeFabricacao(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const usuario = await exigirArea("produtos");

  const analise = esquemaDaAbertura.safeParse({
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
  if (dados.itens === null) return { ok: false, mensagem: "Escolha pelo menos um produto." };

  if (!assinaturaTemTinta(dados.tracos)) {
    return { ok: false, mensagem: "Assine no quadro antes de abrir a ordem." };
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

  try {
    const ordem = await repositorio.criarOrdem({
      itens,
      dataLancamento: dados.dataLancamento,
      observacao: dados.observacao ?? null,
      abertaPor: usuario.id,
      assinatura: await montarAssinatura(dados.nome, dados.tracos),
    });

    revalidatePath("/ordens");
    return {
      ok: true,
      mensagem: `Ordem ${ordem.numero} aberta e assinada. Agora ela está na conferência de insumos.`,
    };
  } catch (erro) {
    return {
      ok: false,
      mensagem: `Não foi possível abrir a ordem: ${
        erro instanceof Error ? erro.message : "erro desconhecido"
      }`,
    };
  }
}

// ---------------------------------------------------------------------------
// Assinar uma etapa
// ---------------------------------------------------------------------------

const ETAPAS_ASSINAVEIS: EtapaOrdem[] = [
  "conferencia",
  "fabricacao",
  "contagem",
  "envio",
  "recebimento",
];

/** As quantidades vem como "chave=valor" por linha do formulario. */
function lerQuantidades(formData: FormData, ordem: OrdemFabricacao): QuantidadePorItem {
  const quantidades: QuantidadePorItem = {};
  for (const item of ordem.itens) {
    const bruto = formData.get(`quantidade:${item.chave}`);
    /*
     * `Number("")` vale ZERO, nao NaN (armadilha 8 do CLAUDE.md). Campo vazio
     * aqui viraria "fabricou zero" em silencio, que e pior que recusar -- por
     * isso o vazio vira NaN de proposito, e `problemaNasQuantidades` reclama.
     */
    const texto = typeof bruto === "string" ? bruto.trim() : "";
    quantidades[item.chave] = texto === "" ? Number.NaN : Number(texto);
  }
  return quantidades;
}

/**
 * Assina a etapa atual e empurra a ordem para a proxima.
 *
 * Uma acao so para as cinco etapas, e nao cinco acoes parecidas: o que muda
 * entre elas sao os campos, e a sequencia -- conferir quem pode, validar,
 * aplicar, gravar -- e identica. Cinco copias divergiriam na primeira
 * correcao feita em uma delas.
 */
export async function assinarEtapa(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const usuario = await exigirArea("produtos");

  const id = String(formData.get("id") ?? "");
  const etapa = String(formData.get("etapa") ?? "") as EtapaOrdem;
  const nome = String(formData.get("nome") ?? "").trim();
  const observacao = String(formData.get("observacao") ?? "").trim();

  if (!ETAPAS_ASSINAVEIS.includes(etapa)) {
    return { ok: false, mensagem: "Etapa desconhecida." };
  }
  if (nome.length < 3) return { ok: false, mensagem: "Escreva o seu nome completo." };

  const tracos = tracosEnviados.safeParse(formData.get("tracos"));
  if (!tracos.success || !assinaturaTemTinta(tracos.data)) {
    return { ok: false, mensagem: "Assine no quadro antes de enviar." };
  }

  const repositorio = await obterRepositorioCadastros();
  const ordem = await repositorio.buscarOrdemPorId(id);
  if (!ordem) return { ok: false, mensagem: "Ordem não encontrada." };

  /*
   * A trava e AQUI, no servidor.
   *
   * Server Action e endereco publico (5.13): esconder o botao no navegador nao
   * impede nada. E a etapa tem que ser a ATUAL -- sem isso daria para assinar
   * o recebimento de uma ordem que ainda nem foi fabricada.
   */
  if (!podeAssinar(ordem, usuario)) {
    return { ok: false, mensagem: `A ordem ${ordem.numero} não está esperando a sua assinatura.` };
  }
  if (ordem.etapaAtual !== etapa) {
    return { ok: false, mensagem: `A ordem ${ordem.numero} já saiu dessa etapa. Recarregue a tela.` };
  }

  const passo: PassoDaOrdem = {
    etapa,
    usuarioId: usuario.id,
    assinatura: await montarAssinatura(nome, tracos.data),
    observacao: observacao || null,
  };

  const hoje = new Date().toISOString().slice(0, 10);
  const data = (campo: string) => {
    const valor = String(formData.get(campo) ?? "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : "";
  };

  switch (etapa) {
    case "conferencia": {
      const respostas = {} as Record<ItemDeConferencia, boolean>;
      for (const item of ITENS_DE_CONFERENCIA) {
        respostas[item] = formData.get(`conferencia:${item}`) === "sim";
      }
      passo.conferencia = {
        respostas,
        cumpreAData: formData.get("cumpreAData") === "sim",
        dataPossivel: data("dataPossivel") || null,
      };
      break;
    }
    case "fabricacao":
      passo.fabricacao = {
        dataFabricacao: data("dataFabricacao") || hoje,
        quantidades: lerQuantidades(formData, ordem),
      };
      break;
    case "contagem":
      passo.contagem = {
        dataContagem: data("dataContagem") || hoje,
        quantidades: lerQuantidades(formData, ordem),
      };
      break;
    case "envio":
      passo.envio = {
        dataEnvio: data("dataEnvio") || hoje,
        referencia: String(formData.get("referencia") ?? "").trim() || null,
      };
      break;
    case "recebimento":
      passo.recebimento = {
        dataRecebimento: data("dataRecebimento") || hoje,
        quantidades: lerQuantidades(formData, ordem),
      };
      break;
  }

  const problema = problemaNoPasso(ordem, passo);
  if (problema) return { ok: false, mensagem: problema };

  const resultado = aplicarPasso(ordem, passo, new Date());
  let atualizada = resultado.ordem;

  // A ordem que fecha ganha o documento, gerado UMA vez.
  if (atualizada.situacao === "concluida") {
    atualizada = {
      ...atualizada,
      documento: gerarDocumento(atualizada, {
        demonstracao: modoDemonstracao(),
        geradoEm: new Date(),
      }),
    };
  }

  await repositorio.gravarOrdem(atualizada);

  /*
   * O recebimento na Criar vira CONTAGEM DE ESTOQUE.
   *
   * E o mesmo lancamento que o estoquista faria na aba Estoque, e nao um
   * segundo mecanismo: o saldo continua sendo "ultima contagem - vendido desde
   * a contagem" (5.12). Por isso entra depois de gravar a ordem -- se a
   * contagem falhar, a ordem ja esta registrada e o estoquista lanca a mao,
   * em vez de perder a assinatura.
   */
  if (etapa === "recebimento" && passo.recebimento) {
    for (const item of ordem.itens) {
      const quantidade = passo.recebimento.quantidades[item.chave];
      if (typeof quantidade !== "number" || !Number.isFinite(quantidade)) continue;
      await repositorio.salvarContagem({
        chave: item.chave,
        nome: item.nome,
        quantidade,
        dataContagem: passo.recebimento.dataRecebimento,
        responsavel: nome,
        observacao: `Recebido da Demazon pela ordem ${ordem.numero}.`,
      });
    }
    revalidatePath("/estoque");
  }

  revalidatePath("/ordens");

  if (resultado.voltouParaRevisao) {
    return {
      ok: true,
      mensagem: `Conferência assinada. A ordem ${ordem.numero} voltou para quem abriu, com o que está faltando.`,
    };
  }
  if (atualizada.situacao === "concluida") {
    return {
      ok: true,
      mensagem: `Ordem ${ordem.numero} concluída. O documento assinado está pronto para baixar.`,
    };
  }
  return { ok: true, mensagem: `Etapa assinada. A ordem ${ordem.numero} seguiu em frente.` };
}

// ---------------------------------------------------------------------------
// Revisao, cancelamento e remocao
// ---------------------------------------------------------------------------

/**
 * O administrador aceita a nova data e devolve a ordem para a conferencia.
 *
 * A data e REESCRITA e o passo novo registra isso: o documento passa a afirmar
 * a data acordada, e o historico mostra qual era antes. Manter a data antiga
 * faria a ordem nascer atrasada para sempre.
 */
export async function retomarOrdem(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const usuario = await exigirArea("produtos");

  const id = String(formData.get("id") ?? "");
  const nome = String(formData.get("nome") ?? "").trim();
  const novaData = String(formData.get("dataLancamento") ?? "").trim();

  const repositorio = await obterRepositorioCadastros();
  const ordem = await repositorio.buscarOrdemPorId(id);
  if (!ordem) return { ok: false, mensagem: "Ordem não encontrada." };

  if (!podeDecidirNaRevisao(ordem, usuario)) {
    return { ok: false, mensagem: "Só um administrador decide numa ordem que voltou." };
  }
  if (nome.length < 3) return { ok: false, mensagem: "Escreva o seu nome completo." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(novaData)) {
    return { ok: false, mensagem: "Informe a nova data de lançamento." };
  }

  const tracos = tracosEnviados.safeParse(formData.get("tracos"));
  if (!tracos.success || !assinaturaTemTinta(tracos.data)) {
    return { ok: false, mensagem: "Assine no quadro antes de enviar." };
  }

  const passo: PassoDaOrdem = {
    etapa: "abertura",
    usuarioId: usuario.id,
    assinatura: await montarAssinatura(nome, tracos.data),
    observacao: `Nova data aceita: ${novaData}.`,
  };

  await repositorio.gravarOrdem(devolverParaConferencia(ordem, novaData, passo));
  revalidatePath("/ordens");

  return {
    ok: true,
    mensagem: `Ordem ${ordem.numero} devolvida para a conferência, com a data nova.`,
  };
}

/**
 * Cancela a ordem.
 *
 * Cancelar NAO apaga: a ordem fica na lista com a situacao trocada e o motivo
 * escrito. Sumir com o registro apagaria a evidencia de que o pedido chegou a
 * ser feito, que e o ponto inteiro desta tela.
 */
export async function cancelarOrdem(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const usuario = await exigirArea("produtos");

  const id = String(formData.get("id") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim();

  const repositorio = await obterRepositorioCadastros();
  const ordem = await repositorio.buscarOrdemPorId(id);
  if (!ordem) return { ok: false, mensagem: "Ordem não encontrada." };

  if (!podeCancelar(ordem, usuario)) {
    return { ok: false, mensagem: `A ordem ${ordem.numero} não pode mais ser cancelada.` };
  }
  if (motivo.length < 3) return { ok: false, mensagem: "Escreva o motivo do cancelamento." };

  await repositorio.gravarOrdem(fecharComCancelamento(ordem, motivo, new Date()));
  revalidatePath("/ordens");

  return { ok: true, mensagem: `Ordem ${ordem.numero} cancelada.` };
}

/**
 * APAGA a ordem, de vez.
 *
 * Existe para a FASE DE TESTE, a pedido do dono: experimentar o processo de
 * ponta a ponta gera ordens de mentira, e cancelar deixa todas elas na lista
 * para sempre. Some com o registro inteiro -- e por isso mesmo nao e o
 * caminho normal: o normal e cancelar, que preserva a evidencia.
 *
 * Quando o processo entrar em uso de verdade, apague esta acao e o botao.
 */
export async function removerOrdem(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const usuario = await exigirArea("produtos");
  if (usuario.perfil !== "dono") {
    return { ok: false, mensagem: "Só um administrador apaga uma ordem." };
  }

  const id = String(formData.get("id") ?? "");
  const repositorio = await obterRepositorioCadastros();
  const ordem = await repositorio.buscarOrdemPorId(id);
  if (!ordem) return { ok: false, mensagem: "Ordem não encontrada." };

  await repositorio.removerOrdem(id);
  revalidatePath("/ordens");

  return { ok: true, mensagem: `Ordem ${ordem.numero} apagada.` };
}
