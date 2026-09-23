import Link from "next/link";

import { moeda, moedaRedonda, percentual, razaoSegura } from "@/lib/format";
import type { DemonstrativoResultado as DRE } from "@/lib/costing";
import { INTERMEDIARIO_FRETE } from "@/lib/config";
import { fecharMes, type MesFechado } from "@/lib/fechamento";
import { idDeOrigem, type CategoriaDespesa } from "@/types/dominio";

import { BotaoResultado, Oculto, VALOR_OCULTO } from "./ResultadoOculto";

/*
 * O raio-x: de quanto foi pedido ate quanto realmente sobrou.
 *
 * Diferenca importante em relacao ao bloco de comissao: aqui a comissao vem
 * dos CONTRATOS CADASTRADOS, nao do percentual do simulador. Um e a realidade,
 * o outro e cenario -- misturar os dois confundiria a leitura.
 */

interface Linha {
  rotulo: string;
  explicacao: string;
  valor: number;
  tipo: "abertura" | "deducao" | "subtotal" | "resultado";
  /** Resultado negativo: a linha diz "prejuizo", em vermelho, com o valor sem sinal. */
  prejuizo?: boolean;
}

function montarLinhas(dre: DRE, fechado: MesFechado): Linha[] {
  const r = dre.reconciliacao;
  /*
   * As despesas vem em duas linhas, como vem em duas fatias na pizza: sem
   * isso o raio-x diria "despesas" num numero so e a pizza mostraria dois --
   * duas versoes da mesma verdade na mesma tela.
   *
   * Uma compartilhada chega aqui dividida em uma parte por influencer;
   * `idDeOrigem` faz as partes contarem como a despesa unica que foi
   * cadastrada.
   */
  const contarCategoria = (categoria: CategoriaDespesa) =>
    new Set(
      dre.despesasInfluencers.filter((d) => d.categoria === categoria).map(idDeOrigem),
    ).size;

  return [
    {
      rotulo: "Faturamento bruto",
      explicacao: "Soma de todos os pedidos criados no mes",
      valor: r.bruto,
      tipo: "abertura",
    },
    {
      rotulo: "Não pagos, cancelados e reembolsados",
      explicacao: "Pedidos que nunca viraram dinheiro em caixa",
      valor: -(r.naoPago + r.cancelado + r.reembolsado),
      tipo: "deducao",
    },
    {
      rotulo: "Recebido",
      explicacao: "Dinheiro que efetivamente entrou",
      valor: r.recebido,
      tipo: "subtotal",
    },
    {
      rotulo: "Frete das transportadoras",
      explicacao: "Cobrado do cliente junto com a venda e repassado à transportadora",
      valor: -r.freteTransportadora,
      tipo: "deducao",
    },
    // So aparece na loja que tem intermediario de frete (a demonstracao nao tem).
    ...(r.freteIntermediario > 0
      ? [
          {
            rotulo: INTERMEDIARIO_FRETE,
            explicacao: "Parte do frete cobrado do cliente que vai para a plataforma de frete, e não para a transportadora",
            valor: -r.freteIntermediario,
            tipo: "deducao" as const,
          },
        ]
      : []),
    {
      rotulo: "Receita real",
      explicacao: "O que sobra da venda dos produtos",
      valor: r.receitaReal,
      tipo: "subtotal",
    },
    {
      rotulo: "Impostos sobre a venda",
      explicacao: dre.impostos
        ? `${percentual(dre.impostos.cargaSobreReceita)} do faturado (com frete), apurado ` +
          `marca a marca em ${dre.impostos.porInfluencer.length} operacao(oes)`
        : "Nenhum imposto cadastrado ainda",
      valor: -dre.totalImpostos,
      tipo: "deducao",
    },
    {
      rotulo: "Taxas Nuvemshop, cartão e pix",
      explicacao: dre.taxasPlataforma
        ? `${percentual(dre.taxasPlataforma.cargaSobreRecebido)} do recebido, ` +
          `somando as taxas de ${dre.taxasPlataforma.porMetodo.filter((l) => l.total > 0).length} meio(s) de pagamento`
        : "Nenhuma taxa cadastrada ainda",
      valor: -dre.totalTaxasPlataforma,
      tipo: "deducao",
    },
    {
      rotulo: "Receita líquida",
      explicacao: "Depois dos impostos e das taxas da plataforma",
      valor: dre.receitaLiquida,
      tipo: "subtotal",
    },
    {
      rotulo: "Custo de fabricação",
      explicacao: "Matéria-prima, embalagem, mão de obra e custo indireto",
      valor: -dre.cmv.cmv,
      tipo: "deducao",
    },
    {
      rotulo: "Margem de contribuição",
      explicacao: `${percentual(dre.margemContribuicaoPercentual)} da receita real`,
      valor: dre.margemContribuicao,
      tipo: "subtotal",
    },
    {
      rotulo: "Comissões de influencers",
      explicacao: `${dre.comissoes.length} contrato(s) ativo(s) cadastrado(s)`,
      valor: -dre.totalComissoes,
      tipo: "deducao",
    },
    {
      rotulo: "Marketing",
      explicacao:
        contarCategoria("marketing") > 0
          ? `${contarCategoria("marketing")} despesa(s) de marketing no mês, incluindo as compartilhadas`
          : "Nenhuma despesa de marketing no mês",
      valor: -dre.totalDespesasMarketing,
      tipo: "deducao",
    },
    {
      rotulo: "Outras despesas com influencers",
      explicacao:
        contarCategoria("outros") > 0
          ? `${contarCategoria("outros")} despesa(s) no mês, incluindo as compartilhadas`
          : "Nenhuma outra despesa cadastrada no mês",
      valor: -dre.totalDespesasOutras,
      tipo: "deducao",
    },
    {
      rotulo: "Participação dos sócios",
      explicacao: `${dre.percentualParticipacaoSocios.toLocaleString("pt-BR")}% do valor recebido`,
      valor: -dre.participacaoSocios,
      tipo: "deducao",
    },
    /*
     * O fechamento do mes (5.1.3) nao reescreve as linhas de cima: elas sao o
     * calculado, e a receita real e a base da comissao. A diferenca para o
     * informado entra numa linha so, e o resultado bate com o da pizza.
     */
    ...(fechado.temInformado && Math.abs(fechado.ajuste) >= 0.005
      ? [
          {
            rotulo: "Ajuste do fechamento",
            explicacao: `Valores informados no fechamento (${(["impostos", "difal", "frete"] as const)
              .filter((c) => fechado.informado[c] !== null)
              .map((c) => ({ impostos: "impostos", difal: "DIFAL", frete: "frete" })[c])
              .join(", ")}) menos os calculados acima`,
            valor: -fechado.ajuste,
            tipo: "deducao" as const,
          },
        ]
      : []),
    fechado.lucroOperacional < 0
      ? {
          rotulo: "Prejuízo operacional",
          explicacao: `${percentual(Math.abs(fechado.margemOperacionalPercentual))} da receita real`,
          valor: Math.abs(fechado.lucroOperacional),
          tipo: "resultado",
          prejuizo: true,
        }
      : {
          rotulo: "Lucro operacional",
          explicacao: `${percentual(fechado.margemOperacionalPercentual)} da receita real`,
          valor: fechado.lucroOperacional,
          tipo: "resultado",
        },
  ];
}

