/**
 * Pedidos do TikTok Shop (secao 15).
 *
 * Mesma divisao da Nuvemshop: este arquivo fala HTTP e guarda em disco, e a
 * conversao para `Pedido` mora em `lib/tiktok.ts`, que e pura e tem teste.
 *
 * Decisoes que valem registro:
 *
 * 1. **O token de acesso dura 7 dias e e trocado sozinho.** Antes de cada
 *    busca, se faltar menos de um dia para vencer, o cliente renova pelo
 *    `refresh_token` e grava o par novo (`tokensCanais.ts`). Sem isso, uma
 *    semana sem sincronizar exigiria refazer a autorizacao na mao.
 * 2. **A busca e por janela de criacao**, mes a mes, como a da Nuvemshop: o
 *    `page_token` do TikTok vale para uma consulta so, e janela menor faz a
 *    falha custar menos.
 * 3. **A assinatura e HMAC-SHA256** sobre o caminho, os parametros ordenados e
 *    o corpo, com o segredo nas duas pontas. Errar a ordem devolve
 *    "sign is invalid" -- e o erro nao diz qual parametro.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { createHmac } from "node:crypto";

import { contasDeCanal } from "@/lib/config";
import { mesclarPedidos } from "@/lib/nuvemshop";
import { converterPedidoTikTok } from "@/lib/tiktok";
import { abrirMapaDeIds } from "@/data/idsTikTok";
import { gravarToken, tokenDaConta } from "@/data/tokensCanais";
import type { ContaDeCanal } from "@/types/canais";
import type { Pedido } from "@/types/nuvemshop";

const BASE = "https://open-api.tiktokglobalshop.com";
const AUTENTICACAO = "https://auth.tiktok-shops.com/api/v2/token";
const VERSAO = 1;

/** Renova o token quando falta menos que isto para vencer. */
const MARGEM_DE_RENOVACAO_MS = 24 * 60 * 60 * 1000;

interface ArquivoDePedidos {
  versao: number;
  marca: string;
  atualizadoEm: string;
  pedidos: Pedido[];
}

const pasta = () =>
  process.env.NUVEMSHOP_CACHE_DIR || path.join(process.cwd(), ".live-data");
const arquivo = (conta: ContaDeCanal) =>
  path.join(pasta(), `tiktok-${conta.lojaId.replace(/[^\w-]/g, "")}.json`);

// ---------------------------------------------------------------------------
// Chamada assinada
// ---------------------------------------------------------------------------

function assinar(caminho: string, params: Record<string, string>, corpo: string, segredo: string): string {
  const ordenados = Object.keys(params)
    .filter((k) => k !== "sign" && k !== "access_token")
    .sort()
    .map((k) => `${k}${params[k]}`)
    .join("");
  return createHmac("sha256", segredo)
    .update(`${segredo}${caminho}${ordenados}${corpo}${segredo}`)
    .digest("hex");
}

interface Resposta {
  code?: number;
  message?: string;
  data?: Record<string, unknown>;
}

async function chamar(
  conta: ContaDeCanal,
  token: string,
  metodo: "GET" | "POST",
  caminho: string,
  extras: Record<string, string> = {},
  corpo: unknown = null,
): Promise<Resposta> {
  const texto = corpo ? JSON.stringify(corpo) : "";
  const params: Record<string, string> = {
    app_key: conta.chave,
    shop_cipher: conta.lojaId,
    timestamp: String(Math.floor(Date.now() / 1000)),
    ...extras,
  };
  params.sign = assinar(caminho, params, texto, conta.segredo);

  const url = new URL(BASE + caminho);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const resposta = await fetch(url, {
    method: metodo,
    headers: { "x-tts-access-token": token, "Content-Type": "application/json" },
    body: corpo ? texto : undefined,
  });
  const json = (await resposta.json().catch(() => ({}))) as Resposta;

  if (!resposta.ok || json.code !== 0) {
    throw new Error(
      `TikTok Shop recusou ${caminho} (HTTP ${resposta.status}, code ${json.code ?? "?"}): ` +
        `${json.message ?? "sem mensagem"}`,
    );
  }
  return json;
}

