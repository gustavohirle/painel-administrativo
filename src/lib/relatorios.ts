/**
 * Relatorios: os MESMOS pedidos, quebrados por dimensoes diferentes.
 *
 * Funcoes PURAS. Nao importa React, nao faz fetch, nao le variavel de ambiente.
 *
 * A decisao central deste arquivo e nao ter conta propria. Cada metrica sai de
 * `reconciliar`, `calcularCMV`, `apurarImpostos` e `montarDemonstrativo` --
 * as mesmas funcoes que alimentam o painel principal, so que aplicadas a um
 * subconjunto de pedidos. Se o relatorio tivesse aritmetica propria, o total
 * por marca poderia divergir do total da tela inicial, e o cliente encontraria
 * duas versoes da verdade no mesmo painel.
 */

import type { DespesaInfluencer } from "@/types/dominio";
import {
  metodoDoPedido,
  paraNumero,
  type Pedido,
} from "@/types/nuvemshop";
import type { CustoProduto, Influencer } from "@/types/dominio";
import type { Produto } from "@/types/produto";
import type { AliquotaEstado, Imposto } from "@/types/fiscal";
import { nomeDoEstado, normalizarUF } from "@/types/estados";
import {
  chaveMes,
  pedidosRecebidos,
  reconciliar,
} from "@/lib/metrics";
import { calcularCMV, montarDemonstrativo, rentabilidadePorProduto } from "@/lib/costing";
import { apurarImpostos } from "@/lib/impostos";
import { apurarTaxasPlataforma } from "@/lib/plataforma";
import type { TaxaPlataforma } from "@/types/plataforma";
import { mesAno, razaoSegura, rotuloMetodo } from "@/lib/format";
import {
  metricaDisponivel,
  motivoIndisponivel,
  type ConfiguracaoRelatorio,
  type Dimensao,
  type FiltrosRelatorio,
  type Metrica,
} from "@/types/relatorio";

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

/**
 * Tudo que o relatorio precisa. `pedidos` e a base INTEIRA, nao a filtrada: o
 * RBT12 do Simples olha 12 meses para tras, entao o periodo escolhido na tela
 * nao pode podar o historico que sustenta a aliquota.
 */
export interface DadosRelatorio {
  pedidos: Pedido[];
  custos: CustoProduto[];
  produtos: Produto[];
  influencers: Influencer[];
  impostos: Imposto[];
  taxasPlataforma: TaxaPlataforma[];
  aliquotasEstaduais: AliquotaEstado[];
  /**
   * Todas as despesas de influencer, JA divididas por `ratearDespesas` com a
   * base inteira. A DRE separa as que cabem em cada grupo; compartilhada nao
   * dividida ficaria de fora.
   */
  despesasInfluencer?: DespesaInfluencer[];
}

export type Valores = Partial<Record<Metrica, number | null>>;

export interface LinhaRelatorio {
  chave: string;
  rotulo: string;
  valores: Valores;
  /** Segundo nivel de agrupamento. Vazio quando o relatorio tem um nivel so. */
  filhas: LinhaRelatorio[];
}

export interface ResultadoRelatorio {
  linhas: LinhaRelatorio[];
  /**
   * Totais do periodo.
   *
   * Calculados sobre TODOS os pedidos filtrados, nao somando as celulas acima.
   * Assim a linha de total continua certa para media e percentual, que nao se
   * somam, e serve de conferencia: se a soma visual das linhas nao bater com
   * ela, o agrupamento deixou pedido de fora.
   */
  total: Valores;
  /** Colunas efetivamente exibiveis, na ordem canonica. */
  metricas: Metrica[];
  /** Metricas pedidas que nao valem nesta dimensao, com o motivo. */
  recusadas: Array<{ metrica: Metrica; motivo: string }>;
  /** Quantos pedidos sobraram depois dos filtros. */
  pedidosNoPeriodo: number;
  /** Meses realmente cobertos, ja resolvidos (o filtro aceita vazio). */
  periodo: { inicio: string; fim: string };
  /** Avisos honestos sobre o que o numero nao inclui. */
  avisos: string[];
}

