/**
 * DIFAL -- diferencial de aliquota de ICMS. Funcoes PURAS.
 *
 * Na venda interestadual ao consumidor final nao contribuinte, que e o caso de
 * uma loja Nuvemshop, o ICMS se parte em dois:
 *
 *   - a aliquota INTERESTADUAL fica no estado de origem;
 *   - a diferenca entre a aliquota INTERNA DO DESTINO e a interestadual vai
 *     para o estado de destino. Esse pedaco e o DIFAL.
 *
 * Tres regras que mudam o resultado e sao faceis de errar:
 *
 * 1. Venda DENTRO do proprio estado nao tem DIFAL. So operacao interestadual.
 *
 * 2. Optante do SIMPLES NACIONAL nao recolhe DIFAL na condicao de remetente --
 *    o STF suspendeu a exigencia na ADI 5464. Como o regime aqui e por
 *    influencer, isso sai de graca: marca no Simples fica fora da conta.
 *
 * 3. A base e o valor da operacao. A apuracao real usa base dupla (o imposto
 *    entra na propria base), o que aumenta um pouco o valor devido -- este
 *    painel NAO faz o gross-up, e por isso o numero e conservador para menos.
 *    Esta dito na tela.
 */

import { paraNumero, type Pedido } from "@/types/nuvemshop";
import type { AliquotaEstado } from "@/types/fiscal";
import { aliquotaInterestadual, nomeDoEstado, normalizarUF } from "@/types/estados";
import { razaoSegura } from "@/lib/format";
import { pedidosRecebidos } from "@/lib/metrics";

export interface LinhaEstado {
  uf: string;
  nome: string;
  /** Quantos pedidos recebidos foram para este estado. */
  pedidos: number;
  /** Valor recebido de vendas para este estado. */
  receita: number;
  /** Aliquota interna cadastrada, em percentual. */
  aliquotaInterna: number;
  /** Aliquota interestadual aplicada, em percentual. */
  aliquotaInterestadual: number;
  /** interna - interestadual, em percentual. Nunca negativa. */
  diferenca: number;
  /** Valor de DIFAL devido a este estado. */
  difal: number;
  /** `false` enquanto a aliquota do estado nao foi confirmada. */
  confirmado: boolean;
  /** `true` quando e o proprio estado de origem: venda interna, sem DIFAL. */
  interna: boolean;
}

export interface ResultadoDifal {
  /** Estado de origem usado no calculo. */
  ufOrigem: string;
  /** Total devido no periodo. */
  total: number;
  /** Receita que serviu de base -- so a interestadual. */
  baseInterestadual: number;
  /** Receita de vendas dentro do proprio estado, que nao geram DIFAL. */
  baseInterna: number;
  /** Fracao da receita total que virou DIFAL. */
  cargaSobreReceita: number;
  /** Uma linha por estado de destino, maior primeiro. */
  porEstado: LinhaEstado[];
  /** Receita de pedidos sem estado identificado -- lacuna declarada. */
  receitaSemEstado: number;
  pedidosSemEstado: number;
  /** `true` se algum estado usado ainda nao foi confirmado pelo contador. */
  temEstadoNaoConfirmado: boolean;
}

const VAZIO = (ufOrigem: string): ResultadoDifal => ({
  ufOrigem,
  total: 0,
  baseInterestadual: 0,
  baseInterna: 0,
  cargaSobreReceita: 0,
  porEstado: [],
  receitaSemEstado: 0,
  pedidosSemEstado: 0,
  temEstadoNaoConfirmado: false,
});

/**
 * Apura o DIFAL de um conjunto de pedidos.
 *
 * `recolheDifal` vem de fora porque quem decide e o REGIME: optante do Simples
 * nao recolhe como remetente. Passando `false`, a funcao ainda devolve a
 * distribuicao por estado (util para a tela) mas com DIFAL zerado.
 */
