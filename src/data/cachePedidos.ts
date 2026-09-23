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
import type { SincronizacaoNaTela } from "@/types/sincronizacao";
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

/**
 * O que o rodape e o selo do cabecalho mostram.
 *
 * A forma mora em `types/sincronizacao.ts`: o selo e componente de navegador,
 * e importar o tipo daqui traria este modulo junto, com `node:fs` dentro.
 */
export type EstadoDaSincronizacao = SincronizacaoNaTela;

const pasta = () =>
  process.env.NUVEMSHOP_CACHE_DIR || path.join(process.cwd(), ".live-data");

/*
 * UM ARQUIVO POR LOJA E POR MES.
 *
 * O arquivo unico funcionou enquanto a janela era de 3 meses (41 MB, 5 lojas).
 * Com 13 meses a loja maior sozinha da 230 MB, e o problema nao e o disco: um
 * JSON de 230 MB vira uma string de ~460 MB na memoria (V8 guarda texto em
 * UTF-16) mais o grafo de objetos, e `JSON.parse` precisa dos dois ao mesmo
 * tempo. Num processo com 2 GB de heap isso estoura.
 *
 * E estourou, em 23/09/2026, em producao: a leitura da loja maior falhou, a
 * gravacao seguinte salvou o que sobrou por cima, e 239 mil pedidos de 13
 * meses viraram 45. Ver `lerDaLoja` -- a falha agora e FATAL, de proposito.
 *
 * Por mes, o maior arquivo passa a ser o maior mes da maior loja (~30 MB), e
 * ele para de crescer com a janela: aumentar `NUVEMSHOP_MESES` acrescenta
 * arquivos, nao engorda os que existem.
 */
const indice = () => path.join(pasta(), "indice.json");
const pastaDaLoja = (storeId: string) => path.join(pasta(), `loja-${storeId}`);
const arquivoDoMes = (storeId: string, mes: string) =>
  path.join(pastaDaLoja(storeId), `pedidos-${mes}.json`);
/** Carrinho e janela de 30 dias: cabe num arquivo so, e nao cresce com a janela. */
const arquivoDosCarrinhos = (storeId: string) =>
  path.join(pastaDaLoja(storeId), "carrinhos.json");

/** Formatos antigos, lidos uma vez e convertidos (ver `migrar`). */
const arquivoAntigo = () => path.join(pasta(), "pedidos.json");
const arquivoAntigoDaLoja = (storeId: string) => path.join(pasta(), `loja-${storeId}.json`);

/** O que o indice guarda: tudo menos os pedidos e os carrinhos. */
interface IndiceNoDisco {
  versao: number;
  lojas: Record<string, EstadoDaLoja>;
  ausentes: BaseNuvemshop["ausentes"];
}

/** O que cada arquivo de loja guardava no formato anterior. So a migracao le. */
interface LojaNoDiscoAntigo {
  pedidos: Pedido[];
  carrinhos: CarrinhoAbandonado[];
}

const global = globalThis as unknown as {
  __cacheNuvemshop?: {
    base: BaseNuvemshop | null;
    /** mtime do indice e de cada arquivo de loja, juntos. */
    assinatura: string | null;
    emAndamento: Promise<ResultadoSincronizacao> | null;
    ultimoErro: string | null;
    /** Quando a ultima busca falhou (em alguma loja); 0 se deu certo. */
    falhouEm: number;
  };
};
global.__cacheNuvemshop ??= {
  base: null,
  assinatura: null,
  emAndamento: null,
  ultimoErro: null,
  falhouEm: 0,
};
global.__cacheNuvemshop.falhouEm ??= 0;
const memoria = global.__cacheNuvemshop;

const vazia = (): BaseNuvemshop => ({
  versao: VERSAO,
  lojas: {},
  pedidos: [],
  carrinhos: [],
  ausentes: {},
});

/** Grava ao lado e renomeia: quem le no meio da gravacao nunca ve meio arquivo. */
async function gravarArquivo(caminho: string, conteudo: unknown): Promise<void> {
  const temporario = `${caminho}.${process.pid}.tmp`;
  await fs.writeFile(temporario, JSON.stringify(conteudo), "utf8");
  await fs.rename(temporario, caminho);
}

