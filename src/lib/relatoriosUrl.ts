/**
 * Traducao entre a configuracao do relatorio e a query string.
 *
 * Funcoes PURAS, separadas da tela, porque sao a fronteira onde entra texto
 * que o usuario pode ter digitado na barra de endereco. Toda leitura valida
 * contra as listas conhecidas: um `?agrupar=deletar` tem que cair na
 * combinacao padrao, nunca derrubar a pagina nem virar um agrupamento
 * inventado.
 */

import {
  COMBINACAO_PADRAO,
  DIMENSOES,
  FILTROS_VAZIOS,
  METRICAS,
  metricaDisponivel,
  type ConfiguracaoRelatorio,
  type Dimensao,
  type Metrica,
} from "@/types/relatorio";

export type ParametrosUrl = Record<string, string | string[] | undefined>;

const CHAVE = {
  agrupar: "agrupar",
  depois: "depois",
  metricas: "metricas",
  ordenar: "ordenar",
  de: "de",
  ate: "ate",
  marcas: "marcas",
  estados: "estados",
  pagamentos: "pagamentos",
} as const;

/** Primeiro valor do parametro. A URL pode repetir a chave; a tela nao usa isso. */
function texto(params: ParametrosUrl, chave: string): string {
  const valor = params[chave];
  return (Array.isArray(valor) ? valor[0] : valor)?.trim() ?? "";
}

/** Lista separada por virgula, sem vazios e sem repetidos. */
function lista(params: ParametrosUrl, chave: string): string[] {
  const bruto = texto(params, chave);
  if (!bruto) return [];
  return [...new Set(bruto.split(",").map((v) => v.trim()).filter(Boolean))];
}

/** Chave de mes valida (`AAAA-MM`). Qualquer outra coisa vira "sem limite". */
function mes(params: ParametrosUrl, chave: string): string {
  const valor = texto(params, chave);
  return /^\d{4}-\d{2}$/.test(valor) ? valor : "";
}

function dimensao(valor: string): Dimensao | null {
  return (DIMENSOES as string[]).includes(valor) ? (valor as Dimensao) : null;
}

export function lerConfiguracaoDaUrl(params: ParametrosUrl): ConfiguracaoRelatorio {
  const padrao = COMBINACAO_PADRAO.configuracao;

  const agruparPor = dimensao(texto(params, CHAVE.agrupar)) ?? padrao.agruparPor;

  const depoisBruto = dimensao(texto(params, CHAVE.depois));
  // Agrupar por marca e depois por marca de novo produziria um nivel filho com
  // uma linha so, identica ao pai. Melhor tratar como "sem segundo nivel".
  const depoisPor = depoisBruto && depoisBruto !== agruparPor ? depoisBruto : null;

  const pedidas = lista(params, CHAVE.metricas).filter((m): m is Metrica =>
    (METRICAS as string[]).includes(m),
  );

  /*
   * Sem metrica valida na URL, cai no conjunto do relatorio padrao -- mas so
   * o que serve para a dimensao escolhida. Uma tabela sem nenhuma coluna nao
   * e um estado que o usuario consiga consertar olhando para ela.
   */
  const metricas = pedidas.length
    ? pedidas
    : padrao.metricas.filter((m) => metricaDisponivel(agruparPor, m));

  const ordenarBruto = texto(params, CHAVE.ordenar);
  const ordenarPor = (METRICAS as string[]).includes(ordenarBruto)
    ? (ordenarBruto as Metrica)
    : (metricas[0] ?? padrao.ordenarPor);

  return {
    agruparPor,
    depoisPor,
    metricas,
    ordenarPor,
    filtros: {
      ...FILTROS_VAZIOS,
      mesInicial: mes(params, CHAVE.de),
      mesFinal: mes(params, CHAVE.ate),
      marcas: lista(params, CHAVE.marcas),
      estados: lista(params, CHAVE.estados),
      pagamentos: lista(params, CHAVE.pagamentos),
    },
  };
}

/**
 * Configuracao -> query string.
 *
 * Omite o que esta vazio para a URL continuar legivel: um link com
 * `?marcas=&estados=&pagamentos=` assusta sem acrescentar nada.
 */
export function escreverConfiguracaoNaUrl(
  configuracao: ConfiguracaoRelatorio,
): URLSearchParams {
  const params = new URLSearchParams();
  const { filtros } = configuracao;

  params.set(CHAVE.agrupar, configuracao.agruparPor);
  if (configuracao.depoisPor) params.set(CHAVE.depois, configuracao.depoisPor);
  if (configuracao.metricas.length) {
    params.set(CHAVE.metricas, configuracao.metricas.join(","));
  }
  params.set(CHAVE.ordenar, configuracao.ordenarPor);

  if (filtros.mesInicial) params.set(CHAVE.de, filtros.mesInicial);
  if (filtros.mesFinal) params.set(CHAVE.ate, filtros.mesFinal);
  if (filtros.marcas.length) params.set(CHAVE.marcas, filtros.marcas.join(","));
  if (filtros.estados.length) params.set(CHAVE.estados, filtros.estados.join(","));
  if (filtros.pagamentos.length) {
    params.set(CHAVE.pagamentos, filtros.pagamentos.join(","));
  }

  return params;
}