// ---------------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------------

/** UF de destino do pedido, ja normalizada. `null` quando nao da para saber. */
export function ufDoPedido(pedido: Pedido): string | null {
  return normalizarUF(pedido.shipping_address?.province);
}

// `metodoDoPedido` mora em `types/nuvemshop.ts`, junto da normalizacao.
// Reexportado aqui porque a pagina de relatorios monta as opcoes de filtro com
// ele, e antes havia uma copia local que caia em "desconhecido" -- o mesmo
// pedido ia para baldes diferentes na tela de relatorios e no calculo da taxa.
export { metodoDoPedido };

/**
 * Aplica os filtros da tela. Ordem irrelevante: sao todos conjuncoes, e lista
 * vazia significa "todos" -- nunca "nenhum". Um filtro que zera a tela quando
 * o usuario ainda nao escolheu nada parece bug.
 */
export function filtrarPedidos(pedidos: Pedido[], filtros: FiltrosRelatorio): Pedido[] {
  const marcas = new Set(filtros.marcas);
  const estados = new Set(filtros.estados);
  const pagamentos = new Set(filtros.pagamentos);

  return pedidos.filter((pedido) => {
    const mes = chaveMes(pedido.created_at);
    if (filtros.mesInicial && mes < filtros.mesInicial) return false;
    if (filtros.mesFinal && mes > filtros.mesFinal) return false;
    if (marcas.size && !marcas.has(pedido.marca)) return false;
    if (pagamentos.size && !pagamentos.has(metodoDoPedido(pedido))) return false;

    if (estados.size) {
      const uf = ufDoPedido(pedido);
      if (!uf || !estados.has(uf)) return false;
    }

    return true;
  });
}

// ---------------------------------------------------------------------------
// Agrupamento
// ---------------------------------------------------------------------------

const SEM_INFLUENCER = "Sem influencer vinculado";
const SEM_ESTADO = "Sem estado identificado";

/** Marca -> influencer ativo. Um influencer por marca; o primeiro ativo manda. */
function influencerPorMarca(influencers: Influencer[]): Map<string, Influencer> {
  const mapa = new Map<string, Influencer>();
  for (const influencer of influencers) {
    if (!influencer.ativo) continue;
    if (!mapa.has(influencer.marca)) mapa.set(influencer.marca, influencer);
  }
  return mapa;
}

/** Chave e rotulo do grupo a que o pedido pertence numa dimensao. */
function grupoDoPedido(
  pedido: Pedido,
  dimensao: Dimensao,
  porMarca: Map<string, Influencer>,
): { chave: string; rotulo: string } {
  switch (dimensao) {
    case "marca":
      return { chave: pedido.marca, rotulo: pedido.marca };
    case "influencer": {
      const influencer = porMarca.get(pedido.marca);
      return influencer
        ? { chave: influencer.id, rotulo: `${influencer.nome} (${influencer.marca})` }
        : { chave: `sem:${pedido.marca}`, rotulo: `${SEM_INFLUENCER} (${pedido.marca})` };
    }
    case "estado": {
      const uf = ufDoPedido(pedido);
      return uf
        ? { chave: uf, rotulo: `${uf} - ${nomeDoEstado(uf)}` }
        : { chave: "sem-uf", rotulo: SEM_ESTADO };
    }
    case "pagamento": {
      const metodo = metodoDoPedido(pedido);
      return { chave: metodo, rotulo: rotuloMetodo(metodo) };
    }
    case "mes": {
      const mes = chaveMes(pedido.created_at);
      return { chave: mes, rotulo: mesAno(mes) };
    }
    case "produto":
      // Produto nao agrupa pedido inteiro -- tratado por item, fora daqui.
      return { chave: "", rotulo: "" };
  }
}

