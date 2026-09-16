/**
 * Implementacao de `FonteDePedidos` contra a API REAL da Nuvemshop.
 *
 * ESTADO: pronta e testada contra um servidor falso com o formato documentado,
 * mas NUNCA contra a loja real. O roteiro de ligar esta em `DADOS_REAIS.md`,
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

import type { CarrinhoAbandonado, Pedido } from "@/types/nuvemshop";
import {
  baseUrlNuvemshop,
  userAgentNuvemshop,
  type LojaNuvemshop,
} from "@/lib/config";
import {
  converterCarrinho,
  converterPedido,
  esperaPeloLimite,
  proximaPaginaDoLink,
  type PedidoConvertido,
} from "@/lib/nuvemshop";
import { type FonteDePedidos, type Periodo } from "@/data/source";
import { obterBaseNuvemshop } from "@/data/cachePedidos";

/** Maximo aceito pela API. Menos que isso so aumenta o numero de chamadas. */
const POR_PAGINA = 200;

/** Trava de seguranca: evita loop infinito se a paginacao vier estranha. */
const MAX_PAGINAS = 500;

/** Tentativas por chamada antes de desistir (erro de rede ou 5xx). */
const TENTATIVAS = 4;

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
    return `a chave da loja ${loja.marca} (${loja.storeId}) foi recusada. Confira o accessToken e se o aplicativo tem permissão de leitura de pedidos.`;
  }
  if (status === 404) {
    return `a loja ${loja.storeId} (${loja.marca}) não foi encontrada. Confira o storeId.`;
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
}

/**
 * Uma chamada, com as esperas do limite e novas tentativas.
 *
 * Os dois cabecalhos de autenticacao vao juntos: a versao atual da API usa
 * `Authorization: Bearer`, a antiga (`/v1`) usa `Authentication: bearer`, e
 * quem escolhe a versao e `NUVEMSHOP_API_URL`. Cada versao ignora o outro.
 */
async function chamar(loja: LojaNuvemshop, url: string): Promise<Resposta> {
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
      if (/last page/i.test(corpo)) return { status: 200, dados: [], link: null };
      throw new ErroNuvemshop(explicarStatus(404, loja), 404);
    }

    if (!resposta.ok) {
      throw new ErroNuvemshop(explicarStatus(resposta.status, loja), resposta.status);
    }

    return {
      status: resposta.status,
      dados: await resposta.json(),
      link: resposta.headers.get("link"),
    };
  }

  throw ultimoErro instanceof Error
    ? ultimoErro
    : new ErroNuvemshop("não foi possível falar com a Nuvemshop.", 0);
}

/** Percorre todas as paginas de uma listagem. */
async function listarTudo(
  loja: LojaNuvemshop,
  recurso: "orders" | "checkouts",
  filtros: Record<string, string>,
): Promise<unknown[]> {
  const params = new URLSearchParams({ ...filtros, per_page: String(POR_PAGINA), page: "1" });
  let url: string | null = `${baseUrlNuvemshop()}/${loja.storeId}/${recurso}?${params}`;
  let pagina = 1;
  const acumulado: unknown[] = [];

  while (url && pagina <= MAX_PAGINAS) {
    const { dados, link } = await chamar(loja, url);
    const lote = Array.isArray(dados) ? dados : [];
    acumulado.push(...lote);
    if (lote.length < POR_PAGINA) break;

    pagina += 1;
    // Segue o `Link` quando existe, como a documentacao pede.
    url = proximaPaginaDoLink(link);
    if (!url) {
      params.set("page", String(pagina));
      url = `${baseUrlNuvemshop()}/${loja.storeId}/${recurso}?${params}`;
    }
  }

  return acumulado;
}

export interface FiltroPedidos {
  criadosDesde?: string;
  criadosAte?: string;
  alteradosDesde?: string;
}

/** Pedidos de uma loja, ja convertidos. Todos os status: o painel precisa dos nao pagos. */
export async function buscarPedidosDaLoja(
  loja: LojaNuvemshop,
  filtro: FiltroPedidos,
): Promise<PedidoConvertido[]> {
  const filtros: Record<string, string> = { status: "any", payment_status: "any" };
  if (filtro.criadosDesde) filtros.created_at_min = filtro.criadosDesde;
  if (filtro.criadosAte) filtros.created_at_max = filtro.criadosAte;
  if (filtro.alteradosDesde) filtros.updated_at_min = filtro.alteradosDesde;

  const brutos = await listarTudo(loja, "orders", filtros);
  return brutos
    .map((bruto) => converterPedido(bruto, loja.marca))
    .filter((p): p is PedidoConvertido => p !== null);
}

/** Carrinhos abandonados de uma loja. A Nuvemshop so guarda os dos ultimos 30 dias. */
export async function buscarCarrinhosDaLoja(
  loja: LojaNuvemshop,
  criadosDesde: string,
): Promise<CarrinhoAbandonado[]> {
  const brutos = await listarTudo(loja, "checkouts", { created_at_min: criadosDesde });
  return brutos
    .map((bruto) => converterCarrinho(bruto, loja.marca))
    .filter((c): c is CarrinhoAbandonado => c !== null);
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
}
