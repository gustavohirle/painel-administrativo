/**
 * Implementacao de `FonteDePedidos` contra a API REAL da Nuvemshop.
 *
 * ESTADO: ligada a loja real desde 16/09/2026 (secao 12 do CLAUDE.md, "O que a
 * loja real mostrou"). O roteiro para uma loja nova esta em `DADOS_REAIS.md`,
 * e o primeiro passo e `npm run nuvemshop:testar`.
 *
 * Duas camadas:
 *
 * - este arquivo fala HTTP: pagina, respeita o limite de chamadas e converte
 *   cada pedido na borda (`lib/nuvemshop.ts`);
 * - `cachePedidos.ts` guarda o resultado em disco e so pede a API o que mudou.
 *
 * As paginas NUNCA esperam a API: sem o cache, cada troca de aba buscaria um
 * ano de pedidos -- centenas de chamadas, minutos de espera, e o limite de 2
 * chamadas por segundo estourado na primeira tela.
 *
 * Referencia: https://tiendanube.github.io/api-documentation/intro
 */

import type { CarrinhoAbandonado, ItemCatalogo, Pedido } from "@/types/nuvemshop";
import {
  baseUrlNuvemshop,
  lojasNuvemshop,
  userAgentNuvemshop,
  type LojaNuvemshop,
} from "@/lib/config";
import {
  LIMITE_POR_CONSULTA,
  converterCarrinho,
  converterPedido,
  converterProduto,
  dividirJanela,
  esperaPeloLimite,
  proximaPaginaDoLink,
  type PedidoConvertido,
} from "@/lib/nuvemshop";
import { type FonteDePedidos, type Periodo } from "@/data/source";
import { obterBaseNuvemshop } from "@/data/cachePedidos";

/** Maximo aceito pela API. Menos que isso so aumenta o numero de chamadas. */
const POR_PAGINA = 200;

/** Alem desta pagina a API responde 422 (`LIMITE_POR_CONSULTA`). */
const MAX_PAGINAS = LIMITE_POR_CONSULTA / POR_PAGINA;

/** Trava contra recursao sem fim: 2^30 pedacos de um mes ja teriam menos de um segundo. */
const MAX_DIVISOES = 30;

/** Tentativas por chamada antes de desistir (erro de rede ou 5xx). */
const TENTATIVAS = 4;

/**
 * Chamadas simultaneas a API, somadas todas as buscas do processo.
 *
 * Cada pagina de 200 pedidos leva ~10 s para a Nuvemshop montar (medido na
 * loja real em 16/09/2026). Uma depois da outra, um mes de 20 mil pedidos
 * levaria 17 minutos. Com 12 ao mesmo tempo a vazao fica perto de 1,2 chamada
 * por segundo -- abaixo das 2 por segundo do menor limite documentado.
 *
 * O estado mora em `globalThis` pelo mesmo motivo do cache (armadilha 2): o
 * Next carrega este modulo em mais de um grafo, e cada copia teria a sua fila.
 */
const SIMULTANEAS = 12;

const global = globalThis as unknown as {
  __filaNuvemshop?: { livres: number; esperando: Array<() => void> };
};
global.__filaNuvemshop ??= { livres: SIMULTANEAS, esperando: [] };
const fila = global.__filaNuvemshop;

