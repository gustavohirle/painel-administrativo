/**
 * Leitura das variaveis de ambiente. Ponto unico de decisao entre
 * modo demonstracao e modo real.
 */

export type FonteDados = "demo" | "live";

/**
 * Modo de operacao do painel.
 *
 * O padrao e `demo` DE PROPOSITO: sem configuracao nenhuma o projeto sobe
 * funcionando e offline. Trocar para `live` e uma acao deliberada.
 */
export function fonteDados(): FonteDados {
  return process.env.FONTE_DADOS === "live" ? "live" : "demo";
}

export function modoDemonstracao(): boolean {
  return fonteDados() === "demo";
}

/**
 * Credencial de UMA loja Nuvemshop.
 *
 * Cada marca do cliente e uma loja Nuvemshop separada, com store_id e token
 * proprios. O painel consolida todas, carimbando `marca` em cada pedido.
 */
export interface LojaNuvemshop {
  marca: string;
  storeId: string;
  accessToken: string;
}

export function userAgentNuvemshop(): string {
  return (
    process.env.NUVEMSHOP_USER_AGENT ?? "Painel Administrativo (sem contato)"
  );
}

/**
 * Lojas configuradas. Aceita dois formatos:
 *
 *   NUVEMSHOP_LOJAS='[{"marca":"Aurora","storeId":"123","accessToken":"abc"}]'
 *
 * ou, para uma loja so:
 *
 *   NUVEMSHOP_STORE_ID=123
 *   NUVEMSHOP_ACCESS_TOKEN=abc
 *   NUVEMSHOP_MARCA="Minha Loja"
 *
 * Devolve lista vazia quando nada esta configurado -- quem chama decide se
 * isso e erro ou se cai no modo demonstracao.
 */
export function lojasNuvemshop(): LojaNuvemshop[] {
  const json = process.env.NUVEMSHOP_LOJAS;
  if (json) {
    try {
      const bruto: unknown = JSON.parse(json);
      if (Array.isArray(bruto)) {
        return bruto
          .filter(
            (l): l is LojaNuvemshop =>
              typeof l === "object" &&
              l !== null &&
              typeof (l as LojaNuvemshop).storeId === "string" &&
              typeof (l as LojaNuvemshop).accessToken === "string",
          )
          .map((l) => ({ ...l, marca: l.marca || `Loja ${l.storeId}` }));
      }
    } catch {
      throw new Error(
        "NUVEMSHOP_LOJAS nao e um JSON valido. Confira o .env.",
      );
    }
  }

  const storeId = process.env.NUVEMSHOP_STORE_ID;
  const accessToken = process.env.NUVEMSHOP_ACCESS_TOKEN;
  if (storeId && accessToken) {
    return [
      {
        marca: process.env.NUVEMSHOP_MARCA || `Loja ${storeId}`,
        storeId,
        accessToken,
      },
    ];
  }

  return [];
}

/** Percentual de comissao usado como ponto de partida na tela. */
export const PERCENTUAL_COMISSAO_PADRAO = 30;
