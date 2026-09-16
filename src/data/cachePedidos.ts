/**
 * Cache dos pedidos da Nuvemshop, em disco.
 *
 * Por que existe: toda pagina do painel le a base inteira de pedidos (o RBT12
 * precisa de 12 meses). Uma loja de R$ 3 milhoes por mes tem ~100 mil pedidos
 * num ano; a 200 por chamada e 2 chamadas por segundo, buscar isso leva
 * minutos. Nenhuma tela pode esperar isso.
 *
 * Como funciona:
 *
 * 1. A primeira busca traz os ultimos `NUVEMSHOP_MESES` meses (padrao 13),
 *    mes a mes. De preferencia por `npm run nuvemshop:sincronizar`, antes de
 *    subir o painel -- senao a primeira pagina aberta espera por ela.
 * 2. Depois, a pagina responde com o que esta no disco e, se a copia tiver
 *    mais de `NUVEMSHOP_ATUALIZAR_MINUTOS` (padrao 10), pede a API em segundo
 *    plano so os pedidos ALTERADOS desde a ultima vez (`updated_at_min`).
 *    Boleto que foi pago, pedido cancelado, pedido novo: todos mudam o
 *    `updated_at`.
 * 3. O rodape de cada tela diz de quando e a copia (`estadoDaSincronizacao`).
 *    Numero de dez minutos atras, declarado, e melhor que tela travada.
 *
 * Mesma regra do repositorio de demonstracao (armadilha 2 do CLAUDE.md): o
 * arquivo e a fonte da verdade, e a memoria e so um atalho validado pela data
 * de modificacao. O Next carrega os modulos em mais de um grafo, e uma
 * variavel de modulo teria uma copia por grafo -- por isso o estado mora em
 * `globalThis`.
 *
 * O arquivo guarda pedidos SEM dado pessoal (ver `converterPedido`), e mesmo
 * assim e dado real do cliente: `.live-data/` esta no `.gitignore`.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

import type { CarrinhoAbandonado, Pedido } from "@/types/nuvemshop";
import {
  intervaloAtualizacaoNuvemshop,
  lojasNuvemshop,
  mesesNuvemshop,
  type LojaNuvemshop,
} from "@/lib/config";
import {
  limitesDoMes,
  mesclarPedidos,
  mesesAte,
  type CampoVigiado,
} from "@/lib/nuvemshop";
import { buscarCarrinhosDaLoja, buscarPedidosDaLoja } from "@/data/apiSource";

const VERSAO = 1;

/** Janela de seguranca na busca incremental: relogios diferem, e repetir e barato. */
const SOBREPOSICAO_MS = 10 * 60 * 1000;
const TRINTA_DIAS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Carrinhos abandonados sao buscados inteiros (30 dias) so de hora em hora.
 *
 * Numa loja deste porte sao dezenas de milhares por mes: a lista inteira custa
 * ~100 chamadas, e refaze-la a cada 10 minutos gastaria o limite da API com o
 * numero menos importante da tela (e rodape, secao 5.6). Entre uma lista
 * inteira e outra entram so os carrinhos novos.
 */
const CARRINHOS_COMPLETOS_A_CADA_MS = 60 * 60 * 1000;

export interface EstadoDaLoja {
  marca: string;
  /** Inicio da ultima busca que terminou bem (e nao o fim: pedido alterado durante a busca volta na proxima). */
  sincronizadoEm: string;
  /** Primeiro mes buscado. Se `NUVEMSHOP_MESES` aumentar, a loja e buscada de novo. */
  desdeMes: string;
  /** Ultima vez que a lista inteira de carrinhos foi buscada. */
  carrinhosCompletosEm?: string;
}

export interface BaseNuvemshop {
  versao: number;
  lojas: Record<string, EstadoDaLoja>;
  pedidos: Pedido[];
  carrinhos: CarrinhoAbandonado[];
  /** Quantos pedidos vieram sem cada campo vigiado, na ultima busca de cada loja. */
  ausentes: Record<string, Partial<Record<CampoVigiado, number>>>;
}

export interface EstadoDaSincronizacao {
  /** A copia mais velha entre as lojas. `null` enquanto nao houve busca. */
  atualizadoEm: string | null;
  sincronizando: boolean;
  ultimoErro: string | null;
}

const pasta = () =>
  process.env.NUVEMSHOP_CACHE_DIR || path.join(process.cwd(), ".live-data");
const arquivo = () => path.join(pasta(), "pedidos.json");

const global = globalThis as unknown as {
  __cacheNuvemshop?: {
    base: BaseNuvemshop | null;
    lidoComMtime: number;
    emAndamento: Promise<BaseNuvemshop> | null;
    ultimoErro: string | null;
  };
};
global.__cacheNuvemshop ??= { base: null, lidoComMtime: 0, emAndamento: null, ultimoErro: null };
const memoria = global.__cacheNuvemshop;

const vazia = (): BaseNuvemshop => ({
  versao: VERSAO,
  lojas: {},
  pedidos: [],
  carrinhos: [],
  ausentes: {},
});

