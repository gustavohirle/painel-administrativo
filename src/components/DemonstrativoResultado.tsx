import Link from "next/link";

import { moeda, moedaRedonda, percentual, razaoSegura } from "@/lib/format";
import type { DemonstrativoResultado as DRE } from "@/lib/costing";

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
}

function montarLinhas(dre: DRE): Linha[] {
  const r = dre.reconciliacao;

  return [
    {
      rotulo: "Faturamento bruto",
      explicacao: "Soma de todos os pedidos criados no mes",
      valor: r.bruto,
      tipo: "abertura",
    },
    {
      rotulo: "Nao pagos, cancelados e reembolsados",
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
      rotulo: "Frete cobrado do cliente",
      explicacao: "Entrou junto com a venda, mas nao e receita de produto",
      valor: -r.frete,
      tipo: "deducao",
    },
    {
      rotulo: "Receita real",
      explicacao: "O que sobra da venda dos produtos",
      valor: r.receitaReal,
      tipo: "subtotal",
    },
    {
      rotulo: "Impostos sobre a venda",
      explicacao: dre.impostos
        ? `${percentual(dre.impostos.cargaSobreReceita)} do recebido${
            dre.impostos.simples
              ? `, guia unica a ${percentual(dre.impostos.simples.aliquotaEfetiva / 100)}`
              : ""
          }`
        : "Nenhum imposto cadastrado ainda",
      valor: -dre.totalImpostos,
      tipo: "deducao",
    },
    {
      rotulo: "Receita liquida",
      explicacao: "Depois dos impostos sobre a venda",
      valor: dre.receitaLiquida,
      tipo: "subtotal",
    },
    {
      rotulo: "Custo de fabricacao",
      explicacao: "Materia-prima, embalagem, mao de obra e custo indireto",
      valor: -dre.cmv.cmv,
      tipo: "deducao",
    },
    {
      rotulo: "Margem de contribuicao",
      explicacao: `${percentual(dre.margemContribuicaoPercentual)} da receita real`,
      valor: dre.margemContribuicao,
      tipo: "subtotal",
    },
    {
      rotulo: "Comissoes de influencers",
      explicacao: `${dre.comissoes.length} contrato(s) ativo(s) cadastrado(s)`,
      valor: -dre.totalComissoes,
      tipo: "deducao",
    },
    {
      rotulo: "Lucro operacional",
      explicacao: `${percentual(dre.margemOperacionalPercentual)} da receita real`,
      valor: dre.lucroOperacional,
      tipo: "resultado",
    },
  ];
}

export function DemonstrativoResultado({ dre }: { dre: DRE }) {
  const linhas = montarLinhas(dre);

  return (
    <div className="space-y-5">
      {dre.cmv.cobertura < 1 && <AvisoCobertura dre={dre} />}

      <div className="overflow-hidden rounded-lg border border-borda">
        <table className="w-full border-collapse text-sm">
          <tbody>
            {linhas.map((linha) => {
              const resultado = linha.tipo === "resultado";
              const subtotal = linha.tipo === "subtotal";

              return (
                <tr
                  key={linha.rotulo}
                  className={`border-b border-borda last:border-b-0 ${
                    resultado
                      ? "bg-real-claro"
                      : subtotal
                        ? "bg-fundo"
                        : "bg-superficie"
                  }`}
                >
                  <td className={`px-5 ${resultado ? "py-5" : "py-3.5"}`}>
                    <p
                      className={`font-semibold ${
                        resultado
                          ? "text-lg text-real"
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
                        ? "text-3xl text-real xl:text-4xl"
                        : subtotal
                          ? "text-xl text-tinta"
                          : "text-base text-tinta-media"
                    }`}
                  >
                    {moedaRedonda(linha.valor)}
                  </td>
                </tr>
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
        {dre.cmv.produtosSemCusto} produto(s) ainda sem custo de fabricacao
        cadastrado
      </p>
      <p className="mt-1 text-sm leading-relaxed text-tinta-media">
        Eles respondem por{" "}
        <strong className="numerico font-semibold text-tinta">
          {moeda(dre.cmv.receitaSemCusto)}
        </strong>{" "}
        de receita no mes, ou{" "}
        <strong className="numerico font-semibold text-tinta">
          {percentual(
            razaoSegura(
              dre.cmv.receitaSemCusto,
              dre.cmv.receitaComCusto + dre.cmv.receitaSemCusto,
            ),
          )}
        </strong>{" "}
        do total vendido. Enquanto o custo deles nao for informado, o lucro
        operacional acima esta calculado sobre o restante.
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