/**
 * Um grupo corresponde a uma marca inteira?
 *
 * So entao comissao e imposto existem: o contrato e da marca e a guia do
 * Simples e mensal sobre o recebido dela. Repare que a pergunta e sobre o
 * CAMINHO todo, nao sobre um nivel: "marca depois mes" continua sendo uma
 * marca (num mes), mas "marca depois estado" ja e um pedaco dela.
 */
function caminhoAlinhadoAMarca(caminho: Dimensao[]): boolean {
  return caminho.every((d) => d === "marca" || d === "influencer" || d === "mes");
}

/**
 * O FILTRO tambem pode cortar a marca ao meio.
 *
 * Agrupar por marca com o filtro "estado = SP" nao produz linhas de marca:
 * produz linhas de "marca dentro de SP". A comissao do contrato e o DAS do
 * Simples continuam sendo do conjunto inteiro, entao exibi-los ali seria o
 * mesmo erro de rateio que `metricaDisponivel` evita no agrupamento -- so que
 * escondido num filtro, onde ninguem procuraria.
 *
 * Filtrar por marca ou por periodo nao corta: marca inteira continua marca
 * inteira, e a apuracao ja e mensal.
 */
function filtroCortaMarca(filtros: FiltrosRelatorio): boolean {
  return filtros.estados.length > 0 || filtros.pagamentos.length > 0;
}

// ---------------------------------------------------------------------------
// Metricas de um grupo
// ---------------------------------------------------------------------------

function unidadesEReceita(pedidos: Pedido[]): { unidades: number; receita: number } {
  let unidades = 0;
  let receita = 0;
  for (const pedido of pedidosRecebidos(pedidos)) {
    for (const item of pedido.products) {
      unidades += item.quantity;
      receita += paraNumero(item.price) * item.quantity;
    }
  }
  return { unidades, receita };
}

/**
 * Calcula as metricas pedidas para um conjunto de pedidos.
 *
 * `historico` e a fatia da base que serve de RBT12 para este grupo -- ja
 * recortada por marca e ate o mes do grupo por quem chamou.
 */
