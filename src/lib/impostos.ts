/**
 * Aplicacao dos impostos cadastrados sobre os pedidos. Funcoes PURAS.
 *
 * Duas decisoes que valem ser lidas antes de mexer aqui:
 *
 * 1. A base e o RECEBIDO, nao o faturado. Pedido cancelado nao gera receita
 *    tributavel, e boleto nunca pago tambem nao, no regime de caixa. Tributar
 *    o bruto inflaria o imposto em ~20% no cenario desta empresa.
 *
 * 2. O que esta DENTRO do DAS nunca soma no total. A guia unica ja e um valor
 *    fechado; a quebra por tributo existe so para o dono entender para onde o
 *    dinheiro vai. Somar as duas coisas dobraria o imposto.
 */

import { paraNumero, type Pedido } from "@/types/nuvemshop";
import type { EsferaImposto, Imposto, ConfiguracaoFiscal } from "@/types/fiscal";
import { chaveProduto, type ChaveProduto, type Produto } from "@/types/produto";
import { razaoSegura } from "@/lib/format";
import { chaveMes, pedidosRecebidos, reconciliar } from "@/lib/metrics";
import {
  apurarSimples,
  monitorarTeto,
  type ApuracaoSimples,
  type MonitorTeto,
} from "@/lib/simplesNacional";

// ---------------------------------------------------------------------------
// Indice do cadastro de produtos
// ---------------------------------------------------------------------------

export interface IndiceProdutos {
  porVariante: Map<ChaveProduto, Produto>;
  porProduto: Map<number, Produto>;
}

export function indexarProdutos(produtos: Produto[]): IndiceProdutos {
  const porVariante = new Map<ChaveProduto, Produto>();
  const porProduto = new Map<number, Produto>();

  for (const produto of produtos) {
    if (!produto.ativo) continue;
    if (produto.varianteId === null) porProduto.set(produto.produtoId, produto);
    else porVariante.set(produto.chave, produto);
  }

  return { porVariante, porProduto };
}

/**
 * Cadastro de um item vendido, ou `null`.
 *
 * Assim como no custo, a ficha da variante tem precedencia sobre a do produto
 * inteiro: NCM e ICMS-ST podem mudar entre tamanhos do mesmo produto.
 */
export function produtoDoItem(
  indice: IndiceProdutos,
  produtoId: number,
  varianteId: number,
): Produto | null {
  return (
    indice.porVariante.get(chaveProduto(produtoId, varianteId)) ??
    indice.porProduto.get(produtoId) ??
    null
  );
}

// ---------------------------------------------------------------------------
// RBT12
// ---------------------------------------------------------------------------

export interface ResultadoRBT12 {
  valor: number;
  /** Quantos meses de historico entraram na conta. */
  mesesConsiderados: number;
  /** `true` quando faltavam meses e o valor foi projetado para 12. */
  projetado: boolean;
  origem: "informado" | "historico" | "projecao";
}

/**
 * Receita bruta dos ultimos 12 meses.
 *
 * Com menos de 12 meses de historico, projeta pela media -- e o que a propria
 * legislacao manda a empresa nova fazer. O painel sinaliza que houve projecao
 * em vez de apresentar o numero como se fosse historico fechado.
 */
export function calcularRBT12(
  pedidos: Pedido[],
  config: ConfiguracaoFiscal,
): ResultadoRBT12 {
  if (config.rbt12Manual !== null && config.rbt12Manual > 0) {
    return {
      valor: config.rbt12Manual,
      mesesConsiderados: 12,
      projetado: false,
      origem: "informado",
    };
  }

  const porMes = new Map<string, Pedido[]>();
  for (const pedido of pedidos) {
    const mes = chaveMes(pedido.created_at);
    const lista = porMes.get(mes);
    if (lista) lista.push(pedido);
    else porMes.set(mes, [pedido]);
  }

  const meses = [...porMes.keys()].sort((a, b) => b.localeCompare(a)).slice(0, 12);
  const soma = meses.reduce(
    (total, mes) => total + reconciliar(porMes.get(mes)!).recebido,
    0,
  );

  if (meses.length === 0) {
    return { valor: 0, mesesConsiderados: 0, projetado: false, origem: "historico" };
  }

  if (meses.length < 12) {
    return {
      valor: (soma / meses.length) * 12,
      mesesConsiderados: meses.length,
      projetado: true,
      origem: "projecao",
    };
  }

  return { valor: soma, mesesConsiderados: 12, projetado: false, origem: "historico" };
}

// ---------------------------------------------------------------------------
// Apuracao
// ---------------------------------------------------------------------------

export interface LinhaImposto {
  impostoId: string;
  sigla: string;
  nome: string;
  esfera: EsferaImposto;
  /** Percentual aplicado. */
  aliquota: number;
  /** Valor sobre o qual a aliquota incidiu. */
  base: number;
  valor: number;
  /** `false` enquanto ninguem confirmou a aliquota com o contador. */
  confirmado: boolean;
  /** `true` quando o imposto so vale para os produtos que o marcaram. */
  porProduto: boolean;
}

export interface ResultadoImpostos {
  /** Receita que serviu de base aos tributos sobre venda. */
  baseReceita: number;

  /** DAS do mes. `null` fora do Simples. */
  simples: ApuracaoSimples | null;
  monitorTeto: MonitorTeto | null;
  rbt12: ResultadoRBT12;

  /** Tributos recolhidos por fora da guia unica. Estes SOMAM. */
  foraDoDAS: LinhaImposto[];
  /** Quebra do que ha dentro do DAS. Detalhamento: NAO soma. */
  detalheDoDAS: LinhaImposto[];

