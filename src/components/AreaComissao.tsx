"use client";

import { useMemo, useState } from "react";

import { NumeroDestaque } from "@/components/Cartao";
import { moeda, moedaRedonda, percentual, razaoSegura } from "@/lib/format";
import type { LinhaMarca, Reconciliacao } from "@/lib/metrics";
import { compararComissao, LIMITE_ALERTA_NAO_PAGO } from "@/lib/metrics";

interface AreaComissaoProps {
  reconciliacao: Reconciliacao;
  marcas: LinhaMarca[];
  percentualInicial: number;
}

/*
 * O percentual e editavel de proposito: o contrato varia por marca e o cliente
 * vai querer testar cenarios na hora da reuniao.
 *
 * O recalculo acontece aqui no navegador porque comissao e uma multiplicacao
 * sobre numeros que o servidor ja entregou. Zero ida ao servidor, resposta
 * instantanea, e funciona sem internet.
 */
export function AreaComissao({
  reconciliacao,
  marcas,
  percentualInicial,
}: AreaComissaoProps) {
  const [pct, setPct] = useState(percentualInicial);

  const comparativo = useMemo(
    () => compararComissao(reconciliacao, pct),
    [reconciliacao, pct],
  );

  const linhas = useMemo(() => {
    const fracao = pct / 100;
    return marcas
      .map((m) => ({
        ...m,
        comissaoSobreBruto: m.bruto * fracao,
        comissaoSobreReal: m.receitaReal * fracao,
        diferenca: (m.bruto - m.receitaReal) * fracao,
      }))
      .sort((a, b) => b.diferenca - a.diferenca);
  }, [marcas, pct]);

  return (
    <div className="space-y-6">
      <ControlePercentual valor={pct} aoMudar={setPct} />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="rounded-lg border border-borda bg-fundo px-5 py-4">
          <NumeroDestaque
            rotulo={`Comissao sobre o bruto (${pct}%)`}
            valor={moedaRedonda(comparativo.comissaoSobreBruto)}
            apoio="Base usada hoje"
          />
        </div>
        <div className="rounded-lg border border-borda bg-fundo px-5 py-4">
          <NumeroDestaque
            rotulo={`Comissao sobre a receita real (${pct}%)`}
            valor={moedaRedonda(comparativo.comissaoSobreReal)}
            apoio="Base sobre o dinheiro que entrou"
            cor="var(--color-real)"
          />
        </div>
        <div className="rounded-lg border border-borda-forte bg-fundo px-5 py-4">
          <NumeroDestaque
            rotulo="Diferenca no mes"
            valor={moedaRedonda(comparativo.diferencaMensal)}
            apoio="Entre as duas bases de calculo"
            cor="var(--color-destaque)"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-borda-forte bg-tinta px-6 py-5 text-white">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-white/60">
            Projecao anual da diferenca
          </p>
          <p className="numerico mt-1 text-4xl font-semibold tracking-tight xl:text-5xl">
            {moedaRedonda(comparativo.projecaoAnual)}
          </p>
        </div>
        <p className="max-w-md text-sm leading-relaxed text-white/70">
          Diferenca mensal multiplicada por 12, mantendo o percentual de {pct}%.
          Serve para dimensionar a conversa sobre a base do contrato, nao como
          previsao de resultado.
        </p>
      </div>

      <TabelaMarcas linhas={linhas} pct={pct} />
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

function TabelaMarcas({ linhas, pct }: { linhas: LinhaMarca[]; pct: number }) {
  const totais = linhas.reduce(
    (acc, l) => ({
      bruto: acc.bruto + l.bruto,
      naoPago: acc.naoPago + l.naoPago,
      recebido: acc.recebido + l.recebido,
      receitaReal: acc.receitaReal + l.receitaReal,
      comissaoSobreBruto: acc.comissaoSobreBruto + l.comissaoSobreBruto,
      comissaoSobreReal: acc.comissaoSobreReal + l.comissaoSobreReal,
      diferenca: acc.diferenca + l.diferenca,
    }),
    {
      bruto: 0,
      naoPago: 0,
      recebido: 0,
      receitaReal: 0,
      comissaoSobreBruto: 0,
      comissaoSobreReal: 0,
      diferenca: 0,
    },
  );

  return (
    <div>
      <h3 className="mb-3 text-base font-semibold text-tinta">
        Por marca, com {pct}% de comissao
      </h3>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-borda-forte text-left text-xs uppercase tracking-wider text-tinta-fraca">
              <th className="py-2.5 pr-4 font-semibold">Marca</th>
              <th className="py-2.5 pr-4 text-right font-semibold">Bruto</th>
              <th className="py-2.5 pr-4 text-right font-semibold">Recebido</th>
              <th className="py-2.5 pr-4 text-right font-semibold">Nao pago</th>
              <th className="py-2.5 pr-4 text-right font-semibold">Receita real</th>
              <th className="py-2.5 pr-4 text-right font-semibold">Comissao s/ bruto</th>
              <th className="py-2.5 pr-4 text-right font-semibold">Comissao s/ real</th>
              <th className="py-2.5 text-right font-semibold">Diferenca</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr
                key={l.marca}
                className={`border-b border-borda ${l.alerta ? "bg-alerta-fundo" : ""}`}
              >
                <td className="py-3 pr-4 font-semibold text-tinta">
                  <span className="flex items-center gap-2">
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
                </td>
                <td className="numerico py-3 pr-4 text-right text-tinta-media">
                  {moeda(l.bruto)}
                </td>
                <td className="numerico py-3 pr-4 text-right text-tinta-media">
                  {moeda(l.recebido)}
                </td>
                <td
                  className={`numerico py-3 pr-4 text-right font-semibold ${
                    l.alerta ? "text-naopago" : "text-tinta-media"
                  }`}
                >
                  {percentual(l.taxaNaoPago)}
                </td>
                <td className="numerico py-3 pr-4 text-right font-semibold text-real">
                  {moeda(l.receitaReal)}
                </td>
                <td className="numerico py-3 pr-4 text-right text-tinta-media">
                  {moeda(l.comissaoSobreBruto)}
                </td>
                <td className="numerico py-3 pr-4 text-right text-tinta-media">
                  {moeda(l.comissaoSobreReal)}
                </td>
                <td className="numerico py-3 text-right font-semibold text-destaque">
                  {moeda(l.diferenca)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-borda-forte font-semibold text-tinta">
              <td className="py-3 pr-4">Total</td>
              <td className="numerico py-3 pr-4 text-right">{moeda(totais.bruto)}</td>
              <td className="numerico py-3 pr-4 text-right">{moeda(totais.recebido)}</td>
              <td className="numerico py-3 pr-4 text-right">
                {percentual(razaoSegura(totais.naoPago, totais.bruto))}
              </td>
              <td className="numerico py-3 pr-4 text-right text-real">
                {moeda(totais.receitaReal)}
              </td>
              <td className="numerico py-3 pr-4 text-right">
                {moeda(totais.comissaoSobreBruto)}
              </td>
              <td className="numerico py-3 pr-4 text-right">
                {moeda(totais.comissaoSobreReal)}
              </td>
              <td className="numerico py-3 text-right text-destaque">
                {moeda(totais.diferenca)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
