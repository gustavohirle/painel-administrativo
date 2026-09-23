/**
 * Canais de venda: de onde o pedido veio.
 *
 * Ate 23/09/2026 so existia a Nuvemshop, e "de onde veio" se confundia com
 * `Pedido.marca` -- uma loja por marca. A empresa tambem vende por Shopee,
 * TikTok Shop e Mercado Livre (secao 9, Fase 4), e ali a conta e da EMPRESA:
 * nada garante que uma conta corresponda a uma marca.
 *
 * Por enquanto isto e so o cadastro das credenciais. Nenhuma busca acontece --
 * ver `DADOS_REAIS.md`.
 */

export const CANAIS = ["nuvemshop", "shopee", "tiktok", "mercadolivre"] as const;

export type CanalVenda = (typeof CANAIS)[number];

/** Canais que se configuram por `CANAL_<n>_*`. A Nuvemshop tem bloco proprio. */
export const CANAIS_DE_MARKETPLACE = ["shopee", "tiktok", "mercadolivre"] as const;

export type CanalMarketplace = (typeof CANAIS_DE_MARKETPLACE)[number];

export const ROTULO_CANAL: Record<CanalVenda, string> = {
  nuvemshop: "Nuvemshop",
  shopee: "Shopee",
  tiktok: "TikTok Shop",
  mercadolivre: "Mercado Livre",
};

/**
 * Como cada marketplace chama os campos que o painel guarda com nome generico.
 *
 * Os tres pedem as mesmas quatro coisas -- quem e o aplicativo, o segredo
 * dele, qual a loja e o token do momento --, mas cada um usa um nome. A tabela
 * existe para quem vai COLAR as chaves no `.env.live` saber onde cada uma
 * entra, e para a mensagem de erro poder dizer o nome que a pessoa viu no
 * painel do marketplace, e nao o nosso.
 */
export const NOMES_DA_CREDENCIAL: Record<
  CanalMarketplace,
  { chave: string; segredo: string; lojaId: string; onde: string }
> = {
  shopee: {
    chave: "partner_id",
    segredo: "partner_key",
    lojaId: "shop_id",
    onde: "Shopee Open Platform",
  },
  tiktok: {
    chave: "app_key",
    segredo: "app_secret",
    lojaId: "shop_cipher",
    onde: "TikTok Shop Partner Center",
  },
  mercadolivre: {
    chave: "client_id (App ID)",
    segredo: "client_secret",
    lojaId: "seller_id (user id)",
    onde: "Mercado Livre Developers",
  },
};

/**
 * Uma conta de marketplace configurada.
 *
 * `marca` e CHAVE: e ela que casa o pedido com o contrato do influencer
 * (armadilha 9). Hoje so a Tha Beauty vende nesses canais, entao todos os
 * blocos apontam para ela -- mas o campo existe por conta, e nao fixo, porque
 * o dia em que outra marca entrar num marketplace nao pode exigir mexer no
 * codigo.
 */
export interface ContaDeCanal {
  canal: CanalMarketplace;
  marca: string;
  /** Identificador da loja/vendedor dentro do marketplace. */
  lojaId: string;
  /** Identificador do aplicativo (nao e segredo: aparece em log e em erro). */
  chave: string;
  /** Segredo do aplicativo. NUNCA vai para log, tela ou mensagem de erro. */
  segredo: string;
  /**
   * Token inicial vindo do `.env.live`, quando houver.
   *
   * Nos tres canais o token GIRA: o de acesso dura horas e o de renovacao e
   * trocado a cada uso. Por isso o que vale em tempo de execucao nao e este --
   * e o que esta em `.live-data` (ver `data/tokensCanais.ts`). Este serve para
   * a primeira vez, e para destravar uma conta cujo token guardado venceu.
   */
  tokenInicial: string | null;
  refreshInicial: string | null;
}

/** Identidade de uma conta, para achar o token guardado dela. */
export function chaveDaConta(canal: CanalMarketplace, lojaId: string): string {
  return `${canal}:${lojaId}`;
}

/**
 * Esconde o miolo de um segredo, deixando o suficiente para conferir se e o
 * que a pessoa colou. Usado nas telas de conferencia e em log.
 */
export function mascarar(valor: string | null): string {
  if (!valor) return "(vazio)";
  const limpo = valor.trim();
  if (limpo.length <= 4) return "****";
  return `${"*".repeat(Math.min(8, limpo.length - 4))}${limpo.slice(-4)}`;
}