// ---------------------------------------------------------------------------
// Token
// ---------------------------------------------------------------------------

/**
 * Token de acesso valido da conta, renovando quando esta perto de vencer.
 *
 * O `refresh_token` do TikTok tambem vem trocado na resposta, e e por isso que
 * o token nao pode morar no `.env.live`: o que vale e sempre o ultimo.
 */
export async function tokenValido(conta: ContaDeCanal): Promise<string> {
  const guardado = await tokenDaConta(conta);
  if (!guardado) {
    throw new Error(
      `A conta do TikTok Shop (${conta.marca}) ainda nao foi autorizada. ` +
        `Rode a autorizacao e guarde o token antes de sincronizar.`,
    );
  }

  const vence = guardado.expiraEm ? new Date(guardado.expiraEm).getTime() : null;
  const perto = vence !== null && vence - Date.now() < MARGEM_DE_RENOVACAO_MS;
  if (!perto || !guardado.refresh) return guardado.token;

  const url = new URL(`${AUTENTICACAO}/refresh`);
  url.searchParams.set("app_key", conta.chave);
  url.searchParams.set("app_secret", conta.segredo);
  url.searchParams.set("refresh_token", guardado.refresh);
  url.searchParams.set("grant_type", "refresh_token");

  const resposta = await fetch(url, { headers: { "Content-Type": "application/json" } });
  const json = (await resposta.json().catch(() => ({}))) as {
    code?: number;
    message?: string;
    data?: { access_token?: string; refresh_token?: string; access_token_expire_in?: number };
  };

  if (json.code !== 0 || !json.data?.access_token) {
    // Falhar aqui nao pode derrubar a busca: o token de agora ainda vale.
    console.error(
      `[tiktok] nao consegui renovar o token de ${conta.marca}: ${json.message ?? "sem mensagem"}`,
    );
    return guardado.token;
  }

  await gravarToken("tiktok", conta.lojaId, {
    token: json.data.access_token,
    refresh: json.data.refresh_token ?? guardado.refresh,
    expiraEm: json.data.access_token_expire_in
      ? new Date(json.data.access_token_expire_in * 1000).toISOString()
      : null,
  });
  return json.data.access_token;
}

// ---------------------------------------------------------------------------
// Busca
// ---------------------------------------------------------------------------

export interface ProgressoTikTok {
  marca: string;
  etapa: string;
  pedidos: number;
}

/** Pedidos criados na janela, ja convertidos. */
async function buscarJanela(
  conta: ContaDeCanal,
  token: string,
  ids: Awaited<ReturnType<typeof abrirMapaDeIds>>,
  inicio: Date,
  fim: Date,
  aoAvancar?: (p: ProgressoTikTok) => void,
): Promise<Pedido[]> {
  const pedidos: Pedido[] = [];
  let pagina: string | undefined;

  do {
    const extras: Record<string, string> = { page_size: "50" };
    if (pagina) extras.page_token = pagina;

    const resposta = await chamar(conta, token, "POST", "/order/202309/orders/search", extras, {
      create_time_ge: Math.floor(inicio.getTime() / 1000),
      create_time_lt: Math.floor(fim.getTime() / 1000),
    });

    const lista = Array.isArray(resposta.data?.orders) ? (resposta.data.orders as unknown[]) : [];
    for (const cru of lista) {
      const pedido = converterPedidoTikTok(cru, conta.marca, ids);
      if (pedido) pedidos.push(pedido);
    }
    pagina = (resposta.data?.next_page_token as string) || undefined;
    aoAvancar?.({ marca: conta.marca, etapa: "pedidos", pedidos: pedidos.length });
  } while (pagina);

  return pedidos;
}

/** Uma janela por mes, da mais antiga para a mais nova. */
function janelas(meses: number): { inicio: Date; fim: Date }[] {
  const agora = new Date();
  const lista: { inicio: Date; fim: Date }[] = [];
  for (let i = meses - 1; i >= 0; i--) {
    const inicio = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - i, 1, 3));
    const fim = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - i + 1, 1, 3));
    lista.push({ inicio, fim: fim > agora ? agora : fim });
  }
  return lista;
}