const chaveDoMes = (pedido: Pedido) => String(pedido.created_at).slice(0, 7);

/**
 * Assinatura da copia em disco: o `mtime` do indice e o de cada pasta de loja.
 *
 * Com um arquivo so bastava o mtime dele. Agora um mes de uma loja pode mudar
 * sem o indice mudar, e a memoria ficaria servindo a copia velha.
 */
async function assinaturaDoDisco(storeIds: string[]): Promise<string> {
  const partes: string[] = [];
  for (const caminho of [indice(), ...storeIds.map(pastaDaLoja)]) {
    try {
      partes.push(`${caminho}:${(await fs.stat(caminho)).mtimeMs}`);
    } catch {
      partes.push(`${caminho}:-`);
    }
  }
  return partes.join(",");
}

/**
 * Le os pedidos e os carrinhos de uma loja, um mes por vez.
 *
 * A falha aqui e FATAL de proposito, e a licao custou 44 minutos de busca.
 * Antes ela era engolida por um `catch` que seguia com a loja vazia -- e a
 * gravacao seguinte salvava esse vazio por cima, apagando 13 meses de pedidos
 * que ja estavam no disco. Copia velha e um problema; copia APAGADA e outro,
 * muito maior. Ninguem sobrescreve o que nao conseguiu ler.
 */
async function lerDaLoja(storeId: string): Promise<LojaNoDiscoAntigo> {
  const pedidos: Pedido[] = [];
  const carrinhos: CarrinhoAbandonado[] = [];

  let nomes: string[];
  try {
    nomes = await fs.readdir(pastaDaLoja(storeId));
  } catch {
    // Pasta ausente e loja que nunca foi buscada: nao ha nada a perder.
    return { pedidos, carrinhos };
  }

  /*
   * Um arquivo por vez, e nao `Promise.all`: em paralelo todas as strings de
   * origem ficariam vivas ao mesmo tempo, que e exatamente o pico que este
   * formato existe para evitar.
   */
  for (const nome of nomes.filter((n) => n.startsWith("pedidos-")).sort()) {
    const lido = JSON.parse(
      await fs.readFile(path.join(pastaDaLoja(storeId), nome), "utf8"),
    ) as Pedido[];
    if (Array.isArray(lido)) pedidos.push(...lido);
  }

  try {
    const lido = JSON.parse(
      await fs.readFile(arquivoDosCarrinhos(storeId), "utf8"),
    ) as CarrinhoAbandonado[];
    if (Array.isArray(lido)) carrinhos.push(...lido);
  } catch {
    // Carrinho e o numero menos importante da tela (5.6) e se refaz de hora em
    // hora; perde-lo nao justifica derrubar a leitura dos pedidos.
  }

  return { pedidos, carrinhos };
}

/** Grava uma loja: um arquivo por mes, mais o dos carrinhos. */
async function gravarLoja(
  storeId: string,
  pedidos: Pedido[],
  carrinhos: CarrinhoAbandonado[],
): Promise<void> {
  await fs.mkdir(pastaDaLoja(storeId), { recursive: true });

  const porMes = new Map<string, Pedido[]>();
  for (const pedido of pedidos) {
    const mes = chaveDoMes(pedido);
    const lista = porMes.get(mes);
    if (lista) lista.push(pedido);
    else porMes.set(mes, [pedido]);
  }

  for (const [mes, doMes] of porMes) {
    await gravarArquivo(arquivoDoMes(storeId, mes), doMes);
  }
  await gravarArquivo(arquivoDosCarrinhos(storeId), carrinhos);

  // Mes que saiu da janela leva o arquivo dele junto.
  for (const nome of await fs.readdir(pastaDaLoja(storeId))) {
    const achado = /^pedidos-(\d{4}-\d{2})\.json$/.exec(nome);
    if (achado && !porMes.has(achado[1]!)) {
      await fs.rm(path.join(pastaDaLoja(storeId), nome), { force: true });
    }
  }
}

