"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { obterRepositorioCadastros } from "@/data";
import { mesAno, moeda } from "@/lib/format";
import { exigirArea } from "@/lib/sessao";
import { CATEGORIAS_DESPESA, mesDaDespesa } from "@/types/dominio";
import type { EstadoFormulario } from "@/types/formulario";

/*
 * Acoes das despesas de influencer.
 *
 * Arquivo proprio, separado de actions.ts: o contrato e uma conversa (quanto e
 * devido por regra) e a despesa e outra (quanto foi gasto de fato). E arquivo
 * "use server", entao so exporta funcao async (armadilha 1 da secao 8).
 */

/** "1.234,56", "1234,56", "R$ 1.234,56" e "1234.56" viram 1234.56. */
const valorEmReais = z.preprocess(
  (entrada) => {
    if (typeof entrada !== "string") return entrada;
    const limpo = entrada
      .replace(/[R$\s]/g, "")
      .replace(/\.(?=\d{3}(\D|$))/g, "")
      .replace(",", ".");
    if (limpo === "") return Number.NaN;
    const numero = Number(limpo);
    return Number.isFinite(numero) ? numero : Number.NaN;
  },
  z
    .number({ invalid_type_error: "Informe o valor da despesa" })
    .positive("O valor precisa ser maior que zero")
    .max(10_000_000, "Valor alto demais — confira os zeros"),
);

const esquemaDespesa = z.object({
  id: z.string().trim().min(1).optional(),
  influencerId: z.string().trim().min(1, "Escolha o influencer"),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data da despesa"),
  categoria: z.enum(CATEGORIAS_DESPESA, {
    errorMap: () => ({ message: "Escolha a categoria" }),
  }),
  descricao: z
    .string()
    .trim()
    .min(2, "Descreva a despesa")
    .max(200, "Descrição longa demais"),
  valor: valorEmReais,
  /** Marcada: gravada sem dono e dividida entre todos (ver `ratearDespesas`). */
  compartilhada: z.boolean(),
  /** Mes aberto na tela, so para avisar quando a data cai em outro. */
  mes: z.string().optional(),
});

export async function salvarDespesaInfluencer(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  // Server Action e endpoint publico: a pagina bloquear nao basta (secao 5.13).
  await exigirArea("financeiro");

  const analise = esquemaDespesa.safeParse({
    id: formData.get("id") || undefined,
    influencerId: formData.get("influencerId"),
    data: formData.get("data"),
    categoria: formData.get("categoria"),
    descricao: formData.get("descricao"),
    valor: formData.get("valor"),
    // Checkbox desmarcado nao vai no formulario; marcado vai como "on".
    compartilhada: formData.get("compartilhada") === "on",
    mes: formData.get("mes") || undefined,
  });

  if (!analise.success) {
    return { ok: false, mensagem: analise.error.issues[0]?.message ?? "Confira os campos." };
  }

  const dados = analise.data;

  if (!dataExiste(dados.data)) {
    return { ok: false, mensagem: "Essa data não existe no calendário." };
  }

  const repositorio = await obterRepositorioCadastros();

  /*
   * O influencer chega num campo escondido, e campo escondido se altera. Sem
   * esta conferencia a despesa seria gravada apontando para ninguem: sumiria da
   * tela e nao entraria no lucro de marca nenhuma.
   */
  const influencers = await repositorio.listarInfluencers();
  if (!dados.compartilhada && !influencers.some((i) => i.id === dados.influencerId)) {
    return { ok: false, mensagem: "Influencer não encontrado." };
  }

  if (dados.id) {
    const atual = (await repositorio.listarDespesasInfluencer()).find((d) => d.id === dados.id);
    // Editar nao pode mudar a despesa de influencer por baixo dos panos. A
    // compartilhada nao tem dono: pode ser editada da grade de qualquer um.
    if (!atual || (atual.influencerId !== null && atual.influencerId !== dados.influencerId)) {
      return { ok: false, mensagem: "Despesa não encontrada." };
    }
  }

  try {
    await repositorio.salvarDespesaInfluencer(
      {
        influencerId: dados.compartilhada ? null : dados.influencerId,
        data: dados.data,
        categoria: dados.categoria,
        descricao: dados.descricao,
        // Centavo e a menor unidade que existe numa fatura.
        valor: Math.round(dados.valor * 100) / 100,
      },
      dados.id,
    );
  } catch (erro) {
    return {
      ok: false,
      mensagem: `Não foi possível salvar: ${erro instanceof Error ? erro.message : "erro desconhecido"}`,
    };
  }

  revalidarTelas();

  const verbo = dados.id ? "atualizada" : "cadastrada";
  const mesDaData = mesDaDespesa(dados);
  const nome = dados.compartilhada ? "Despesa compartilhada" : "Despesa";

  /*
   * Data fora do mes aberto: a despesa foi gravada, mas nao vai aparecer na
   * grade que a pessoa esta olhando. Sem este aviso parece que nao salvou, e a
   * reacao natural e cadastrar de novo -- duplicando o custo.
   */
  if (dados.mes && mesDaData !== dados.mes) {
    return {
      ok: true,
      mensagem: `${nome} ${verbo} em ${mesAno(mesDaData)} — por isso ela não aparece nesta grade de ${mesAno(dados.mes)}.`,
    };
  }

  if (dados.compartilhada) {
    return {
      ok: true,
      mensagem: `${nome} ${verbo}: ${moeda(dados.valor)} divididos entre os influencers pelo faturamento sem frete de cada marca.`,
    };
  }

  return { ok: true, mensagem: `${nome} ${verbo}.` };
}

export async function removerDespesaInfluencer(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await exigirArea("financeiro");

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, mensagem: "Despesa não encontrada." };

  try {
    const repositorio = await obterRepositorioCadastros();
    await repositorio.removerDespesaInfluencer(id);
  } catch (erro) {
    return {
      ok: false,
      mensagem: `Não foi possível remover: ${erro instanceof Error ? erro.message : "erro desconhecido"}`,
    };
  }

  revalidarTelas();
  return { ok: true, mensagem: "Despesa removida." };
}

/** A despesa sai do lucro: mexe na propria aba, no painel, no relatorio e no simulador. */
function revalidarTelas() {
  revalidatePath("/influencers");
  revalidatePath("/");
  revalidatePath("/relatorios");
  revalidatePath("/simulador");
}

/** "2026-02-31" passa na regex e nao existe. */
function dataExiste(data: string): boolean {
  const dia = new Date(`${data}T12:00:00Z`);
  return !Number.isNaN(dia.getTime()) && dia.toISOString().slice(0, 10) === data;
}