export interface ResultadoSincronizacaoTikTok {
  marca: string;
  pedidos: number;
  novosIds: number;
}

/**
 * Busca os ultimos `meses` meses de uma conta e grava no disco.
 *
 * Nao apaga o que ja estava: `mesclarPedidos` deixa o mais recente de cada
 * pedido valer, entao rodar de novo atualiza o que mudou (pedido cancelado
 * depois da venda, por exemplo) sem perder o resto.
 */
export async function sincronizarTikTok(
  meses: number,
  aoAvancar?: (p: ProgressoTikTok) => void,
): Promise<ResultadoSincronizacaoTikTok[]> {
  const contas = contasDeCanal().filter((c) => c.canal === "tiktok");
  const resultados: ResultadoSincronizacaoTikTok[] = [];

  for (const conta of contas) {
    const token = await tokenValido(conta);
    const ids = await abrirMapaDeIds();
    const anteriores = (await lerPedidosDaConta(conta))?.pedidos ?? [];

    let pedidos: Pedido[] = [];
    for (const janela of janelas(meses)) {
      aoAvancar?.({
        marca: conta.marca,
        etapa: `pedidos de ${janela.inicio.toISOString().slice(0, 7)}`,
        pedidos: pedidos.length,
      });
      pedidos = pedidos.concat(await buscarJanela(conta, token, ids, janela.inicio, janela.fim, aoAvancar));
    }

    const juntos = mesclarPedidos(anteriores, pedidos);
    await ids.gravar();
    await gravarPedidos(conta, juntos);
    resultados.push({ marca: conta.marca, pedidos: juntos.length, novosIds: ids.criados });
  }

  return resultados;
}

// ---------------------------------------------------------------------------
// Disco
// ---------------------------------------------------------------------------

async function lerPedidosDaConta(conta: ContaDeCanal): Promise<ArquivoDePedidos | null> {
  try {
    const lido = JSON.parse(await fs.readFile(arquivo(conta), "utf8")) as ArquivoDePedidos;
    return lido.versao === VERSAO ? lido : null;
  } catch {
    return null;
  }
}

async function gravarPedidos(conta: ContaDeCanal, pedidos: Pedido[]): Promise<void> {
  await fs.mkdir(pasta(), { recursive: true });
  const dados: ArquivoDePedidos = {
    versao: VERSAO,
    marca: conta.marca,
    atualizadoEm: new Date().toISOString(),
    pedidos,
  };
  const temporario = `${arquivo(conta)}.${process.pid}.tmp`;
  await fs.writeFile(temporario, JSON.stringify(dados), { encoding: "utf8", mode: 0o600 });
  await fs.rename(temporario, arquivo(conta));
  await fs.chmod(arquivo(conta), 0o600);
}

/**
 * O que ja foi buscado, de todas as contas de TikTok. Nunca chama a API: quem
 * busca e o comando de sincronizacao, como no cache da Nuvemshop.
 */
export async function pedidosDoTikTok(): Promise<Pedido[]> {
  let contas: ContaDeCanal[];
  try {
    contas = contasDeCanal().filter((c) => c.canal === "tiktok");
  } catch {
    // Configuracao pela metade nao pode derrubar a tela: quem avisa e a aba.
    return [];
  }

  const listas = await Promise.all(contas.map((c) => lerPedidosDaConta(c)));
  return listas.flatMap((l) => l?.pedidos ?? []);
}

/** Quando cada conta foi sincronizada, para o rodape. */
export async function estadoDoTikTok(): Promise<{ marca: string; atualizadoEm: string | null }[]> {
  let contas: ContaDeCanal[];
  try {
    contas = contasDeCanal().filter((c) => c.canal === "tiktok");
  } catch {
    return [];
  }
  return Promise.all(
    contas.map(async (conta) => ({
      marca: conta.marca,
      atualizadoEm: (await lerPedidosDaConta(conta))?.atualizadoEm ?? null,
    })),
  );
}
