/**
 * Leitura das variaveis de ambiente. Ponto unico de decisao entre
 * modo demonstracao e modo real.
 */

import {
  CANAIS_DE_MARKETPLACE,
  chaveDaConta,
  NOMES_DA_CREDENCIAL,
  ROTULO_CANAL,
  type CanalMarketplace,
  type ContaDeCanal,
} from "@/types/canais";

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

/** Quantos blocos numerados `NUVEMSHOP_LOJA_<n>_*` sao lidos. */
export const MAXIMO_LOJAS_NUMERADAS = 20;

/** O modelo do .env.live vem com este texto no lugar da chave. */
const chaveDeExemplo = (token: string) => token.includes("COLE_A_CHAVE");

/**
 * Lojas configuradas. Cada influencer tem a SUA loja Nuvemshop, com id e chave
 * proprios, e a `marca` e o nome que liga a loja ao contrato do influencer
 * (armadilha 9). Tres formatos, que se somam:
 *
 * 1. Um bloco por loja, numerado a partir de 1 (o do `.env.live.example`):
 *
 *      NUVEMSHOP_LOJA_1_MARCA="Tha Beauty"
 *      NUVEMSHOP_LOJA_1_STORE_ID=5018407
 *      NUVEMSHOP_LOJA_1_TOKEN=abc...
 *
 *    Bloco com a chave vazia (ou a de exemplo) e ignorado: da para deixar o
 *    bloco pronto e colar a chave depois. Com chave e sem marca, e erro -- um
 *    nome inventado ("Loja 123") nao casaria com contrato nenhum.
 *
 * 2. Uma linha JSON:
 *
 *      NUVEMSHOP_LOJAS='[{"marca":"Aurora","storeId":"123","accessToken":"abc"}]'
 *
 * 3. Uma loja so: NUVEMSHOP_STORE_ID, NUVEMSHOP_ACCESS_TOKEN e NUVEMSHOP_MARCA.
 *
 * A mesma loja ou a mesma marca duas vezes e erro: dois pedidos com a mesma
 * marca e lojas diferentes seriam somados como se fossem de um influencer so.
 *
 * Devolve lista vazia quando nada esta configurado -- quem chama decide se
 * isso e erro ou se cai no modo demonstracao.
 */
export function lojasNuvemshop(): LojaNuvemshop[] {
  const lojas = [...lojasDoJson(), ...lojasNumeradas()];

  const storeId = process.env.NUVEMSHOP_STORE_ID?.trim();
  const accessToken = process.env.NUVEMSHOP_ACCESS_TOKEN?.trim();
  if (storeId && accessToken && !chaveDeExemplo(accessToken)) {
    lojas.push({
      marca: (process.env.NUVEMSHOP_MARCA || `Loja ${storeId}`).trim(),
      storeId,
      accessToken,
    });
  }

  const ids = new Set<string>();
  const marcas = new Set<string>();
  for (const loja of lojas) {
    if (ids.has(loja.storeId)) {
      throw new Error(
        `A loja ${loja.storeId} aparece duas vezes na configuração da Nuvemshop. Confira o .env.live.`,
      );
    }
    // Sem diferenciar caixa: "Tha Beauty" e "tha beauty" seriam duas marcas
    // na conta e uma so para quem le.
    const marca = loja.marca.toLocaleLowerCase("pt-BR");
    if (marcas.has(marca)) {
      throw new Error(
        `A marca "${loja.marca}" está em duas lojas da Nuvemshop. Cada loja precisa de uma marca própria. Confira o .env.live.`,
      );
    }
    ids.add(loja.storeId);
    marcas.add(marca);
  }
  return lojas;
}

function lojasDoJson(): LojaNuvemshop[] {
  const json = process.env.NUVEMSHOP_LOJAS;
  if (!json || json.trim() === "") return [];
  let bruto: unknown;
  try {
    bruto = JSON.parse(json);
  } catch {
    throw new Error("NUVEMSHOP_LOJAS nao e um JSON valido. Confira o .env.live.");
  }
  if (!Array.isArray(bruto)) return [];
  return bruto
    .filter(
      (l): l is { storeId: string | number; accessToken: string; marca?: string } =>
        typeof l === "object" &&
        l !== null &&
        (typeof l.storeId === "string" || typeof l.storeId === "number") &&
        String(l.storeId).trim() !== "" &&
        typeof l.accessToken === "string" &&
        l.accessToken.trim() !== "" &&
        !chaveDeExemplo(l.accessToken),
    )
    .map((l) => ({
      // O id da loja e numero na Nuvemshop; aceita com ou sem aspas.
      storeId: String(l.storeId).trim(),
      accessToken: l.accessToken.trim(),
      // A marca e CHAVE: e ela que casa pedido com contrato (armadilha 9).
      marca: (l.marca || `Loja ${l.storeId}`).trim(),
    }));
}