  /** DAS + tributos fora do DAS. */
  totalSobreVenda: number;
  /** Fracao da receita que vira imposto. */
  cargaSobreReceita: number;

  /** Receita de itens sem cadastro fiscal -- lacuna declarada, nao escondida. */
  receitaSemCadastro: number;
  produtosSemCadastro: number;
  /** Fracao da receita coberta por cadastro fiscal. */
  cobertura: number;

  /** `true` se algum imposto usado ainda nao passou pelo contador. */
  temImpostoNaoConfirmado: boolean;
}

/**
 * Apura os impostos do periodo.
 *
 * `pedidos` deve ser o mes analisado; `pedidosHistorico`, a base inteira --
 * o RBT12 olha 12 meses para tras, nao so o mes da tela.
 */
export function apurarImpostos(
  pedidos: Pedido[],
  pedidosHistorico: Pedido[],
  produtos: Produto[],
  impostos: Imposto[],
  config: ConfiguracaoFiscal,
): ResultadoImpostos {
  const reconciliacao = reconciliar(pedidos);
  const baseReceita = reconciliacao.recebido;

  const indice = indexarProdutos(produtos);
  const ativos = impostos.filter((i) => i.ativo);

  // --- Receita por imposto, para os que dependem do produto ----------------
  const receitaPorImposto = new Map<string, number>();
  let receitaSemCadastro = 0;
  let receitaComCadastro = 0;
  const semCadastro = new Set<number>();

  for (const pedido of pedidosRecebidos(pedidos)) {
    for (const item of pedido.products) {
      const receitaItem = paraNumero(item.price) * item.quantity;
      const produto = produtoDoItem(indice, item.product_id, item.variant_id);

      if (!produto) {
        receitaSemCadastro += receitaItem;
        semCadastro.add(item.product_id);
        continue;
      }

      receitaComCadastro += receitaItem;
      for (const impostoId of produto.impostosIds) {
        receitaPorImposto.set(
          impostoId,
          (receitaPorImposto.get(impostoId) ?? 0) + receitaItem,
        );
      }
    }
  }

  // --- Tributos fora da guia unica -----------------------------------------
  const foraDoDAS: LinhaImposto[] = [];
  for (const imposto of ativos) {
    if (imposto.dentroDoDAS) continue;
    if (imposto.baseIncidencia !== "receita") continue;

    const base = imposto.aplicacaoPorProduto
      ? (receitaPorImposto.get(imposto.id) ?? 0)
      : baseReceita;

    if (base <= 0) continue;

    foraDoDAS.push({
      impostoId: imposto.id,
      sigla: imposto.sigla,
      nome: imposto.nome,
      esfera: imposto.esfera,
      aliquota: imposto.aliquota,
      base,
      valor: (base * imposto.aliquota) / 100,
      confirmado: imposto.confirmadoPeloContador,
      porProduto: imposto.aplicacaoPorProduto,
    });
  }
  foraDoDAS.sort((a, b) => b.valor - a.valor);

  // --- Guia unica ----------------------------------------------------------
  const rbt12 = calcularRBT12(pedidosHistorico, config);
  const noSimples = config.regime === "simples_nacional";

  const simples = noSimples ? apurarSimples(rbt12.valor, baseReceita) : null;
  const monitorTeto = noSimples ? monitorarTeto(rbt12.valor) : null;

  const detalheDoDAS: LinhaImposto[] = simples
    ? simples.composicao.map((t) => ({
        impostoId: `das-${t.sigla}`,
        sigla: t.sigla,
        nome: t.nome,
        esfera:
          t.sigla === "ICMS"
            ? ("estadual" as const)
            : ("federal" as const),
        aliquota: t.aliquotaSobreReceita,
        base: baseReceita,
        valor: t.valor,
        confirmado: true,
        porProduto: false,
      }))
    : ativos
        .filter((i) => i.dentroDoDAS)
        .map((i) => ({
          impostoId: i.id,
          sigla: i.sigla,
          nome: i.nome,
          esfera: i.esfera,
          aliquota: i.aliquota,
          base: baseReceita,
          valor: (baseReceita * i.aliquota) / 100,
          confirmado: i.confirmadoPeloContador,
          porProduto: false,
        }));

  const totalForaDoDAS = foraDoDAS.reduce((s, l) => s + l.valor, 0);
  const totalSobreVenda = (simples?.valorDAS ?? 0) + totalForaDoDAS;

  const receitaTotal = receitaComCadastro + receitaSemCadastro;

  return {
    baseReceita,
    simples,
    monitorTeto,
    rbt12,
    foraDoDAS,
    detalheDoDAS,
    totalSobreVenda,
    cargaSobreReceita: razaoSegura(totalSobreVenda, baseReceita),
    receitaSemCadastro,
    produtosSemCadastro: semCadastro.size,
    cobertura: razaoSegura(receitaComCadastro, receitaTotal),
    temImpostoNaoConfirmado: foraDoDAS.some((l) => !l.confirmado),
  };
}

/**
 * Todas as linhas de imposto que efetivamente somam, ja incluindo o DAS
 * como uma linha unica. E o que a tela de detalhamento mostra.
 */
export function linhasQueSomam(resultado: ResultadoImpostos): LinhaImposto[] {
  const linhas = [...resultado.foraDoDAS];

  if (resultado.simples) {
    linhas.unshift({
      impostoId: "das",
      sigla: "DAS",
      nome: "Simples Nacional (guia unica)",
      esfera: "federal",
      aliquota: resultado.simples.aliquotaEfetiva,
      base: resultado.simples.baseDoMes,
      valor: resultado.simples.valorDAS,
      confirmado: true,
      porProduto: false,
    });
  }

  return linhas.sort((a, b) => b.valor - a.valor);
}