function metricasDoGrupo(
  pedidos: Pedido[],
  historico: Pedido[],
  dados: DadosRelatorio,
  metricas: Metrica[],
  caminho: Dimensao[],
  permiteMarca: boolean,
): Valores {
  const valores: Valores = {};
  const rec = reconciliar(pedidos);
  const alinhado = permiteMarca && caminhoAlinhadoAMarca(caminho);

  const precisaCusto = metricas.some((m) =>
    ["cmv", "margemContribuicao", "margemItens", "lucro", "margemPercentual"].includes(m),
  );
  const precisaDre = alinhado && metricas.some((m) =>
    ["impostos", "comissao", "lucro", "margemPercentual", "margemContribuicao"].includes(m),
  );

  const cmv = precisaCusto ? calcularCMV(pedidos, dados.custos, dados.produtos) : null;

  const dre = precisaDre
    ? montarDemonstrativo(pedidos, dados.custos, dados.influencers, {
        produtos: dados.produtos,
        // Taxa e despesa entram aqui pelo mesmo motivo do painel: sem elas o
        // lucro do relatorio sairia maior que o da tela inicial para os mesmos
        // pedidos -- duas versoes do mesmo numero.
        taxasPlataforma: apurarTaxasPlataforma(pedidos, dados.taxasPlataforma),
        despesasInfluencers: dados.despesasInfluencer ?? [],
        impostos: apurarImpostos(
          pedidos,
          historico,
          dados.produtos,
          dados.impostos,
          dados.influencers,
          dados.aliquotasEstaduais,
        ),
      })
    : null;

  const itens = metricas.some((m) => m === "unidades" || m === "receitaItens" || m === "margemItens")
    ? unidadesEReceita(pedidos)
    : null;

  for (const metrica of metricas) {
    // Uma metrica valida no topo pode nao valer no nivel de baixo: "lucro por
    // marca depois por estado" tem lucro na marca e traco no estado.
    if (!caminho.every((d) => metricaDisponivel(d, metrica))) {
      valores[metrica] = null;
      continue;
    }

    switch (metrica) {
      case "pedidos": valores.pedidos = rec.quantidade.total; break;
      case "bruto": valores.bruto = rec.bruto; break;
      case "naoPago": valores.naoPago = rec.naoPago; break;
      case "cancelado": valores.cancelado = rec.cancelado; break;
      case "reembolsado": valores.reembolsado = rec.reembolsado; break;
      case "recebido": valores.recebido = rec.recebido; break;
      case "frete": valores.frete = rec.frete; break;
      case "receitaReal": valores.receitaReal = rec.receitaReal; break;
      case "percentualNaoPago":
        valores.percentualNaoPago = razaoSegura(rec.naoPago, rec.bruto);
        break;
      case "ticketMedio":
        valores.ticketMedio = razaoSegura(rec.recebido, rec.quantidade.recebido);
        break;
      case "unidades": valores.unidades = itens?.unidades ?? 0; break;
      case "receitaItens": valores.receitaItens = itens?.receita ?? 0; break;
      case "cmv": valores.cmv = cmv?.cmv ?? 0; break;
      case "margemItens":
        valores.margemItens = (itens?.receita ?? 0) - (cmv?.cmv ?? 0);
        break;
      case "margemContribuicao":
        valores.margemContribuicao = dre ? dre.margemContribuicao : null;
        break;
      case "impostos": valores.impostos = dre ? dre.totalImpostos : null; break;
      // A taxa e por pedido: vale em qualquer agrupamento, sem depender da DRE.
      case "taxas":
        valores.taxas = apurarTaxasPlataforma(pedidos, dados.taxasPlataforma).total;
        break;
      case "comissao": valores.comissao = dre ? dre.totalComissoes : null; break;
      case "lucro": valores.lucro = dre ? dre.lucroOperacional : null; break;
      case "margemPercentual":
        valores.margemPercentual = dre ? dre.margemOperacionalPercentual : null;
        break;
    }
  }

  return valores;
}

/** Linhas da dimensao `produto`, que agrega por item e nao por pedido. */
function linhasDeProduto(
  pedidos: Pedido[],
  dados: DadosRelatorio,
  metricas: Metrica[],
): LinhaRelatorio[] {
  return rentabilidadePorProduto(
    pedidos,
    dados.custos,
    dados.produtos,
    dados.taxasPlataforma,
  ).map((linha) => {
    const valores: Valores = {};
    for (const metrica of metricas) {
      switch (metrica) {
        case "unidades": valores.unidades = linha.unidadesVendidas; break;
        case "receitaItens": valores.receitaItens = linha.receita; break;
        // `null` de proposito em produto sem ficha: zero afirmaria custo zero,
        // e um produto sem custo cadastrado nao custa nada apenas na planilha.
        case "cmv": valores.cmv = linha.custoTotal; break;
        case "margemItens": valores.margemItens = linha.margem; break;
        // Rateada por participacao do item na receita do pedido -- ver
        // `LinhaRentabilidade.taxaPlataforma`.
        case "taxas": valores.taxas = linha.taxaPlataforma; break;
        default: valores[metrica] = null;
      }
    }

    return {
      chave: String(linha.produtoId),
      rotulo: linha.sku ? `${linha.nome} (${linha.sku})` : linha.nome,
      valores,
      filhas: [],
    };
  });
}

// ---------------------------------------------------------------------------
// Montagem
// ---------------------------------------------------------------------------

/**
 * Ordena da maior para a menor pela metrica escolhida.
 *
 * `ordenarPor` pode ser `undefined` quando nenhuma metrica sobrou (todas
 * recusadas pela dimensao ou pelo filtro). Nesse caso a ordem alfabetica e a
 * unica honesta -- inventar uma metrica de ordenacao mostraria as linhas numa
 * ordem que a tela nao explica.
 */