function lojasNumeradas(): LojaNuvemshop[] {
  const lojas: LojaNuvemshop[] = [];
  for (let n = 1; n <= MAXIMO_LOJAS_NUMERADAS; n++) {
    const token = process.env[`NUVEMSHOP_LOJA_${n}_TOKEN`]?.trim() ?? "";
    if (token === "" || chaveDeExemplo(token)) continue;

    const storeId = process.env[`NUVEMSHOP_LOJA_${n}_STORE_ID`]?.trim() ?? "";
    const marca = process.env[`NUVEMSHOP_LOJA_${n}_MARCA`]?.trim() ?? "";
    if (!/^\d+$/.test(storeId)) {
      throw new Error(
        `A loja ${n} do .env.live tem chave, mas NUVEMSHOP_LOJA_${n}_STORE_ID não é um número. É o "user_id" que aparece junto da chave na Nuvemshop.`,
      );
    }
    if (marca === "") {
      throw new Error(
        `A loja ${n} do .env.live tem chave, mas falta NUVEMSHOP_LOJA_${n}_MARCA. É o nome que liga a loja ao contrato do influencer.`,
      );
    }
    lojas.push({ marca, storeId, accessToken: token });
  }
  return lojas;
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

// ---------------------------------------------------------------------------
// Canais de marketplace (Shopee, TikTok Shop, Mercado Livre)
// ---------------------------------------------------------------------------

/**
 * Contas de marketplace configuradas.
 *
 * Um bloco por conta, numerado a partir de 1 (ate 20):
 *
 *     CANAL_1_TIPO=mercadolivre
 *     CANAL_1_MARCA="Tha Beauty"
 *     CANAL_1_LOJA_ID=123456789
 *     CANAL_1_CHAVE=...
 *     CANAL_1_SEGREDO=...
 *
 * Bloco sem TIPO e sem CHAVE e ignorado por inteiro: da para deixar os cinco
 * blocos prontos no arquivo e preencher conforme as chaves chegam. Bloco pela
 * metade, nao -- ali alguem comecou a preencher e parou, e seguir em silencio
 * esconderia o erro ate a busca falhar.
 *
 * Os nomes dos campos sao genericos de proposito: os tres marketplaces pedem
 * as mesmas quatro coisas com nomes diferentes, e `NOMES_DA_CREDENCIAL` (em
 * `types/canais.ts`) faz a traducao para quem vai colar as chaves.
 *
 * Devolve lista vazia quando nada esta configurado. Hoje NINGUEM consome isto
 * para buscar pedido: a integracao e a Fase 4 (secao 9), e o que existe ate
 * aqui e o cadastro das credenciais.
 */
export function contasDeCanal(): ContaDeCanal[] {
  const contas: ContaDeCanal[] = [];

  for (let n = 1; n <= 20; n++) {
    const ler = (campo: string) => process.env[`CANAL_${n}_${campo}`]?.trim() ?? "";
    const tipo = ler("TIPO").toLowerCase();
    const chave = ler("CHAVE");
    const marca = ler("MARCA");
    const segredo = ler("SEGREDO");
    const lojaId = ler("LOJA_ID");

    // Bloco intocado: nem o tipo, nem a chave. Segue adiante sem reclamar.
    if (tipo === "" && (chave === "" || chaveDeExemplo(chave))) continue;

    if (!(CANAIS_DE_MARKETPLACE as readonly string[]).includes(tipo)) {
      throw new Error(
        `CANAL_${n}_TIPO precisa ser um destes: ${CANAIS_DE_MARKETPLACE.join(", ")}. ` +
          `Veio "${ler("TIPO")}". Confira o .env.live.`,
      );
    }
    const canal = tipo as CanalMarketplace;
    const nomes = NOMES_DA_CREDENCIAL[canal];

    // Bloco preparado, chave ainda nao colada: continua sendo "nao configurado".
    if (chave === "" || chaveDeExemplo(chave)) continue;

    /*
     * Daqui para baixo o bloco esta em uso, e falta de campo e ERRO -- e nao
     * uma conta que simplesmente nao busca. A mensagem cita o nome que a
     * pessoa viu no painel do marketplace, e nao o nosso: quem esta com a tela
     * da Shopee aberta procura "partner_key", nao "SEGREDO".
     */
    if (marca === "") {
      throw new Error(
        `CANAL_${n}_MARCA esta vazio. A marca e o que liga o pedido ao contrato do influencer: ` +
          `sem ela o faturamento deste canal nao entra em conta nenhuma.`,
      );
    }
    if (segredo === "" || chaveDeExemplo(segredo)) {
      throw new Error(
        `CANAL_${n}_SEGREDO esta vazio (${nomes.segredo}, no ${nomes.onde}).`,
      );
    }
    if (lojaId === "") {
      throw new Error(`CANAL_${n}_LOJA_ID esta vazio (${nomes.lojaId}, no ${nomes.onde}).`);
    }

    const opcional = (campo: string) => {
      const valor = ler(campo);
      return valor === "" || chaveDeExemplo(valor) ? null : valor;
    };

    contas.push({
      canal,
      marca,
      lojaId,
      chave,
      segredo,
      tokenInicial: opcional("TOKEN"),
      refreshInicial: opcional("REFRESH"),
    });
  }

  /*
   * A mesma loja duas vezes no mesmo canal e erro: as duas buscariam os mesmos
   * pedidos e o faturamento sairia dobrado. Em canais diferentes, nao -- o
   * mesmo numero pode existir na Shopee e no Mercado Livre sem nenhuma
   * relacao.
   */
  const vistas = new Set<string>();
  for (const conta of contas) {
    const id = chaveDaConta(conta.canal, conta.lojaId);
    if (vistas.has(id)) {
      throw new Error(
        `A loja ${conta.lojaId} aparece duas vezes em ${ROTULO_CANAL[conta.canal]}. Confira o .env.live.`,
      );
    }
    vistas.add(id);
  }

  return contas;
}