/**
 * Converte as copias de formato antigo: primeiro o arquivo unico, depois o de
 * um arquivo por loja (sem a quebra por mes).
 *
 * Roda na primeira leitura depois do deploy, e so apaga a copia antiga depois
 * que a nova esta gravada -- falha no meio nao perde nada.
 */
async function migrar(cabecalho: IndiceNoDisco | null): Promise<IndiceNoDisco | null> {
  // 1. Arquivo unico (`pedidos.json`).
  try {
    const antigo = JSON.parse(await fs.readFile(arquivoAntigo(), "utf8")) as BaseNuvemshop;
    if (antigo.versao === VERSAO && Array.isArray(antigo.pedidos)) {
      for (const [storeId, estado] of Object.entries(antigo.lojas ?? {})) {
        await gravarLoja(
          storeId,
          antigo.pedidos.filter((p) => p.marca === estado.marca),
          (antigo.carrinhos ?? []).filter((c) => c.marca === estado.marca),
        );
      }
      const novo: IndiceNoDisco = {
        versao: VERSAO,
        lojas: antigo.lojas ?? {},
        ausentes: antigo.ausentes ?? {},
      };
      await gravarArquivo(indice(), novo);
      await fs.rm(arquivoAntigo(), { force: true });
      return novo;
    }
  } catch {
    // Nao existe ou nao serve: tenta o formato seguinte.
  }

  // 2. Um arquivo por loja (`loja-<id>.json`).
  if (!cabecalho) return null;
  for (const storeId of Object.keys(cabecalho.lojas)) {
    let antigo: LojaNoDiscoAntigo;
    try {
      antigo = JSON.parse(
        await fs.readFile(arquivoAntigoDaLoja(storeId), "utf8"),
      ) as LojaNoDiscoAntigo;
    } catch {
      continue;
    }
    await gravarLoja(storeId, antigo.pedidos ?? [], antigo.carrinhos ?? []);
    await fs.rm(arquivoAntigoDaLoja(storeId), { force: true });
  }
  return cabecalho;
}

/** `true` se a loja ja tem a pasta do formato novo. */
async function temPastaNova(storeId: string): Promise<boolean> {
  try {
    return (await fs.stat(pastaDaLoja(storeId))).isDirectory();
  } catch {
    return false;
  }
}

async function lerDoDisco(): Promise<BaseNuvemshop> {
  await fs.mkdir(pasta(), { recursive: true });

  let cabecalho: IndiceNoDisco | null = null;
  try {
    const lido = JSON.parse(await fs.readFile(indice(), "utf8")) as IndiceNoDisco;
    // Formato de outra versao: recomeca. Buscar de novo e mais seguro que migrar.
    cabecalho = lido.versao === VERSAO ? lido : null;
  } catch {
    cabecalho = null;
  }

  /*
   * Converte quando nao ha indice utilizavel, ou quando ha indice mas alguma
   * loja ainda esta no formato de arquivo unico por loja.
   */
  const storeIdsConhecidos = cabecalho ? Object.keys(cabecalho.lojas) : [];
  const faltaConverter =
    cabecalho === null ||
    (
      await Promise.all(storeIdsConhecidos.map(temPastaNova))
    ).some((tem) => !tem);
  if (faltaConverter) cabecalho = (await migrar(cabecalho)) ?? cabecalho;
  if (!cabecalho) return vazia();

  const storeIds = Object.keys(cabecalho.lojas);
  const assinatura = await assinaturaDoDisco(storeIds);
  if (memoria.base && memoria.assinatura === assinatura) return memoria.base;

  const pedidos: Pedido[] = [];
  const carrinhos: CarrinhoAbandonado[] = [];
  for (const storeId of storeIds) {
    const daLoja = await lerDaLoja(storeId);
    pedidos.push(...daLoja.pedidos);
    carrinhos.push(...daLoja.carrinhos);
  }

  const base: BaseNuvemshop = {
    versao: VERSAO,
    lojas: cabecalho.lojas,
    pedidos,
    carrinhos,
    ausentes: cabecalho.ausentes ?? {},
  };
  memoria.base = base;
  memoria.assinatura = assinatura;
  return base;
}

