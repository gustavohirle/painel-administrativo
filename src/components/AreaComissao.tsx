"use client";

import { useMemo, useState } from "react";

import { NumeroDestaque } from "@/components/Cartao";
import { moeda, moedaRedonda, percentual, razaoSegura } from "@/lib/format";
import {
  aplicarPercentualNosContratos,
  somarComissoesDeContratos,
  type LinhaComissaoContrato,
  type MarcaComContrato,
  type TotalComissaoContratos,
} from "@/lib/costing";
import { LIMITE_ALERTA_NAO_PAGO } from "@/lib/metrics";
import { EXPLICACAO_BASE, ROTULO_BASE } from "@/types/dominio";

interface AreaComissaoProps {
  marcas: MarcaComContrato[];
  percentualInicial: number;
}

/*
 * Simulador da base de comissao.
 *
 * Duas decisoes que mudam o que a tela mostra:
 *
 * 1. A BASE e sempre a do contrato daquele influencer. Exibir a comissao sobre
 *    a receita real de quem tem contrato sobre o bruto seria um numero que nao
 *    existe em lugar nenhum -- ninguem paga e ninguem recebe aquilo.
 * 2. O PERCENTUAL, esse sim, e editavel (seccao 5.2): o cliente vai querer
 *    testar cenarios na reuniao. Quando ele foge do contrato cadastrado, a
 *    linha avisa.
 *
 * O recalculo acontece no navegador porque comissao e uma multiplicacao sobre
 * numeros que o servidor ja entregou. Resposta instantanea, sem internet.
 */
export function AreaComissao({ marcas, percentualInicial }: AreaComissaoProps) {
  const [pct, setPct] = useState(percentualInicial);

  const linhas = useMemo(
    () => aplicarPercentualNosContratos(marcas, pct),
    [marcas, pct],
  );
  const total = useMemo(() => somarComissoesDeContratos(linhas), [linhas]);

  return (
    <div className="space-y-6">
      <ControlePercentual valor={pct} aoMudar={setPct} />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="rounded-lg border border-borda bg-fundo px-5 py-4">
          <NumeroDestaque
            rotulo={`Comissao pelos contratos (${pct}%)`}
            valor={moedaRedonda(total.comissao)}
            apoio="Cada marca na base do proprio contrato"
          />
        </div>
        <div className="rounded-lg border border-borda bg-fundo px-5 py-4">
          <NumeroDestaque
            rotulo={`Se todas fossem sobre a receita real (${pct}%)`}
            valor={moedaRedonda(total.comissaoSeSobreReceitaReal)}
            apoio="Sobre o dinheiro que entrou, ja sem o frete"
            cor="var(--color-real)"
          />
        </div>
        <div className="rounded-lg border border-borda-forte bg-fundo px-5 py-4">
          <NumeroDestaque
            rotulo="Diferenca no mes"
            valor={moedaRedonda(total.aMaisQueSobreReceitaReal)}
            apoio="Entre os dois numeros ao lado"
            cor="var(--color-destaque)"
          />
        </div>
      </div>

      <ExplicacaoDiferenca />

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-borda-forte bg-tinta px-6 py-5 text-white">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-white/60">
            Projecao anual da diferenca
          </p>
          <p className="numerico mt-1 text-4xl font-semibold tracking-tight xl:text-5xl">
            {moedaRedonda(total.projecaoAnual)}
          </p>
        </div>
        <p className="max-w-md text-sm leading-relaxed text-white/70">
          Diferenca mensal multiplicada por 12, mantendo o percentual de {pct}%.
          Serve para dimensionar a conversa sobre a base do contrato, nao como
          previsao de resultado.
        </p>
      </div>

      <TabelaMarcas linhas={linhas} total={total} pct={pct} />
    </div>
  );
}

// ---------------------------------------------------------------------------

/*
 * "Diferenca" sozinha nao diz nada -- o cliente perguntou o que era. A conta
 * inteira cabe em tres frases, e o fecho e deliberadamente neutro: o contrato
 * pode legitimamente prever comissao sobre o bruto (seccao 8 do CLAUDE.md).
 */
