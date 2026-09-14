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

/**
 * Regime usado quando uma marca ainda nao tem influencer vinculado.
 *
 * NAO existe "o regime da empresa": cada influencer tem a sua operacao, com o
 * seu enquadramento. Esta constante e so o que fazer com a sobra -- pedidos de
 * uma marca que ninguem vinculou ainda. Assim que o influencer for cadastrado,
 * o regime dele manda.
 */
export const REGIME_SEM_INFLUENCER = "lucro_presumido" as const;

/** Percentual de comissao usado como ponto de partida na tela. */
export const PERCENTUAL_COMISSAO_PADRAO = 30;

/**
 * Participacao dos socios no resultado, em percentual do RECEBIDO.
 *
 * Custo fixo da operacao, definido pelo cliente: sai de todo mes antes do lucro
 * operacional, com fatia propria na pizza. Sobre o recebido, e nao sobre o
 * bruto, porque e dinheiro que precisa ter entrado para ser distribuido --
 * pedido cancelado nao paga socio.
 */
export const PERCENTUAL_PARTICIPACAO_SOCIOS = 6;

// ---------------------------------------------------------------------------
// Exposicao pela rede
// ---------------------------------------------------------------------------

/**
 * O cookie de sessao deve exigir HTTPS (`Secure`)?
 *
 * O padrao em producao e SIM, e essa e a resposta certa. A excecao existe por
 * um motivo pratico: servido por HTTP puro, um cookie `Secure` nao e guardado
 * pelo navegador, e o login falha SEM mensagem de erro -- a pessoa digita a
 * senha certa e volta para a tela de login, indefinidamente.
 *
 * Com `PERMITIR_HTTP_SEM_TLS=1` a exigencia cai e o painel funciona em
 * `http://`. O preco e real: senha e cookie de sessao viajam em texto claro.
 *
 * A trava: isso SO vale em modo demonstracao. Em `live` a sessao da acesso a
 * faturamento real, token da Nuvemshop e banco -- ali a variavel e ignorada de
 * proposito, para nao ser herdada de um `.env` antigo ao virar a chave.
 */
export function exigirHttpsNoCookie(): boolean {
  // Em desenvolvimento o acesso e por localhost, e `Secure` ja atrapalharia.
  if (process.env.NODE_ENV !== "production") return false;

  const liberado = process.env.PERMITIR_HTTP_SEM_TLS === "1";
  return !(liberado && modoDemonstracao());
}
