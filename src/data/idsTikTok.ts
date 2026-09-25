/**
 * Numeros proprios e ESTAVEIS para os ids de texto do TikTok Shop.
 *
 * Por que existe: pedido, produto e SKU do TikTok sao textos de 18 ou 19
 * digitos. Nao cabem no inteiro seguro do JavaScript (9.007.199.254.740.991) e
 * muito menos no `Int` do Postgres (2.147.483.647), que e onde o cadastro de
 * produto guarda `produtoId` e `varianteId`. Converter com `Number()` perderia
 * digitos e faria dois produtos diferentes virarem o mesmo.
 *
 * Entao cada id de texto ganha um numero sequencial, gravado em disco. Duas
 * consequencias que importam:
 *
 * - **Tem de ser estavel.** O cadastro de produto, a ficha de custo e a
 *   contagem de estoque apontam para esse numero; se ele mudasse, o custo
 *   cadastrado ontem ficaria orfao. Por isso o mapa e gravado e nunca
 *   reatribuido -- `.live-data/ids-tiktok.json`, ao lado do cache.
 * - **Cada especie tem a sua faixa**, para um numero de pedido nunca ser
 *   confundido com um de produto ao ler a tela ou o banco.
 *
 * O id verdadeiro nao se perde: fica no `sku` do item e no `gateway_name` do
 * pedido, e o mapa faz o caminho de volta.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

import type { MapaDeIds } from "@/lib/tiktok";

const VERSAO = 1;

/**
 * Faixas, escolhidas para caber no `Int` do Postgres e nao encostar na faixa
 * dos produtos criados a mao (9.000.000, em `app/produtos/actions.ts`).
 */
const FAIXAS = {
  pedido: 1_000_000_000,
  produto: 1_500_000_000,
  variante: 1_700_000_000,
} as const;

type Especie = keyof typeof FAIXAS;

interface Arquivo {
  versao: number;
  /** Especie -> id do TikTok -> numero do painel. */
  mapa: Record<Especie, Record<string, number>>;
}

const vazio = (): Arquivo => ({
  versao: VERSAO,
  mapa: { pedido: {}, produto: {}, variante: {} },
});

const pasta = () =>
  process.env.NUVEMSHOP_CACHE_DIR || path.join(process.cwd(), ".live-data");
const arquivo = () => path.join(pasta(), "ids-tiktok.json");

async function ler(): Promise<Arquivo> {
  try {
    const lido = JSON.parse(await fs.readFile(arquivo(), "utf8")) as Arquivo;
    if (lido.versao !== VERSAO || !lido.mapa) return vazio();
    for (const especie of Object.keys(FAIXAS) as Especie[]) lido.mapa[especie] ??= {};
    return lido;
  } catch {
    return vazio();
  }
}

async function gravar(dados: Arquivo): Promise<void> {
  await fs.mkdir(pasta(), { recursive: true });
  const temporario = `${arquivo()}.${process.pid}.tmp`;
  await fs.writeFile(temporario, JSON.stringify(dados), "utf8");
  await fs.rename(temporario, arquivo());
}

/**
 * Abre o mapa, entrega um `MapaDeIds` para a conversao e grava o que foi
 * criado. O `gravar` do fim e explicito: uma sincronizacao inteira usa o mesmo
 * mapa em memoria e escreve o arquivo uma vez so.
 */
export async function abrirMapaDeIds(): Promise<
  MapaDeIds & { gravar(): Promise<void>; criados: number }
> {
  const dados = await ler();
  let criados = 0;

  // O maior numero de cada especie e calculado UMA vez: com milhares de
  // pedidos, refazer o maximo a cada id novo custaria caro por nada.
  const ultimo: Record<Especie, number> = { pedido: 0, produto: 0, variante: 0 };
  for (const especie of Object.keys(FAIXAS) as Especie[]) {
    const usados = Object.values(dados.mapa[especie]);
    ultimo[especie] = usados.length > 0 ? Math.max(...usados) : FAIXAS[especie];
  }

  const numeroDe = (especie: Especie, id: string): number => {
    const existente = dados.mapa[especie][id];
    if (existente !== undefined) return existente;
    const novo = ++ultimo[especie];
    dados.mapa[especie][id] = novo;
    criados += 1;
    return novo;
  };

  return {
    pedido: (id) => numeroDe("pedido", id),
    produto: (id) => numeroDe("produto", id),
    variante: (id) => numeroDe("variante", id),
    get criados() {
      return criados;
    },
    gravar: () => gravar(dados),
  };
}

/** Caminho de volta: numero do painel -> id do TikTok. Para conferencia. */
export async function idOriginal(especie: Especie, numero: number): Promise<string | null> {
  const dados = await ler();
  for (const [id, n] of Object.entries(dados.mapa[especie])) {
    if (n === numero) return id;
  }
  return null;
}
