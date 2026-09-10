/**
 * Implementacao de `FonteDePedidos` contra a API REAL da Nuvemshop.
 *
 * ESTADO: escrita e pronta, porem NAO EXERCITADA -- ainda nao temos credencial
 * do cliente. Nada aqui roda enquanto `FONTE_DADOS=demo`.
 *
 * Ao receber o token, o roteiro e:
 *   1. preencher NUVEMSHOP_LOJAS (ou STORE_ID + ACCESS_TOKEN) no .env
 *   2. trocar FONTE_DADOS para "live"
 *   3. conferir os totais de um mes fechado contra o painel da Nuvemshop
 *
 * Referencia: https://tiendanube.github.io/api-documentation
 */

import type { CarrinhoAbandonado, Pedido } from "@/types/nuvemshop";
import {
  lojasNuvemshop,
  userAgentNuvemshop,
  type LojaNuvemshop,
} from "@/lib/config";
import { type FonteDePedidos, type Periodo } from "@/data/source";

const BASE_URL = "https://api.tiendanube.com/v1";

/** Maximo aceito pela API. Menos que isso so aumenta o numero de chamadas. */
const POR_PAGINA = 200;

/** Trava de seguranca: evita loop infinito se a paginacao vier estranha. */
const MAX_PAGINAS = 500;

interface OpcoesBusca {
  loja: LojaNuvemshop;
  recurso: "orders" | "checkouts";
  periodo?: Periodo;
}

/**
 * Uma pagina da API.
 *
 * A Nuvemshop responde 200 com array vazio quando a pagina passa do fim, e
 * 404 em alguns recursos na mesma situacao -- os dois casos sao tratados como
 * "acabou".
 */
async function buscarPagina<T>(
  { loja, recurso, periodo }: OpcoesBusca,
  pagina: number,
): Promise<T[]> {
  const params = new URLSearchParams({
    page: String(pagina),
    per_page: String(POR_PAGINA),
  });
  if (periodo) {
    params.set("created_at_min", periodo.inicio);
    params.set("created_at_max", periodo.fim);
  }

  const url = `${BASE_URL}/${loja.storeId}/${recurso}?${params.toString()}`;

  const resposta = await fetch(url, {
    headers: {
      Authentication: `bearer ${loja.accessToken}`,
      "User-Agent": userAgentNuvemshop(),
      "Content-Type": "application/json",
    },
    // Sem cache do Next: numero financeiro velho e pior que numero lento.
    cache: "no-store",
  });

  if (resposta.status === 404) return [];

  // Rate limit (leaky bucket). Espera o reset indicado e tenta de novo.
  if (resposta.status === 429) {
    const esperaSegundos = Number(resposta.headers.get("X-Rate-Limit-Reset") ?? "2");
    await new Promise((r) => setTimeout(r, Math.max(1, esperaSegundos) * 1000));
    return buscarPagina<T>({ loja, recurso, periodo }, pagina);
  }

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    throw new Error(
      `Nuvemshop respondeu ${resposta.status} em ${recurso} da loja ${loja.storeId}. ${corpo.slice(0, 200)}`,
    );
  }

  const dados: unknown = await resposta.json();
  return Array.isArray(dados) ? (dados as T[]) : [];
}

/** Percorre todas as paginas de um recurso de uma loja. */
async function buscarTudo<T>(opcoes: OpcoesBusca): Promise<T[]> {
  const acumulado: T[] = [];

  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina += 1) {
    const lote = await buscarPagina<T>(opcoes, pagina);
    acumulado.push(...lote);
    if (lote.length < POR_PAGINA) break;
  }

  return acumulado;
}

export class FonteNuvemshop implements FonteDePedidos {
  readonly tipo = "nuvemshop" as const;

  private readonly lojas: LojaNuvemshop[];

  constructor(lojas = lojasNuvemshop()) {
    if (lojas.length === 0) {
      throw new Error(
        "Nenhuma loja Nuvemshop configurada. Preencha NUVEMSHOP_LOJAS " +
          "(ou NUVEMSHOP_STORE_ID + NUVEMSHOP_ACCESS_TOKEN) no .env, " +
          'ou volte FONTE_DADOS para "demo".',
      );
    }
    this.lojas = lojas;
  }

  async listarPedidos(periodo?: Periodo): Promise<Pedido[]> {
    // Uma loja por marca: as buscas sao independentes, entao vao em paralelo.
    const porLoja = await Promise.all(
      this.lojas.map(async (loja) => {
        const brutos = await buscarTudo<Omit<Pedido, "marca">>({
          loja,
          recurso: "orders",
          periodo,
        });
        // Unico enriquecimento: carimbar de que loja veio o pedido.
        return brutos.map((pedido): Pedido => ({ ...pedido, marca: loja.marca }));
      }),
    );

    return porLoja.flat();
  }

  async listarCarrinhosAbandonados(
    periodo?: Periodo,
  ): Promise<CarrinhoAbandonado[]> {
    const porLoja = await Promise.all(
      this.lojas.map(async (loja) => {
        const brutos = await buscarTudo<Omit<CarrinhoAbandonado, "marca">>({
          loja,
          recurso: "checkouts",
          periodo,
        });
        return brutos.map(
          (carrinho): CarrinhoAbandonado => ({ ...carrinho, marca: loja.marca }),
        );
      }),
    );

    return porLoja.flat();
  }
}