/**
 * Grava a copia. `storeIdsAlterados` limita a escrita as lojas que mudaram --
 * reescrever todas a cada 5 minutos seria centenas de MB de disco por hora
 * para nada.
 */
async function gravarNoDisco(
  base: BaseNuvemshop,
  storeIdsAlterados?: string[],
): Promise<void> {
  await fs.mkdir(pasta(), { recursive: true });

  const marcaDaLoja = new Map(
    Object.entries(base.lojas).map(([storeId, estado]) => [storeId, estado.marca]),
  );
  const aGravar = storeIdsAlterados ?? [...marcaDaLoja.keys()];

  for (const storeId of aGravar) {
    const marca = marcaDaLoja.get(storeId);
    if (marca === undefined) continue;
    await gravarLoja(
      storeId,
      base.pedidos.filter((p) => p.marca === marca),
      base.carrinhos.filter((c) => c.marca === marca),
    );
  }

  // Loja que saiu da configuracao leva a pasta dela junto.
  for (const nome of await fs.readdir(pasta())) {
    const achado = /^loja-(.+)$/.exec(nome);
    if (achado && !marcaDaLoja.has(achado[1]!)) {
      await fs.rm(path.join(pasta(), nome), { recursive: true, force: true });
    }
  }

  // O indice por ultimo: e ele que diz "a copia esta pronta e e desta hora".
  await gravarArquivo(indice(), {
    versao: VERSAO,
    lojas: base.lojas,
    ausentes: base.ausentes,
  } satisfies IndiceNoDisco);

  memoria.base = base;
  memoria.assinatura = await assinaturaDoDisco(Object.keys(base.lojas));
}

export interface ProgressoSincronizacao {
  loja: string;
  etapa: string;
  pedidos: number;
}

/** Uma loja cuja busca falhou; as outras seguem. */
export interface FalhaDeLoja {
  marca: string;
  storeId: string;
  motivo: string;
}

export interface ResultadoSincronizacao {
  base: BaseNuvemshop;
  falhas: FalhaDeLoja[];
}

const descreverFalhas = (falhas: FalhaDeLoja[]) =>
  falhas.map((f) => `${f.marca} (loja ${f.storeId}): ${f.motivo}`).join(" | ");

/**
 * Busca na API o que falta e grava. So uma de cada vez por processo.
 *
 * `completa` ignora a copia e busca a janela inteira de novo -- para quando
 * se desconfia do cache (ou depois de mudar a conversao de pedidos).
 *
 * Cada loja e buscada por conta propria: chave recusada numa loja nao derruba
 * as outras. A loja que falhou fica com a copia anterior, e o motivo vai para
 * o rodape. So falha inteira quando nenhuma loja respondeu.
 */
