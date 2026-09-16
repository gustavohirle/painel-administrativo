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

/**
 * A API exige nome do aplicativo e um contato (e-mail ou endereco) no
 * User-Agent; sem isso responde 400. O aplicativo foi criado na Nuvemshop com
 * o nome "painel-de-relatrios".
 */
export function userAgentNuvemshop(): string {
  return (
    process.env.NUVEMSHOP_USER_AGENT ||
    "painel-de-relatrios (https://github.com/gustavohirle/painel-administrativo)"
  );
}

/**
 * Endereco base da API, com a versao.
 *
 * O padrao e a `v1`, e nao a versao mais nova (`2025-03`): na loja real, a
 * listagem de pedidos da 2025-03 veio SEM `shipping_cost_customer` e sem
 * `shipping_cost_owner` (o frete foi para `fulfillments`, sem valor). O frete
 * entraria zerado, e a comissao e os impostos sairiam sobre uma base maior.
 * Na v1, `total = subtotal - desconto + frete` fechou em 50 de 50 pedidos
 * (16/09/2026). O cliente manda os cabecalhos de autenticacao das duas versoes.
 */
export function baseUrlNuvemshop(): string {
  return (process.env.NUVEMSHOP_API_URL || "https://api.nuvemshop.com.br/v1").replace(
    /\/+$/,
    "",
  );
}

/**
 * Quantos meses de pedidos o painel guarda. 13 = os 12 do RBT12 (secao 5.10)
 * mais o mes corrente.
 */
export function mesesNuvemshop(): number {
  const n = Number(process.env.NUVEMSHOP_MESES);
  return Number.isInteger(n) && n >= 1 && n <= 36 ? n : 13;
}

/** Idade maxima da copia local antes de pedir a API o que mudou, em ms. */
export function intervaloAtualizacaoNuvemshop(): number {
  const minutos = Number(process.env.NUVEMSHOP_ATUALIZAR_MINUTOS);
  return (Number.isFinite(minutos) && minutos >= 1 ? minutos : 10) * 60 * 1000;
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
            (l): l is { storeId: string | number; accessToken: string; marca?: string } =>
              typeof l === "object" &&
              l !== null &&
              (typeof l.storeId === "string" || typeof l.storeId === "number") &&
              String(l.storeId).trim() !== "" &&
              typeof l.accessToken === "string" &&
              l.accessToken.trim() !== "" &&
              // O modelo do .env.live vem com este texto no lugar da chave.
              !l.accessToken.includes("COLE_A_CHAVE"),
          )
          .map((l) => ({
            // O id da loja e numero na Nuvemshop; aceita com ou sem aspas.
            storeId: String(l.storeId).trim(),
            accessToken: l.accessToken.trim(),
            // A marca e CHAVE: e ela que casa pedido com contrato (armadilha 9).
            marca: (l.marca || `Loja ${l.storeId}`).trim(),
          }));
      }
    } catch {
      throw new Error(
        "NUVEMSHOP_LOJAS nao e um JSON valido. Confira o .env.live.",
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

/**
 * Quem fica com a diferenca entre o frete cobrado do cliente e o que a
 * transportadora recebe. Na loja real sao R$ 0,73 por pedido, da Intelipost
 * (informado pelo dono em 16/09/2026). E custo: tem fatia propria na pizza e
 * linha propria no raio-x, separada do frete da transportadora.
 */
export const INTERMEDIARIO_FRETE = "Intelipost";

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