function ordenar(
  linhas: LinhaRelatorio[],
  ordenarPor: Metrica | undefined,
): LinhaRelatorio[] {
  if (!ordenarPor) {
    return [...linhas].sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  }

  return [...linhas].sort((a, b) => {
    const va = a.valores[ordenarPor];
    const vb = b.valores[ordenarPor];
    // Linha sem o valor da ordenacao vai para o fim, nao para o topo como um
    // zero faria -- "sem custo cadastrado" nao e "margem zero".
    if (va == null && vb == null) return a.rotulo.localeCompare(b.rotulo, "pt-BR");
    if (va == null) return 1;
    if (vb == null) return -1;
    if (vb !== va) return vb - va;
    return a.rotulo.localeCompare(b.rotulo, "pt-BR");
  });
}

/**
 * Monta o relatorio inteiro.
 *
 * Roda no servidor: recebe a base completa e devolve dezenas de linhas
 * agregadas, nunca a lista de pedidos.
 */
export function montarRelatorio(
  configuracao: ConfiguracaoRelatorio,
  dados: DadosRelatorio,
): ResultadoRelatorio {
  const { agruparPor, depoisPor, filtros } = configuracao;
  const filtrados = filtrarPedidos(dados.pedidos, filtros);

  // Colunas: o que vale no nivel de cima. O nivel de baixo pode recusar
  // individualmente, e essas celulas viram traco.
  const permiteMarca = !filtroCortaMarca(filtros);
  const MOTIVO_FILTRO =
    "O filtro de estado ou de meio de pagamento corta cada marca ao meio. O contrato de comissao e a guia do Simples valem para a marca inteira, entao nao ha como apresenta-los sobre um pedaco dela.";

  const aceita = (m: Metrica): boolean =>
    metricaDisponivel(agruparPor, m) &&
    (permiteMarca || metricaDisponivel("estado", m));

  const metricas = configuracao.metricas.filter(aceita);
  const recusadas = configuracao.metricas
    .filter((m) => !aceita(m))
    .map((m) => ({
      metrica: m,
      motivo: motivoIndisponivel(agruparPor, m) ?? MOTIVO_FILTRO,
    }));

  const ordenarPor: Metrica | undefined = metricas.includes(configuracao.ordenarPor)
    ? configuracao.ordenarPor
    : metricas[0];

  const porMarca = influencerPorMarca(dados.influencers);

  /** Historico para o RBT12 de um grupo: mesma marca, ate o mes do grupo. */
  const historicoDe = (pedidosDoGrupo: Pedido[]): Pedido[] => {
    if (pedidosDoGrupo.length === 0) return [];
    const marcas = new Set(pedidosDoGrupo.map((p) => p.marca));
    const ultimoMes = pedidosDoGrupo
      .map((p) => chaveMes(p.created_at))
      .reduce((a, b) => (a > b ? a : b));
    return dados.pedidos.filter(
      (p) => marcas.has(p.marca) && chaveMes(p.created_at) <= ultimoMes,
    );
  };

  let linhas: LinhaRelatorio[];

  if (agruparPor === "produto") {
    linhas = linhasDeProduto(filtrados, dados, metricas);
  } else {
    const grupos = new Map<string, { rotulo: string; pedidos: Pedido[] }>();
    for (const pedido of filtrados) {
      const { chave, rotulo } = grupoDoPedido(pedido, agruparPor, porMarca);
      const grupo = grupos.get(chave);
      if (grupo) grupo.pedidos.push(pedido);
      else grupos.set(chave, { rotulo, pedidos: [pedido] });
    }

    linhas = [...grupos.entries()].map(([chave, grupo]) => ({
      chave,
      rotulo: grupo.rotulo,
      valores: metricasDoGrupo(
        grupo.pedidos,
        historicoDe(grupo.pedidos),
        dados,
        metricas,
        [agruparPor],
        permiteMarca,
      ),
      filhas:
        depoisPor === null
          ? []
          : depoisPor === "produto"
            ? ordenar(linhasDeProduto(grupo.pedidos, dados, metricas), ordenarPor)
            : ordenar(
                [
                  ...grupo.pedidos
                    .reduce((mapa, pedido) => {
                      const filha = grupoDoPedido(pedido, depoisPor, porMarca);
                      const atual = mapa.get(filha.chave);
                      if (atual) atual.pedidos.push(pedido);
                      else mapa.set(filha.chave, { rotulo: filha.rotulo, pedidos: [pedido] });
                      return mapa;
                    }, new Map<string, { rotulo: string; pedidos: Pedido[] }>())
                    .entries(),
                ].map(([chaveFilha, filha]) => ({
                  chave: chaveFilha,
                  rotulo: filha.rotulo,
                  valores: metricasDoGrupo(
                    filha.pedidos,
                    historicoDe(filha.pedidos),
                    dados,
                    metricas,
                    [agruparPor, depoisPor],
                    permiteMarca,
                  ),
                  filhas: [],
                })),
                ordenarPor,
              ),
    }));
  }

  // Total sobre o conjunto inteiro, nao somando as celulas: media e percentual
  // nao se somam, e assim a linha serve de conferencia do agrupamento.
  const total =
    agruparPor === "produto"
      ? somarLinhas(linhas, metricas)
      : // O total percorre marcas inteiras (quando o filtro deixa), entao
        // `apurarImpostos` volta a agrupar por marca sozinho la dentro.
        metricasDoGrupo(filtrados, dados.pedidos, dados, metricas, ["marca"], permiteMarca);

  return {
    linhas: ordenar(linhas, ordenarPor),
    total,
    metricas,
    recusadas,
    pedidosNoPeriodo: filtrados.length,
    periodo: resolverPeriodo(filtrados),
    avisos: montarAvisos(filtrados, metricas, agruparPor, permiteMarca),
  };
}