function ExplicacaoDiferenca() {
  return (
    <div className="rounded-lg border border-borda bg-fundo px-5 py-4">
      <p className="text-sm font-semibold text-tinta">O que e essa diferenca</p>
      <p className="mt-1.5 max-w-4xl text-sm leading-relaxed text-tinta-media">
        Cada contrato escolhe uma base de calculo. Quando a base e o faturamento{" "}
        <strong className="text-tinta">bruto</strong>, a comissao incide tambem
        sobre pedido cancelado, pedido reembolsado, boleto que nunca foi pago e
        o frete: valores que entram na conta da comissao, mas nao entraram no
        caixa. A diferenca e o tamanho disso no mes, ou seja,{" "}
        <strong className="text-tinta">
          a comissao na base do contrato menos a mesma comissao calculada sobre
          a receita real
        </strong>
        . Nao e erro de contrato -- e o que esta em jogo na escolha da base.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ControlePercentual({
  valor,
  aoMudar,
}: {
  valor: number;
  aoMudar: (v: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border border-borda bg-fundo px-5 py-4">
      <label
        htmlFor="percentual-comissao"
        className="text-sm font-semibold text-tinta"
      >
        Percentual de comissao
      </label>

      <input
        id="percentual-comissao"
        type="range"
        min={0}
        max={60}
        step={0.5}
        value={valor}
        onChange={(e) => aoMudar(Number(e.target.value))}
        className="h-2 min-w-[220px] flex-1 cursor-pointer accent-[var(--color-destaque)]"
      />

      <div className="flex items-center gap-2">
        <input
          type="number"
          min={0}
          max={100}
          step={0.5}
          value={valor}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) aoMudar(Math.min(100, Math.max(0, n)));
          }}
          className="numerico w-24 rounded-lg border border-borda-forte bg-superficie px-3 py-2 text-right text-lg font-semibold text-tinta"
        />
        <span className="text-lg font-semibold text-tinta-media">%</span>
      </div>

      <div className="flex gap-2">
        {[10, 20, 25, 30].map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => aoMudar(v)}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
              valor === v
                ? "border-tinta bg-tinta text-white"
                : "border-borda-forte bg-superficie text-tinta-media hover:text-tinta"
            }`}
          >
            {v}%
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Realce da coluna sobre a qual o percentual daquela linha incide. */
function celulaBase(ehBase: boolean) {
  return ehBase
    ? "bg-superficie font-semibold text-tinta ring-1 ring-inset ring-borda-forte"
    : "text-tinta-media";
}

/** Traco no lugar de zero: o contrato ja e sobre a receita real. */
function SemComparacao() {
  return (
    <span
      className="text-tinta-fraca"
      title="O contrato desta marca ja e sobre a receita real, entao nao ha duas bases para comparar."
    >
      &mdash;
    </span>
  );
}

function TabelaMarcas({
  linhas,
  total,
  pct,
}: {
  linhas: LinhaComissaoContrato[];
  total: TotalComissaoContratos;
  pct: number;
}) {
  return (
    <div>
      <h3 className="mb-1 text-base font-semibold text-tinta">
        Por marca, com {pct}% de comissao
      </h3>
      <p className="mb-3 text-sm text-tinta-media">
        A celula destacada em cada linha e a base sobre a qual o percentual
        daquela marca incide.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-borda-forte text-left text-xs uppercase tracking-wider text-tinta-fraca">
              <th className="py-2.5 pr-4 font-semibold">Marca</th>
              <th className="py-2.5 pr-4 font-semibold">Base do contrato</th>
              <th className="py-2.5 pr-4 text-right font-semibold">Bruto</th>
              <th className="py-2.5 pr-4 text-right font-semibold">Recebido</th>
              <th className="py-2.5 pr-4 text-right font-semibold">Nao pago</th>
              <th className="py-2.5 pr-4 text-right font-semibold">
                Receita real
              </th>
              <th className="py-2.5 pr-4 text-right font-semibold">Comissao</th>
              <th className="py-2.5 pr-4 text-right font-semibold">
                Se fosse sobre a receita real
              </th>
              <th
                className="py-2.5 text-right font-semibold"
                title="Comissao na base do contrato menos a mesma comissao sobre a receita real."
              >
                Diferenca
              </th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              // Contrato ja sobre a receita real: nao ha duas bases para
              // comparar, e um zero ali pareceria um valor calculado.
              const jaSobreReal = l.baseComissao === "receitaReal";

              return (
                <tr
                  key={l.marca}
                  className={`border-b border-borda ${l.alerta ? "bg-alerta-fundo" : ""}`}
                >
                  <td className="py-3 pr-4">
                    <span className="flex items-center gap-2 font-semibold text-tinta">
                      {l.marca}
                      {l.alerta && (
                        <span
                          title={`Mais de ${percentual(LIMITE_ALERTA_NAO_PAGO, 0)} do faturamento desta marca nao foi pago.`}
                          className="rounded-full border border-alerta-borda bg-superficie px-2 py-0.5 text-[11px] font-semibold text-naopago"
                        >
                          atencao
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs text-tinta-fraca">
                      {l.influencerNome ?? "Sem influencer vinculado"}
                      {l.percentualContrato !== null &&
                        l.percentualContrato !== pct && (
                          <>
                            {" — contrato: "}
                            <span className="numerico">
                              {l.percentualContrato}%
                            </span>
                          </>
                        )}
                    </span>
                  </td>

                  <td className="py-3 pr-4">
                    <span
                      title={EXPLICACAO_BASE[l.baseComissao]}
                      className="inline-block rounded-md border border-borda-forte bg-superficie px-2 py-0.5 text-xs font-semibold text-tinta-media"
                    >
                      {ROTULO_BASE[l.baseComissao]}
                    </span>
                  </td>

                  <td
                    className={`numerico py-3 pr-4 text-right ${celulaBase(
                      l.baseComissao === "bruto",
                    )}`}
                  >
                    {moeda(l.bruto)}
                  </td>
                  <td
                    className={`numerico py-3 pr-4 text-right ${celulaBase(
                      l.baseComissao === "recebido",
                    )}`}
                  >
                    {moeda(l.recebido)}
                  </td>
                  <td
                    className={`numerico py-3 pr-4 text-right font-semibold ${
                      l.alerta ? "text-naopago" : "text-tinta-media"
                    }`}
                  >
                    {percentual(l.taxaNaoPago)}
                  </td>
                  <td
                    className={`numerico py-3 pr-4 text-right ${
                      jaSobreReal ? celulaBase(true) : "font-semibold text-real"
                    }`}
                  >
                    {moeda(l.receitaReal)}
                  </td>

                  <td className="numerico py-3 pr-4 text-right text-base font-semibold text-tinta">
                    {moeda(l.comissao)}
                  </td>
                  <td className="numerico py-3 pr-4 text-right text-tinta-media">
                    {jaSobreReal ? (
                      <SemComparacao />
                    ) : (
                      moeda(l.comissaoSeSobreReceitaReal)
                    )}
                  </td>
                  <td className="numerico py-3 text-right font-semibold text-destaque">
                    {jaSobreReal ? (
                      <SemComparacao />
                    ) : (
                      moeda(l.aMaisQueSobreReceitaReal)
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-borda-forte font-semibold text-tinta">
              <td className="py-3 pr-4">Total</td>
              <td className="py-3 pr-4" />
              <td className="numerico py-3 pr-4 text-right">
                {moeda(total.bruto)}
              </td>
              <td className="numerico py-3 pr-4 text-right">
                {moeda(total.recebido)}
              </td>
              <td className="numerico py-3 pr-4 text-right">
                {percentual(razaoSegura(total.naoPago, total.bruto))}
              </td>
              <td className="numerico py-3 pr-4 text-right text-real">
                {moeda(total.receitaReal)}
              </td>
              <td className="numerico py-3 pr-4 text-right">
                {moeda(total.comissao)}
              </td>
              <td className="numerico py-3 pr-4 text-right">
                {moeda(total.comissaoSeSobreReceitaReal)}
              </td>
              <td className="numerico py-3 text-right text-destaque">
                {moeda(total.aMaisQueSobreReceitaReal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