async function lerDoDisco(): Promise<BaseNuvemshop> {
  let mtime: number;
  try {
    mtime = (await fs.stat(arquivo())).mtimeMs;
  } catch {
    return vazia();
  }
  if (memoria.base && memoria.lidoComMtime === mtime) return memoria.base;

  try {
    const lido = JSON.parse(await fs.readFile(arquivo(), "utf8")) as BaseNuvemshop;
    // Formato de outra versao: recomeca. Buscar de novo e mais seguro que migrar.
    const base = lido.versao === VERSAO ? lido : vazia();
    memoria.base = base;
    memoria.lidoComMtime = mtime;
    return base;
  } catch {
    return vazia();
  }
}

async function gravarNoDisco(base: BaseNuvemshop): Promise<void> {
  await fs.mkdir(pasta(), { recursive: true });
  // Grava ao lado e renomeia: uma pagina lendo no meio da gravacao nunca ve
  // meio arquivo.
  const temporario = `${arquivo()}.${process.pid}.tmp`;
  await fs.writeFile(temporario, JSON.stringify(base), "utf8");
  await fs.rename(temporario, arquivo());
  memoria.base = base;
  memoria.lidoComMtime = (await fs.stat(arquivo())).mtimeMs;
}

export interface ProgressoSincronizacao {
  loja: string;
  etapa: string;
  pedidos: number;
}

/**
 * Busca na API o que falta e grava. So uma de cada vez por processo.
 *
 * `completa` ignora a copia e busca a janela inteira de novo -- para quando
 * se desconfia do cache (ou depois de mudar a conversao de pedidos).
 */
export function sincronizar(
  opcoes: { completa?: boolean; aoAvancar?: (p: ProgressoSincronizacao) => void } = {},
): Promise<BaseNuvemshop> {
  memoria.emAndamento ??= executarSincronizacao(opcoes)
    .then((base) => {
      memoria.ultimoErro = null;
      return base;
    })
    .catch((erro: unknown) => {
      memoria.ultimoErro = erro instanceof Error ? erro.message : String(erro);
      throw erro;
    })
    .finally(() => {
      memoria.emAndamento = null;
    });
  return memoria.emAndamento;
}

async function executarSincronizacao({
  completa = false,
  aoAvancar,
}: {
  completa?: boolean;
  aoAvancar?: (p: ProgressoSincronizacao) => void;
}): Promise<BaseNuvemshop> {
  const lojas = lojasNuvemshop();
  if (lojas.length === 0) {
    throw new Error(
      "Nenhuma loja Nuvemshop configurada. Preencha NUVEMSHOP_LOJAS no .env.live (ver DADOS_REAIS.md).",
    );
  }

  const anterior = completa ? vazia() : await lerDoDisco();
  const agora = new Date();
  const meses = mesesAte(agora, mesesNuvemshop());
  const primeiroMes = meses[0]!;
  const desde = limitesDoMes(primeiroMes).inicio;

  const marcasAtivas = new Set(lojas.map((l) => l.marca));
  // Loja que saiu da configuracao leva os pedidos dela junto.
  let pedidos = anterior.pedidos.filter((p) => marcasAtivas.has(p.marca));
  const estadoLojas: Record<string, EstadoDaLoja> = {};
  const ausentes: BaseNuvemshop["ausentes"] = {};
  let carrinhos = anterior.carrinhos.filter((c) => marcasAtivas.has(c.marca));

  for (const loja of lojas) {
    const inicio = new Date().toISOString();
    const conhecida = anterior.lojas[loja.storeId];
    const incremental =
      conhecida && conhecida.marca === loja.marca && conhecida.desdeMes <= primeiroMes;

    const novos = incremental
      ? await buscarIncremental(loja, conhecida, aoAvancar)
      : await buscarJanela(loja, meses, aoAvancar);

    if (!incremental) {
      // Busca completa substitui tudo da loja, inclusive pedido que sumiu da API.
      pedidos = pedidos.filter((p) => p.marca !== loja.marca);
    }
    pedidos = mesclarPedidos(pedidos, novos.map((n) => n.pedido), desde);

    const contagem: Partial<Record<CampoVigiado, number>> = {};
    for (const n of novos) {
      for (const campo of n.ausentes) contagem[campo] = (contagem[campo] ?? 0) + 1;
    }
    ausentes[loja.storeId] = incremental
      ? somar(anterior.ausentes[loja.storeId] ?? {}, contagem)
      : contagem;

    const trintaDiasAtras = new Date(agora.getTime() - TRINTA_DIAS_MS).toISOString();
    const listaInteira =
      !incremental ||
      !conhecida.carrinhosCompletosEm ||
      agora.getTime() - new Date(conhecida.carrinhosCompletosEm).getTime() >
        CARRINHOS_COMPLETOS_A_CADA_MS;
    aoAvancar?.({
      loja: loja.marca,
      etapa: listaInteira ? "carrinhos abandonados" : "carrinhos novos",
      pedidos: novos.length,
    });
    const carrinhosNovos = await buscarCarrinhosDaLoja(
      loja,
      listaInteira
        ? trintaDiasAtras
        : new Date(new Date(conhecida.sincronizadoEm).getTime() - SOBREPOSICAO_MS).toISOString(),
    );
    carrinhos = mesclarCarrinhos(
      listaInteira ? carrinhos.filter((c) => c.marca !== loja.marca) : carrinhos,
      carrinhosNovos,
      trintaDiasAtras,
    );

    estadoLojas[loja.storeId] = {
      marca: loja.marca,
      sincronizadoEm: inicio,
      desdeMes: incremental ? conhecida.desdeMes : primeiroMes,
      carrinhosCompletosEm: listaInteira ? inicio : conhecida?.carrinhosCompletosEm,
    };
  }

  const base: BaseNuvemshop = {
    versao: VERSAO,
    lojas: estadoLojas,
    pedidos,
    carrinhos,
    ausentes,
  };
  await gravarNoDisco(base);
  return base;
}