export function DemonstrativoResultado({
  dre,
  fechado = fecharMes(dre, null),
}: {
  dre: DRE;
  fechado?: MesFechado;
}) {
  const linhas = montarLinhas(dre, fechado);

  return (
    <div className="space-y-5">
      {dre.cmv.cobertura < 1 && <AvisoCobertura dre={dre} />}

      <div className="overflow-hidden rounded-lg border border-borda">
        <table className="w-full border-collapse text-sm">
          <tbody>
            {linhas.map((linha) => {
              const resultado = linha.tipo === "resultado";
              const subtotal = linha.tipo === "subtotal";
              const corResultado = linha.prejuizo ? "text-naopago" : "text-real";

              const tr = (
                <tr
                  key={linha.rotulo}
                  className={`border-b border-borda last:border-b-0 ${
                    resultado
                      ? linha.prejuizo
                        ? "bg-alerta-fundo"
                        : "bg-real-claro"
                      : subtotal
                        ? "bg-fundo"
                        : "bg-superficie"
                  }`}
                >
                  <td className={`px-5 ${resultado ? "py-5" : "py-3.5"}`}>
                    <p
                      className={`font-semibold ${
                        resultado
                          ? `text-lg ${corResultado}`
                          : subtotal
                            ? "text-base text-tinta"
                            : "text-sm text-tinta-media"
                      }`}
                    >
                      {linha.rotulo}
                    </p>
                    <p className="mt-0.5 text-xs text-tinta-fraca">
                      {linha.explicacao}
                    </p>
                  </td>
                  <td
                    className={`numerico px-5 text-right font-semibold ${
                      resultado
                        ? `text-3xl xl:text-4xl ${corResultado}`
                        : subtotal
                          ? "text-xl text-tinta"
                          : "text-base text-tinta-media"
                    }`}
                  >
                    {moedaRedonda(linha.valor)}
                  </td>
                </tr>
              );
              if (!resultado) return tr;

              // Resultado oculto (5.1.5): sem valor, sem cor, sem "lucro"/"prejuizo".
              return (
                <Oculto
                  key={linha.rotulo}
                  mascara={
                    <tr className="bg-fundo">
                      <td className="px-5 py-5">
                        <p className="text-lg font-semibold text-tinta">Resultado operacional</p>
                        <BotaoResultado className="mt-1" />
                      </td>
                      <td className="numerico px-5 text-right text-3xl font-semibold text-tinta-media xl:text-4xl">
                        {VALOR_OCULTO}
                      </td>
                    </tr>
                  }
                >
                  {tr}
                </Oculto>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AvisoCobertura({ dre }: { dre: DRE }) {
  return (
    <div className="rounded-lg border border-alerta-borda bg-alerta-fundo px-5 py-4">
      <p className="text-sm font-semibold text-naopago">
        {dre.cmv.produtosSemCusto} produto(s) ainda sem custo de fabricação
        cadastrado
      </p>
      <p className="mt-1 text-sm leading-relaxed text-tinta-media">
        Eles respondem por{" "}
        <strong className="numerico font-semibold text-tinta">
          {moeda(dre.cmv.receitaSemCusto)}
        </strong>{" "}
        de receita no mês, ou{" "}
        <strong className="numerico font-semibold text-tinta">
          {percentual(
            razaoSegura(
              dre.cmv.receitaSemCusto,
              dre.cmv.receitaComCusto + dre.cmv.receitaSemCusto,
            ),
          )}
        </strong>{" "}
        do total vendido. Enquanto o custo deles não for informado, o lucro
        operacional acima está calculado sobre o restante.
      </p>
      <Link
        href="/custos"
        className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-tinta px-3.5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
      >
        Cadastrar os custos que faltam
      </Link>
    </div>
  );
}