export function apurarDifal(
  pedidos: Pedido[],
  aliquotas: AliquotaEstado[],
  ufOrigem: string,
  recolheDifal = true,
): ResultadoDifal {
  const recebidos = pedidosRecebidos(pedidos);
  if (recebidos.length === 0) return VAZIO(ufOrigem);

  const porUF = new Map(aliquotas.map((a) => [a.uf.toUpperCase(), a]));
  const origem = ufOrigem.toUpperCase();

  interface Acumulado {
    pedidos: number;
    receita: number;
  }
  const grupos = new Map<string, Acumulado>();

  let receitaSemEstado = 0;
  let pedidosSemEstado = 0;

  for (const pedido of recebidos) {
    const valor = paraNumero(pedido.total);
    const uf = normalizarUF(pedido.shipping_address?.province);

    if (!uf) {
      receitaSemEstado += valor;
      pedidosSemEstado += 1;
      continue;
    }

    const atual = grupos.get(uf);
    if (atual) {
      atual.pedidos += 1;
      atual.receita += valor;
    } else {
      grupos.set(uf, { pedidos: 1, receita: valor });
    }
  }

  let total = 0;
  let baseInterestadual = 0;
  let baseInterna = 0;
  let temEstadoNaoConfirmado = false;

  const porEstado: LinhaEstado[] = [];

  for (const [uf, acumulado] of grupos) {
    const interna = uf === origem;
    const cadastro = porUF.get(uf);

    // Estado desativado no cadastro sai do calculo, mas continua na lista:
    // some-lo esconderia receita que existe.
    const ativo = cadastro?.ativo ?? false;
    const aliquotaInterna = cadastro?.aliquotaInterna ?? 0;
    const interestadual = aliquotaInterestadual(origem, uf);

    const diferenca =
      interna || !ativo ? 0 : Math.max(0, aliquotaInterna - interestadual);

    const valorDifal = recolheDifal ? (acumulado.receita * diferenca) / 100 : 0;

    if (interna) baseInterna += acumulado.receita;
    else baseInterestadual += acumulado.receita;

    total += valorDifal;
    if (!interna && ativo && !(cadastro?.confirmadoPeloContador ?? false)) {
      temEstadoNaoConfirmado = true;
    }

    porEstado.push({
      uf,
      nome: cadastro?.nome ?? nomeDoEstado(uf),
      pedidos: acumulado.pedidos,
      receita: acumulado.receita,
      aliquotaInterna,
      aliquotaInterestadual: interestadual,
      diferenca,
      difal: valorDifal,
      confirmado: cadastro?.confirmadoPeloContador ?? false,
      interna,
    });
  }

  const receitaTotal = baseInterestadual + baseInterna + receitaSemEstado;

  return {
    ufOrigem: origem,
    total,
    baseInterestadual,
    baseInterna,
    cargaSobreReceita: razaoSegura(total, receitaTotal),
    // Maior DIFAL primeiro; empate (zero) desempata pela receita.
    porEstado: porEstado.sort(
      (a, b) => b.difal - a.difal || b.receita - a.receita,
    ),
    receitaSemEstado,
    pedidosSemEstado,
    temEstadoNaoConfirmado,
  };
}

/** Soma dois resultados, para consolidar varias marcas numa visao so. */
export function somarDifal(
  resultados: ResultadoDifal[],
  ufOrigem: string,
): ResultadoDifal {
  if (resultados.length === 0) return VAZIO(ufOrigem);

  const porUF = new Map<string, LinhaEstado>();

  for (const resultado of resultados) {
    for (const linha of resultado.porEstado) {
      const atual = porUF.get(linha.uf);
      if (atual) {
        atual.pedidos += linha.pedidos;
        atual.receita += linha.receita;
        atual.difal += linha.difal;
        atual.confirmado = atual.confirmado && linha.confirmado;
      } else {
        porUF.set(linha.uf, { ...linha });
      }
    }
  }

  const total = resultados.reduce((s, r) => s + r.total, 0);
  const baseInterestadual = resultados.reduce((s, r) => s + r.baseInterestadual, 0);
  const baseInterna = resultados.reduce((s, r) => s + r.baseInterna, 0);
  const receitaSemEstado = resultados.reduce((s, r) => s + r.receitaSemEstado, 0);

  return {
    ufOrigem,
    total,
    baseInterestadual,
    baseInterna,
    cargaSobreReceita: razaoSegura(
      total,
      baseInterestadual + baseInterna + receitaSemEstado,
    ),
    porEstado: [...porUF.values()].sort(
      (a, b) => b.difal - a.difal || b.receita - a.receita,
    ),
    receitaSemEstado,
    pedidosSemEstado: resultados.reduce((s, r) => s + r.pedidosSemEstado, 0),
    temEstadoNaoConfirmado: resultados.some((r) => r.temEstadoNaoConfirmado),
  };
}