async function naFila<T>(tarefa: () => Promise<T>): Promise<T> {
  if (fila.livres > 0) fila.livres -= 1;
  else await new Promise<void>((entrar) => fila.esperando.push(entrar));
  try {
    return await tarefa();
  } finally {
    // A vaga passa direto para quem espera; so volta ao total se ninguem esperar.
    const proxima = fila.esperando.shift();
    if (proxima) proxima();
    else fila.livres += 1;
  }
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class ErroNuvemshop extends Error {
  constructor(
    mensagem: string,
    readonly status: number,
  ) {
    super(mensagem);
    this.name = "ErroNuvemshop";
  }
}

/** Traduz o status HTTP para o que a pessoa precisa fazer. */
function explicarStatus(status: number, loja: LojaNuvemshop): string {
  if (status === 401 || status === 403) {
    return `a chave da loja ${loja.marca} (${loja.storeId}) foi recusada. Confira o TOKEN e o STORE_ID dessa loja no .env.live, e se o aplicativo tem permissão de leitura de pedidos.`;
  }
  if (status === 404) {
    return `a loja ${loja.storeId} (${loja.marca}) não foi encontrada. Confira o STORE_ID dessa loja no .env.live.`;
  }
  if (status === 400) {
    return "a Nuvemshop recusou a requisição. Confira o NUVEMSHOP_USER_AGENT: ela exige nome do aplicativo e um contato.";
  }
  return `a Nuvemshop respondeu ${status}.`;
}

interface Resposta {
  status: number;
  dados: unknown;
  link: string | null;
  /** `x-total-count`: quantos registros a consulta inteira tem, somadas as paginas. */
  total: number | null;
}

function totalDoCabecalho(valor: string | null): number | null {
  if (valor === null || valor.trim() === "") return null;
  const n = Number(valor);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/**
 * Uma chamada, com as esperas do limite e novas tentativas.
 *
 * Os dois cabecalhos de autenticacao vao juntos: a versao atual da API usa
 * `Authorization: Bearer`, a antiga (`/v1`) usa `Authentication: bearer`, e
 * quem escolhe a versao e `NUVEMSHOP_API_URL`. Cada versao ignora o outro.
 *
 * A espera de uma nova tentativa acontece SEGURANDO a vaga da fila: se a API
 * pediu calma, as outras chamadas tambem devem esperar.
 */
function chamar(loja: LojaNuvemshop, url: string): Promise<Resposta> {
  return naFila(() => chamarAgora(loja, url));
}

async function chamarAgora(loja: LojaNuvemshop, url: string): Promise<Resposta> {
  let ultimoErro: unknown = null;

  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa += 1) {
    let resposta: Response;
    try {
      resposta = await fetch(url, {
        headers: {
          Authorization: `Bearer ${loja.accessToken}`,
          Authentication: `bearer ${loja.accessToken}`,
          "User-Agent": userAgentNuvemshop(),
          "Content-Type": "application/json",
        },
        // Sem cache do Next: quem guarda e `cachePedidos.ts`, com regra propria.
        cache: "no-store",
      });
    } catch (erro) {
      ultimoErro = erro;
      await dormir(1_000 * tentativa);
      continue;
    }

    const espera = esperaPeloLimite(
      resposta.status,
      resposta.headers.get("x-rate-limit-remaining"),
      resposta.headers.get("x-rate-limit-reset"),
    );

    if (resposta.status === 429 || resposta.status >= 500) {
      ultimoErro = new ErroNuvemshop(explicarStatus(resposta.status, loja), resposta.status);
      await dormir(resposta.status === 429 ? espera : 1_000 * tentativa);
      continue;
    }

    if (espera > 0) await dormir(espera);

    // Pagina alem do fim: a API responde 404 com "Last page is N".
    if (resposta.status === 404 && url.includes("page=")) {
      const corpo = await resposta.text().catch(() => "");
      if (/last page/i.test(corpo)) return { status: 200, dados: [], link: null, total: null };
      throw new ErroNuvemshop(explicarStatus(404, loja), 404);
    }

    if (!resposta.ok) {
      throw new ErroNuvemshop(explicarStatus(resposta.status, loja), resposta.status);
    }

    return {
      status: resposta.status,
      dados: await resposta.json(),
      link: resposta.headers.get("link"),
      total: totalDoCabecalho(resposta.headers.get("x-total-count")),
    };
  }

  throw ultimoErro instanceof Error
    ? ultimoErro
    : new ErroNuvemshop("não foi possível falar com a Nuvemshop.", 0);
}

/** Intervalo de datas de uma listagem, pelas duas pontas (a API inclui ambas). */
interface Janela {
  campo: "created_at" | "updated_at";
  inicio: string;
  fim: string;
}

const lista = (dados: unknown): unknown[] => (Array.isArray(dados) ? dados : []);

/** Tira repetidos pelo id: a emenda de duas janelas devolve o mesmo pedido duas vezes. */
function semRepetidos(brutos: unknown[]): unknown[] {
  const vistos = new Set<unknown>();
  return brutos.filter((bruto) => {
    const id = bruto && typeof bruto === "object" ? (bruto as { id?: unknown }).id : undefined;
    if (id === undefined || id === null) return true;
    if (vistos.has(id)) return false;
    vistos.add(id);
    return true;
  });
}

/**
 * Todos os registros de uma janela de datas.
 *
 * A primeira pagina diz o total (`x-total-count`), e ele decide o caminho:
 *
 * - **acima de `LIMITE_POR_CONSULTA`**: a API recusaria as paginas do fim. A
 *   janela se parte ao meio e cada metade repete a conta;
 * - **com total conhecido**: as paginas restantes saem ao mesmo tempo, pela
 *   fila. A contagem das paginas vem do total, e nao do `Link`, justamente
 *   para nao esperar uma pagina para descobrir a proxima;
 * - **sem total** (API que nao manda o cabecalho): uma pagina depois da
 *   outra, seguindo o `Link`, como antes.
 *
 * Se vierem menos registros que o total, busca a janela uma segunda vez. Um
 * pedido alterado no meio da busca muda de posicao na lista e empurra outro
 * para uma pagina ja lida; repetir e o que o recupera.
 */
async function listarJanela(
  loja: LojaNuvemshop,
  recurso: "orders" | "checkouts" | "products",
  janela: Janela,
  filtros: Record<string, string>,
  divisoes = 0,
  segundaVez = false,
): Promise<unknown[]> {
  if (new Date(janela.inicio).getTime() > new Date(janela.fim).getTime()) return [];

  const endereco = (pagina: number) => {
    const params = new URLSearchParams({
      ...filtros,
      [`${janela.campo}_min`]: janela.inicio,
      [`${janela.campo}_max`]: janela.fim,
      per_page: String(POR_PAGINA),
      page: String(pagina),
    });
    return `${baseUrlNuvemshop()}/${loja.storeId}/${recurso}?${params}`;
  };

  const primeira = await chamar(loja, endereco(1));
  const total = primeira.total;

  if (total !== null && total > LIMITE_POR_CONSULTA) {
    const metades = divisoes < MAX_DIVISOES ? dividirJanela(janela.inicio, janela.fim) : null;
    if (!metades) {
      throw new ErroNuvemshop(
        `a loja ${loja.marca} tem mais de ${LIMITE_POR_CONSULTA} registros no mesmo segundo (${janela.inicio}); não há como dividir a busca.`,
        422,
      );
    }
    const partes = await Promise.all(
      metades.map(([inicio, fim]) =>
        listarJanela(loja, recurso, { ...janela, inicio, fim }, filtros, divisoes + 1),
      ),
    );
    return semRepetidos(partes.flat());
  }

  const lote = lista(primeira.dados);
  if (lote.length < POR_PAGINA) return lote;

  let todos: unknown[];
  if (total !== null) {
    const paginas = Math.min(Math.ceil(total / POR_PAGINA), MAX_PAGINAS);
    const resto = await Promise.all(
      Array.from({ length: paginas - 1 }, (_, i) =>
        chamar(loja, endereco(i + 2)).then((r) => lista(r.dados)),
      ),
    );
    todos = semRepetidos([lote, ...resto].flat());
  } else {
    todos = [...lote];
    let pagina = 2;
    // Segue o `Link` quando existe, como a documentacao pede.
    let url: string | null = proximaPaginaDoLink(primeira.link) ?? endereco(pagina);
    while (url && pagina <= MAX_PAGINAS) {
      const { dados, link } = await chamar(loja, url);
      const proximo = lista(dados);
      todos.push(...proximo);
      if (proximo.length < POR_PAGINA) break;
      pagina += 1;
      url = proximaPaginaDoLink(link) ?? endereco(pagina);
    }
    todos = semRepetidos(todos);
  }

  if (total !== null && todos.length < total && !segundaVez) {
    return listarJanela(loja, recurso, janela, filtros, divisoes, true);
  }
  return todos;
}

/** A ponta final de uma busca nunca passa de agora. */
function ateAgora(fim: string | undefined, agora: string): string {
  if (!fim) return agora;
  return new Date(fim).getTime() < new Date(agora).getTime() ? fim : agora;
}

export type FiltroPedidos =
  | { criadosDesde: string; criadosAte?: string }
  | { alteradosDesde: string };

/**
 * Pedidos de uma loja, ja convertidos. Todos os status: o painel precisa dos nao pagos.
 *
 * A janela termina em "agora", mesmo quando o mes pedido ainda nao acabou: um
 * pedido criado durante a busca entraria no topo da lista e empurraria os
 * outros de pagina. Ele chega na proxima busca incremental, que comeca antes
 * desta terminar (`SOBREPOSICAO_MS` em `cachePedidos.ts`).
 */
export async function buscarPedidosDaLoja(
  loja: LojaNuvemshop,
  filtro: FiltroPedidos,
): Promise<PedidoConvertido[]> {
  const agora = new Date().toISOString();
  const janela: Janela =
    "alteradosDesde" in filtro
      ? { campo: "updated_at", inicio: filtro.alteradosDesde, fim: agora }
      : { campo: "created_at", inicio: filtro.criadosDesde, fim: ateAgora(filtro.criadosAte, agora) };

  const brutos = await listarJanela(loja, "orders", janela, { status: "any", payment_status: "any" });
  return brutos
    .map((bruto) => converterPedido(bruto, loja.marca))
    .filter((p): p is PedidoConvertido => p !== null);
}

/** Carrinhos abandonados de uma loja. A Nuvemshop so guarda os dos ultimos 30 dias. */
export async function buscarCarrinhosDaLoja(
  loja: LojaNuvemshop,
  criadosDesde: string,
): Promise<CarrinhoAbandonado[]> {
  const agora = new Date().toISOString();
  const brutos = await listarJanela(
    loja,
    "checkouts",
    { campo: "created_at", inicio: criadosDesde, fim: agora },
    {},
  );
  return brutos
    .map((bruto) => converterCarrinho(bruto, loja.marca))
    .filter((c): c is CarrinhoAbandonado => c !== null);
}

/**
 * Catalogo de produtos de uma loja, uma entrada por variante.
 *
 * Nao passa pelo cache: so o botao de trazer produtos usa, e o catalogo e
 * pequeno (78 produtos na loja real, uma chamada). A janela vai do comeco dos
 * tempos ate agora so para reaproveitar a paginacao com limite.
 */
export async function buscarCatalogoDaLoja(loja: LojaNuvemshop): Promise<ItemCatalogo[]> {
  const brutos = await listarJanela(
    loja,
    "products",
    { campo: "created_at", inicio: "2000-01-01T00:00:00.000Z", fim: new Date().toISOString() },
    {},
  );
  return brutos.flatMap((bruto) => converterProduto(bruto, loja.marca));
}

/** Dados cadastrais da loja. So o teste de conexao usa: prova que a chave vale. */
export async function buscarDadosDaLoja(
  loja: LojaNuvemshop,
): Promise<{ nome: string; moeda: string | null; pais: string | null }> {
  const { dados } = await chamar(loja, `${baseUrlNuvemshop()}/${loja.storeId}/store`);
  const d = (dados ?? {}) as Record<string, unknown>;
  const nome = d.name;
  const nomeTexto =
    typeof nome === "string"
      ? nome
      : nome && typeof nome === "object"
        ? String((nome as Record<string, unknown>).pt ?? Object.values(nome)[0] ?? "")
        : "";
  return {
    nome: nomeTexto,
    moeda: typeof d.main_currency === "string" ? d.main_currency : null,
    pais: typeof d.country === "string" ? d.country : null,
  };
}

const dentro = (iso: string, periodo?: Periodo): boolean => {
  if (!periodo) return true;
  const t = new Date(iso).getTime();
  return t >= new Date(periodo.inicio).getTime() && t <= new Date(periodo.fim).getTime();
};

export class FonteNuvemshop implements FonteDePedidos {
  readonly tipo = "nuvemshop" as const;

  async listarPedidos(periodo?: Periodo): Promise<Pedido[]> {
    const { pedidos } = await obterBaseNuvemshop();
    return periodo ? pedidos.filter((p) => dentro(p.created_at, periodo)) : pedidos;
  }

  async listarCarrinhosAbandonados(periodo?: Periodo): Promise<CarrinhoAbandonado[]> {
    const { carrinhos } = await obterBaseNuvemshop();
    return periodo ? carrinhos.filter((c) => dentro(c.created_at, periodo)) : carrinhos;
  }

  async listarCatalogo(): Promise<ItemCatalogo[]> {
    const lojas = lojasNuvemshop();
    const porLoja = await Promise.all(lojas.map((loja) => buscarCatalogoDaLoja(loja)));
    return porLoja.flat();
  }
}