export function sincronizar(
  opcoes: { completa?: boolean; aoAvancar?: (p: ProgressoSincronizacao) => void } = {},
): Promise<ResultadoSincronizacao> {
  memoria.emAndamento ??= executarSincronizacao(opcoes)
    .then((resultado) => {
      memoria.ultimoErro = resultado.falhas.length > 0 ? descreverFalhas(resultado.falhas) : null;
      memoria.falhouEm = resultado.falhas.length > 0 ? Date.now() : 0;
      return resultado;
    })
    .catch((erro: unknown) => {
      memoria.ultimoErro = erro instanceof Error ? erro.message : String(erro);
      memoria.falhouEm = Date.now();
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
}): Promise<ResultadoSincronizacao> {
  const lojas = lojasNuvemshop();
  if (lojas.length === 0) {
    throw new Error(
      "Nenhuma loja Nuvemshop configurada. Preencha as lojas no .env.live (ver DADOS_REAIS.md).",
    );
  }

  const noDisco = await lerDoDisco();
  const anterior = completa ? vazia() : noDisco;
  const agora = new Date();
  const meses = mesesAte(agora, mesesNuvemshop());
  const primeiroMes = meses[0]!;
  const desde = limitesDoMes(primeiroMes).inicio;

  const marcasAtivas = new Set(lojas.map((l) => l.marca));
  /*
   * Quais arquivos de loja precisam ser reescritos no fim. A loja que falhou
   * fica de fora: o arquivo dela no disco continua valendo, e reescreve-lo
   * seria gravar dezenas de MB para nada.
   */
  const alterados: string[] = [];
  // Loja que saiu da configuracao leva os pedidos dela junto.
  let pedidos = anterior.pedidos.filter((p) => marcasAtivas.has(p.marca));
  const estadoLojas: Record<string, EstadoDaLoja> = {};
  const ausentes: BaseNuvemshop["ausentes"] = {};
  let carrinhos = anterior.carrinhos.filter((c) => marcasAtivas.has(c.marca));
  const falhas: FalhaDeLoja[] = [];

  for (const loja of lojas) {
    try {
      const resultado = await sincronizarLoja(loja, anterior, {
        pedidos,
        carrinhos,
        agora,
        meses,
        primeiroMes,
        desde,
        aoAvancar,
      });
      pedidos = resultado.pedidos;
      carrinhos = resultado.carrinhos;
      estadoLojas[loja.storeId] = resultado.estado;
      ausentes[loja.storeId] = resultado.ausentes;
      alterados.push(loja.storeId);
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : String(erro);
      falhas.push({ marca: loja.marca, storeId: loja.storeId, motivo });
      aoAvancar?.({ loja: loja.marca, etapa: `FALHOU: ${motivo}`, pedidos: 0 });

      // Fica o que havia no disco, se a copia era desta mesma marca.
      const conhecida = noDisco.lojas[loja.storeId];
      if (conhecida && conhecida.marca === loja.marca) {
        estadoLojas[loja.storeId] = conhecida;
        ausentes[loja.storeId] = noDisco.ausentes[loja.storeId] ?? {};
        if (completa) {
          pedidos = [...pedidos, ...noDisco.pedidos.filter((p) => p.marca === loja.marca)];
          carrinhos = [...carrinhos, ...noDisco.carrinhos.filter((c) => c.marca === loja.marca)];
        }
      } else {
        // Sem copia valida, a loja nao pode aparecer com pedidos de outra busca.
        pedidos = pedidos.filter((p) => p.marca !== loja.marca);
        carrinhos = carrinhos.filter((c) => c.marca !== loja.marca);
        // E o arquivo dela precisa ser reescrito vazio, senao a copia velha
        // (de outra marca, ou de uma busca que nao vale mais) ficaria la.
        alterados.push(loja.storeId);
      }
    }
  }

  if (falhas.length === lojas.length) {
    // Nenhuma loja respondeu: nao regrava o disco com nada de novo.
    throw new Error(descreverFalhas(falhas));
  }

  const base: BaseNuvemshop = {
    versao: VERSAO,
    lojas: estadoLojas,
    pedidos,
    carrinhos,
    ausentes,
  };
  await gravarNoDisco(base, alterados);
  return { base, falhas };
}

async function sincronizarLoja(
  loja: LojaNuvemshop,
  anterior: BaseNuvemshop,
  contexto: {
    pedidos: Pedido[];
    carrinhos: CarrinhoAbandonado[];
    agora: Date;
    meses: string[];
    primeiroMes: string;
    desde: string;
    aoAvancar?: (p: ProgressoSincronizacao) => void;
  },
) {
  const { agora, meses, primeiroMes, desde, aoAvancar } = contexto;
  let { pedidos, carrinhos } = contexto;

  const inicio = new Date().toISOString();
  const conhecida = anterior.lojas[loja.storeId];
  const incremental =
    conhecida && conhecida.marca === loja.marca && conhecida.desdeMes <= primeiroMes;

  const novos = incremental
    ? await buscarIncremental(loja, conhecida, aoAvancar)
    : await buscarJanela(loja, meses, aoAvancar);

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
  // Os carrinhos vem antes de mexer nos pedidos: se falharem, a loja inteira
  // fica com a copia anterior, e nao com pedido novo e carrinho velho.
  const carrinhosNovos = await buscarCarrinhosDaLoja(
    loja,
    listaInteira
      ? trintaDiasAtras
      : new Date(new Date(conhecida.sincronizadoEm).getTime() - SOBREPOSICAO_MS).toISOString(),
  );

  if (!incremental) {
    // Busca completa substitui tudo da loja, inclusive pedido que sumiu da API.
    pedidos = pedidos.filter((p) => p.marca !== loja.marca);
  }
  pedidos = mesclarPedidos(pedidos, novos.map((n) => n.pedido), desde);

  const contagem: Partial<Record<CampoVigiado, number>> = {};
  for (const n of novos) {
    for (const campo of n.ausentes) contagem[campo] = (contagem[campo] ?? 0) + 1;
  }

  carrinhos = mesclarCarrinhos(
    listaInteira ? carrinhos.filter((c) => c.marca !== loja.marca) : carrinhos,
    carrinhosNovos,
    trintaDiasAtras,
  );

  const estado: EstadoDaLoja = {
    marca: loja.marca,
    sincronizadoEm: inicio,
    desdeMes: incremental ? conhecida.desdeMes : primeiroMes,
    carrinhosCompletosEm: listaInteira ? inicio : conhecida?.carrinhosCompletosEm,
  };
  return {
    pedidos,
    carrinhos,
    estado,
    ausentes: incremental ? somar(anterior.ausentes[loja.storeId] ?? {}, contagem) : contagem,
  };
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

/**
 * Situacao da copia frente as lojas configuradas.
 *
 * `atualizadoEm` e a copia mais velha entre as lojas JA buscadas; `pendentes`
 * sao as configuradas que ainda nao tem copia (loja nova, chave recem-colada,
 * ou marca trocada no .env.live).
 */
function situacaoDaCopia(base: BaseNuvemshop): {
  atualizadoEm: string | null;
  pendentes: string[];
} {
  let atualizadoEm: string | null = null;
  const pendentes: string[] = [];
  for (const loja of lojasNuvemshop()) {
    const estado = base.lojas[loja.storeId];
    if (!estado || estado.marca !== loja.marca) {
      pendentes.push(loja.marca);
      continue;
    }
    if (!atualizadoEm || estado.sincronizadoEm < atualizadoEm) atualizadoEm = estado.sincronizadoEm;
  }
  return { atualizadoEm, pendentes };
}

/**
 * O que as paginas usam. Nunca espera a API se ja houver copia.
 *
 * Sem copia de loja nenhuma, espera a busca: nao ha o que mostrar, e uma tela
 * vazia diria que a loja nao vendeu nada. Com loja nova na configuracao e as
 * outras ja copiadas, NAO espera: a primeira busca de uma loja deste porte
 * leva minutos. A tela abre com as lojas que ja tem copia, e o rodape diz qual
 * esta sendo buscada.
 *
 * Depois de uma falha, so tenta de novo passado o intervalo de atualizacao --
 * senao uma chave recusada faria cada pagina aberta chamar a API de novo.
 */
export async function obterBaseNuvemshop(): Promise<BaseNuvemshop> {
  const base = await lerDoDisco();
  const { atualizadoEm, pendentes } = situacaoDaCopia(base);

  if (atualizadoEm === null && !memoria.falhouEm) return (await sincronizar()).base;

  const intervalo = intervaloAtualizacaoNuvemshop();
  const velha =
    pendentes.length > 0 ||
    atualizadoEm === null ||
    Date.now() - new Date(atualizadoEm).getTime() > intervalo;
  const esperarFalha = memoria.falhouEm > 0 && Date.now() - memoria.falhouEm < intervalo;

  if (velha && !esperarFalha && !memoria.emAndamento) {
    // Em segundo plano. O erro fica registrado para o rodape.
    sincronizar().catch((erro: unknown) => {
      console.error("[nuvemshop] atualizacao falhou:", erro);
    });
  }
  return base;
}

export async function estadoDaSincronizacao(): Promise<EstadoDaSincronizacao> {
  const base = await lerDoDisco();
  const { atualizadoEm, pendentes } = situacaoDaCopia(base);
  return {
    atualizadoEm,
    lojasPendentes: pendentes,
    sincronizando: memoria.emAndamento !== null,
    ultimoErro: memoria.ultimoErro,
  };
}

/** Para os scripts: resumo do que esta no disco. */
export async function lerCache(): Promise<BaseNuvemshop> {
  return lerDoDisco();
}
