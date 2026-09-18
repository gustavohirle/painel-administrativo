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
 * 3. A base e o FATURADO: o valor de TODO pedido criado, com o frete cobrado
 *    do cliente, pago ou nao. Decisao do dono em 18/09/2026, a mesma dos
 *    demais tributos (5.1.1) -- DAS, PIS, COFINS, ICMS, IRPJ e CSLL usam esta
 *    base. Fora dela fica so a COMISSAO do influencer, que segue sobre o que
 *    cai na conta sem frete (5.1.2).
 *
 *    Isso inclui pedido cancelado e boleto nunca pago, que normalmente nao
 *    geram nota nem saida de mercadoria: o numero fica acima do devido nessa
 *    medida. A ressalva foi dita ao dono, que manteve a decisao.
 *
 * 4. A base e DUPLA: o imposto entra na propria base de calculo ("por
 *    dentro"). O painel nao fazia esse gross-up e por isso saia abaixo do
 *    devido; passou a fazer em 18/09/2026, quando o contador mandou o
 *    demonstrativo de agosto para AL e ele trouxe a conta inteira:
 *
 *      valor contabil  R$ 9.681,52
 *      base de calculo R$ 10.315,01   <- maior que o contabil: e o gross-up
 *      aliquota        19% (a nossa dizia 20%)
 *      DIFAL           R$ 722,05 = base x (19% - 12%)
 *
 *    A formula implementada e a da LC 190/2022:
 *
 *      ICMS origem = valor x aliquota interestadual
 *      base dupla  = (valor - ICMS origem) / (1 - aliquota interna)
 *      DIFAL       = base dupla x (interna - interestadual)
 *
 *    O ULTIMO passo segue o demonstrativo do contador, que aplica a DIFERENCA
 *    sobre a base dupla. A outra leitura corrente -- base x interna menos o
 *    ICMS de origem sobre o valor cheio -- daria mais, e nao e a dele.
 *
 *    RESIDUO CONHECIDO: com a mesma aliquota, a base dele saiu ~2% abaixo da
 *    nossa (fator 1,0654 contra 1,0864). Provavelmente o "valor contabil" do
 *    relatorio dele inclui coisa que nao entra na base do ICMS. O painel fica
 *    alguns pontos percentuais acima da apuracao oficial, e isso esta dito na
 *    tela -- antes ficava ~9% abaixo.
 */

import { paraNumero, type Pedido } from "@/types/nuvemshop";
import type { AliquotaEstado } from "@/types/fiscal";
import { aliquotaInterestadual, nomeDoEstado, normalizarUF } from "@/types/estados";
import { razaoSegura } from "@/lib/format";

export interface LinhaEstado {
  uf: string;
  nome: string;
  /** Quantos pedidos criados foram para este estado, pagos ou nao. */
  pedidos: number;
  /** Valor da operacao: o total dos pedidos criados, COM o frete. */
  base: number;
  /**
   * A base depois do gross-up -- o "Base de Calculo" do demonstrativo fiscal.
   * E sobre ela que a diferenca de aliquota incide. Igual a `base` na venda
   * interna e no estado desativado, onde nao ha DIFAL.
   */
  baseDupla: number;
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
  cargaSobreBase: number;
  /** Uma linha por estado de destino, maior primeiro. */
  porEstado: LinhaEstado[];
  /** Receita de pedidos sem estado identificado -- lacuna declarada. */
  baseSemEstado: number;
  pedidosSemEstado: number;
  /** `true` se algum estado usado ainda nao foi confirmado pelo contador. */
  temEstadoNaoConfirmado: boolean;
}

const VAZIO = (ufOrigem: string): ResultadoDifal => ({
  ufOrigem,
  total: 0,
  baseInterestadual: 0,
  baseInterna: 0,
  cargaSobreBase: 0,
  porEstado: [],
  baseSemEstado: 0,
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
  if (pedidos.length === 0) return VAZIO(ufOrigem);

  const porUF = new Map(aliquotas.map((a) => [a.uf.toUpperCase(), a]));
  const origem = ufOrigem.toUpperCase();

  interface Acumulado {
    pedidos: number;
    base: number;
  }
  const grupos = new Map<string, Acumulado>();

  let baseSemEstado = 0;
  let pedidosSemEstado = 0;

  for (const pedido of pedidos) {
    // O total do pedido, COM o frete, pago ou nao (regra 3 no topo).
    const valor = paraNumero(pedido.total);
    const uf = normalizarUF(pedido.shipping_address?.province);

    if (!uf) {
      baseSemEstado += valor;
      pedidosSemEstado += 1;
      continue;
    }

    const atual = grupos.get(uf);
    if (atual) {
      atual.pedidos += 1;
      atual.base += valor;
    } else {
      grupos.set(uf, { pedidos: 1, base: valor });
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

    /*
     * Base dupla: o ICMS entra na propria base (regra 4 no topo). Sem o
     * gross-up o valor sai abaixo do devido -- era assim ate 18/09/2026.
     *
     * Aliquota interna de 100% ou mais nao existe, mas um cadastro errado
     * dividiria por zero e produziria Infinity, que viraria um DIFAL absurdo
     * sem ninguem perceber. Nesse caso a base fica sem gross-up.
     */
    const podeGrossUp = aliquotaInterna > 0 && aliquotaInterna < 100;
    const icmsOrigem = (acumulado.base * interestadual) / 100;
    const baseDupla =
      interna || !ativo || !podeGrossUp
        ? acumulado.base
        : (acumulado.base - icmsOrigem) / (1 - aliquotaInterna / 100);

    const valorDifal = recolheDifal ? (baseDupla * diferenca) / 100 : 0;

    if (interna) baseInterna += acumulado.base;
    else baseInterestadual += acumulado.base;

    total += valorDifal;
    if (!interna && ativo && !(cadastro?.confirmadoPeloContador ?? false)) {
      temEstadoNaoConfirmado = true;
    }

    porEstado.push({
      uf,
      nome: cadastro?.nome ?? nomeDoEstado(uf),
      pedidos: acumulado.pedidos,
      base: acumulado.base,
      baseDupla,
      aliquotaInterna,
      aliquotaInterestadual: interestadual,
      diferenca,
      difal: valorDifal,
      confirmado: cadastro?.confirmadoPeloContador ?? false,
      interna,
    });
  }

  const baseTotal = baseInterestadual + baseInterna + baseSemEstado;

  return {
    ufOrigem: origem,
    total,
    baseInterestadual,
    baseInterna,
    cargaSobreBase: razaoSegura(total, baseTotal),
    // Alfabetica por UF, e nao pelo valor.
    //
    // Esta lista e DISCRIMINACAO, nao ranking: quem a le esta conferindo um
    // estado especifico contra a propria apuracao, e procurar "PE" numa lista
    // ordenada por valor obriga a varrer as 27 linhas toda vez. A ordem por
    // valor tambem mudava de um mes para o outro, entao a mesma UF aparecia
    // num lugar diferente a cada visita.
    //
    // Onde a ordem por valor e o proprio assunto -- o grafico "para quais
    // estados vai o DIFAL", que mostra os 12 maiores -- a componente ordena
    // por conta propria.
    porEstado: porEstado.sort((a, b) => a.uf.localeCompare(b.uf)),
    baseSemEstado,
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
        atual.base += linha.base;
        atual.baseDupla += linha.baseDupla;
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
  const baseSemEstado = resultados.reduce((s, r) => s + r.baseSemEstado, 0);

  return {
    ufOrigem,
    total,
    baseInterestadual,
    baseInterna,
    cargaSobreBase: razaoSegura(
      total,
      baseInterestadual + baseInterna + baseSemEstado,
    ),
    // Mesma ordem alfabetica da apuracao de uma marca: o consolidado e lido
    // do lado da lista de cada marca, e duas ordens diferentes na mesma tela
    // fariam procurar o estado duas vezes.
    porEstado: [...porUF.values()].sort((a, b) => a.uf.localeCompare(b.uf)),
    baseSemEstado,
    pedidosSemEstado: resultados.reduce((s, r) => s + r.pedidosSemEstado, 0),
    temEstadoNaoConfirmado: resultados.some((r) => r.temEstadoNaoConfirmado),
  };
}