async function buscarJanela(
  loja: LojaNuvemshop,
  meses: string[],
  aoAvancar?: (p: ProgressoSincronizacao) => void,
) {
  const todos = [];
  for (const mes of meses) {
    const { inicio, fim } = limitesDoMes(mes);
    const doMes = await buscarPedidosDaLoja(loja, { criadosDesde: inicio, criadosAte: fim });
    todos.push(...doMes);
    aoAvancar?.({ loja: loja.marca, etapa: `pedidos de ${mes}`, pedidos: todos.length });
  }
  return todos;
}

async function buscarIncremental(
  loja: LojaNuvemshop,
  conhecida: EstadoDaLoja,
  aoAvancar?: (p: ProgressoSincronizacao) => void,
) {
  const desde = new Date(new Date(conhecida.sincronizadoEm).getTime() - SOBREPOSICAO_MS);
  const novos = await buscarPedidosDaLoja(loja, { alteradosDesde: desde.toISOString() });
  aoAvancar?.({ loja: loja.marca, etapa: "pedidos alterados", pedidos: novos.length });
  return novos;
}

/** Mesma ideia de `mesclarPedidos`: o que chegou por ultimo vale, e o que passou de 30 dias sai. */
function mesclarCarrinhos(
  anteriores: CarrinhoAbandonado[],
  novos: CarrinhoAbandonado[],
  desde: string,
): CarrinhoAbandonado[] {
  const porChave = new Map<string, CarrinhoAbandonado>();
  for (const c of [...anteriores, ...novos]) porChave.set(`${c.marca}#${c.id}`, c);
  const limite = new Date(desde).getTime();
  return [...porChave.values()].filter((c) => new Date(c.created_at).getTime() >= limite);
}

function somar<K extends string>(
  a: Partial<Record<K, number>>,
  b: Partial<Record<K, number>>,
): Partial<Record<K, number>> {
  const total: Partial<Record<K, number>> = { ...a };
  for (const [chave, valor] of Object.entries(b) as [K, number][]) {
    total[chave] = (total[chave] ?? 0) + valor;
  }
  return total;
}

/** A copia mais velha entre as lojas configuradas; `null` se alguma nunca foi buscada. */
function copiaMaisVelha(base: BaseNuvemshop): string | null {
  const lojas = lojasNuvemshop();
  let maisVelha: string | null = null;
  for (const loja of lojas) {
    const estado = base.lojas[loja.storeId];
    if (!estado || estado.marca !== loja.marca) return null;
    if (!maisVelha || estado.sincronizadoEm < maisVelha) maisVelha = estado.sincronizadoEm;
  }
  return maisVelha;
}

/**
 * O que as paginas usam. Nunca espera a API se ja houver copia.
 *
 * Sem copia nenhuma (ou com loja nova na configuracao), espera a busca: nao
 * ha o que mostrar, e uma tela vazia diria que a loja nao vendeu nada.
 */
export async function obterBaseNuvemshop(): Promise<BaseNuvemshop> {
  const base = await lerDoDisco();
  const atualizadoEm = copiaMaisVelha(base);

  if (atualizadoEm === null) return sincronizar();

  const idade = Date.now() - new Date(atualizadoEm).getTime();
  if (idade > intervaloAtualizacaoNuvemshop() && !memoria.emAndamento) {
    // Em segundo plano. O erro fica registrado para o rodape.
    sincronizar().catch((erro: unknown) => {
      console.error("[nuvemshop] atualizacao falhou:", erro);
    });
  }
  return base;
}

export async function estadoDaSincronizacao(): Promise<EstadoDaSincronizacao> {
  const base = await lerDoDisco();
  return {
    atualizadoEm: copiaMaisVelha(base),
    sincronizando: memoria.emAndamento !== null,
    ultimoErro: memoria.ultimoErro,
  };
}

/** Para os scripts: resumo do que esta no disco. */
export async function lerCache(): Promise<BaseNuvemshop> {
  return lerDoDisco();
}