/** Total da dimensao produto: ali as linhas particionam itens, entao somam. */
function somarLinhas(linhas: LinhaRelatorio[], metricas: Metrica[]): Valores {
  const total: Valores = {};
  for (const metrica of metricas) {
    const valores = linhas.map((l) => l.valores[metrica]).filter((v) => v != null);
    total[metrica] = valores.length ? valores.reduce((a, b) => a + b, 0) : null;
  }
  return total;
}

function resolverPeriodo(pedidos: Pedido[]): { inicio: string; fim: string } {
  if (pedidos.length === 0) return { inicio: "", fim: "" };
  const meses = pedidos.map((p) => chaveMes(p.created_at));
  return {
    inicio: meses.reduce((a, b) => (a < b ? a : b)),
    fim: meses.reduce((a, b) => (a > b ? a : b)),
  };
}

function montarAvisos(
  pedidos: Pedido[],
  metricas: Metrica[],
  dimensao: Dimensao,
  permiteMarca: boolean,
): string[] {
  const avisos: string[] = [];

  /*
   * Nao ha aviso geral para o filtro que corta a marca: `recusadas` ja diz
   * exatamente quais colunas sairam e por que. Repetir aqui rendia a mesma
   * frase duas vezes no rodape, e no papel isso empurra as notas seguintes --
   * que sao diferentes -- para fora do campo de visao.
   */

  if (dimensao === "estado") {
    const semUF = pedidos.filter((p) => ufDoPedido(p) === null).length;
    if (semUF > 0) {
      avisos.push(
        `${semUF} pedido(s) sem estado identificado aparecem na linha "${SEM_ESTADO}".`,
      );
    }
  }

  if (dimensao === "produto") {
    avisos.push(
      "Produto nao divide o pedido: frete, desconto e imposto ficam fora destas colunas. Por isso a receita dos itens nao bate com o recebido do periodo.",
    );
  }

  if (metricas.includes("impostos")) {
    avisos.push(
      "Valores fiscais sao estimativa: as aliquotas ainda nao passaram pelo contador e o DIFAL nao faz o gross-up de base dupla.",
    );
  }

  return avisos;
}
