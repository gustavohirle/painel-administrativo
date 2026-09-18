"use client";

import { useState, type FormEvent } from "react";

import { Linha } from "@/components/SimuladorPreco";
import { lerReais, moeda, moedaCompacta, percentual } from "@/lib/format";
import {
  estimarInfluencer,
  regimeSugerido,
  type EstimativaInfluencer,
  type ReferenciaInfluencers,
  type RegimeSimulado,
} from "@/lib/simulacaoInfluencer";
import { ROTULO_REGIME, TETO_SIMPLES_NACIONAL } from "@/types/fiscal";

type EscolhaRegime = "automatico" | RegimeSimulado;

interface SimuladorInfluencerProps {
  /** `null` quando o mes nao teve venda paga. */
  referencia: ReferenciaInfluencers | null;
  /** "setembro de 2026" */
  rotuloMes: string;
}

interface Estimativa {
  pctTexto: string;
  faturamentoTexto: string;
  regime: EscolhaRegime;
  resultado: EstimativaInfluencer;
}

/**
 * Simulador de contrato de influencer (secao 5.17).
 *
 * Percentual e faturamento entram, a estimativa de lucro sai -- com os custos
 * medios das marcas atuais. Mesmo desenho do simulador de produto: o servidor
 * entrega a referencia pronta, o navegador so faz a conta no toque do botao, e
 * o resultado avisa quando os campos mudaram depois dele.
 */
export function SimuladorInfluencer({ referencia, rotuloMes }: SimuladorInfluencerProps) {
  const [pctTexto, setPctTexto] = useState("30");
  const [faturamentoTexto, setFaturamentoTexto] = useState("");
  const [regime, setRegime] = useState<EscolhaRegime>("automatico");
  const [erro, setErro] = useState("");
  const [estimativa, setEstimativa] = useState<Estimativa | null>(null);

  if (!referencia) {
    return (
      <p className="text-sm text-tinta-media">
        Nenhuma marca teve venda paga em {rotuloMes}. Sem vendas não há média de
        custos para estimar — escolha outro mês no alto da tela.
      </p>
    );
  }

  const faturamentoDigitado = lerReais(faturamentoTexto);
  const sugerido =
    faturamentoDigitado !== null && faturamentoDigitado > 0
      ? regimeSugerido(referencia, faturamentoDigitado)
      : null;

  function estimar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!referencia) return;

    const pct = lerReais(pctTexto);
    const faturamento = lerReais(faturamentoTexto);

    if (pct === null || pct < 0 || pct >= 100) {
      setErro("Informe o percentual de comissão, entre 0 e 99%.");
      return;
    }
    if (faturamento === null || faturamento <= 0) {
      setErro("Informe o faturamento esperado por mês, sem frete.");
      return;
    }

    setErro("");
    setEstimativa({
      pctTexto,
      faturamentoTexto,
      regime,
      resultado: estimarInfluencer(referencia, {
        percentual: pct,
        faturamento,
        regime: regime === "automatico" ? regimeSugerido(referencia, faturamento) : regime,
      }),
    });
  }

  const desatualizada =
    estimativa !== null &&
    (estimativa.pctTexto !== pctTexto ||
      estimativa.faturamentoTexto !== faturamentoTexto ||
      estimativa.regime !== regime);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <form onSubmit={estimar} className="space-y-4" noValidate>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-tinta">
            Percentual de comissão (%)
          </span>
          <input
            name="percentual"
            inputMode="decimal"
            autoComplete="off"
            value={pctTexto}
            onChange={(e) => setPctTexto(e.target.value)}
            placeholder="30"
            className="w-full rounded-lg border border-borda-forte px-3 py-2.5 text-right text-lg"
          />
          <span className="mt-1 block text-xs text-tinta-fraca">
            Sobre o que cai na conta, sem frete: a receita menos as taxas da
            Nuvemshop e do pagamento.
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-tinta">
            Faturamento esperado por mês, sem frete (R$)
          </span>
          <input
            name="faturamento"
            inputMode="decimal"
            autoComplete="off"
            value={faturamentoTexto}
            onChange={(e) => setFaturamentoTexto(e.target.value)}
            placeholder="0,00"
            className="w-full rounded-lg border border-borda-forte px-3 py-2.5 text-right text-lg"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-tinta">Regime tributário</span>
          <select
            name="regime"
            value={regime}
            onChange={(e) => setRegime(e.target.value as EscolhaRegime)}
            className="w-full rounded-lg border border-borda-forte bg-superficie px-3 py-2.5 text-base text-tinta"
          >
            <option value="automatico">
              Automático pelo porte{sugerido ? ` (${ROTULO_REGIME[sugerido]})` : ""}
            </option>
            <option value="simples_nacional">{ROTULO_REGIME.simples_nacional}</option>
            <option value="lucro_presumido">{ROTULO_REGIME.lucro_presumido}</option>
          </select>
          <span className="mt-1 block text-xs text-tinta-fraca">
            Até {moedaCompacta(TETO_SIMPLES_NACIONAL)} de receita sem frete em 12 meses cabe no
            Simples Nacional.
          </span>
        </label>

        <button
          type="submit"
          className="w-full rounded-lg bg-tinta px-4 py-3 text-base font-semibold text-white"
        >
          Estimar
        </button>

        {erro && (
          <p role="alert" className="text-sm font-medium text-naopago">
            {erro}
          </p>
        )}
      </form>

      <div aria-live="polite" className="min-w-0">
        {estimativa ? (
          <ResultadoInfluencer
            referencia={referencia}
            resultado={estimativa.resultado}
            rotuloMes={rotuloMes}
            desatualizada={desatualizada}
          />
        ) : (
          <div className="rounded-xl border border-dashed border-borda-forte px-5 py-8 text-sm text-tinta-media">
            Informe o percentual e o faturamento esperado, sem frete, e toque em{" "}
            <strong className="text-tinta">Estimar</strong>. O resultado mostra
            quanto sobra por mês depois de impostos, taxa, fabricação,
            comissão, da parte dele no operacional e da participação dos sócios — e a maior comissão que
            ainda não dá prejuízo.
          </div>
        )}
      </div>
    </div>
  );
}

function ResultadoInfluencer({
  referencia,
  resultado: e,
  rotuloMes,
  desatualizada,
}: {
  referencia: ReferenciaInfluencers;
  resultado: EstimativaInfluencer;
  rotuloMes: string;
  desatualizada: boolean;
}) {
  const empate = Math.abs(e.lucro) < 0.5;
  const ganha = !empate && e.lucro > 0;
  const cor = empate
    ? "var(--color-tinta)"
    : ganha
      ? "var(--color-real)"
      : "var(--color-naopago)";

  const sobreBruto = (valor: number) => percentual(e.bruto ? valor / e.bruto : 0);
  const simples = e.regime === "simples_nacional";

  const detalheImpostos = simples
    ? `Guia do Simples: alíquota efetiva de ${percentual(e.aliquotaImpostos, 2)} para ${moedaCompacta(e.rbt12Projetado)} de faturamento por ano, com frete`
    : e.semReferenciaDoRegime
      ? `Nenhuma marca atual no Lucro Presumido: usada a carga média da empresa, ${percentual(referencia.cargaGeral)}`
      : `Média de ${percentual(referencia.presumido!.cargaImpostos)} do faturado, com frete, nas ${referencia.presumido!.marcas} marcas do Lucro Presumido`;

  const detalheDifal = simples
    ? "Marca no Simples Nacional não recolhe DIFAL como remetente"
    : e.semReferenciaDoRegime
      ? "Já dentro da carga média da empresa"
      : `Média de ${percentual(referencia.presumido!.cargaDifal, 2)} do faturado, com frete, nas marcas do Lucro Presumido`;

  return (
    <div className={`space-y-4 ${desatualizada ? "opacity-60" : ""}`}>
      {desatualizada && (
        <p className="rounded-lg border border-alerta-borda bg-alerta-fundo px-3 py-2 text-sm text-naopago">
          Você mudou os campos depois desta estimativa. Toque em Estimar para atualizar.
        </p>
      )}

      {e.acimaDoTetoSimples && (
        <p className="rounded-lg border border-alerta-borda bg-alerta-fundo px-3 py-2 text-sm text-naopago">
          Com {moedaCompacta(e.rbt12Projetado)} de receita por ano, esta operação passa do
          teto do Simples Nacional ({moedaCompacta(TETO_SIMPLES_NACIONAL)}) e iria para o
          Lucro Presumido. O imposto abaixo usa a última faixa do Simples só como referência.
        </p>
      )}

      <div className="rounded-xl border-2 px-5 py-4" style={{ borderColor: cor }}>
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: cor }}>
          {empate ? "Empata" : ganha ? "Dá lucro" : "Dá prejuízo"}
        </p>
        <p
          className="numerico mt-1 text-4xl font-semibold tracking-tight xl:text-5xl"
          style={{ color: cor }}
        >
          {moeda(e.lucro)}
        </p>
        <p className="mt-1 text-sm text-tinta-media">
          de lucro operacional estimado por mês — margem de {percentual(e.margem)} da receita
          real. A operação atual está em {percentual(referencia.margemAtual)}.
        </p>
        <p className="mt-1 text-sm text-tinta-media">Em 12 meses: {moeda(e.lucroAnual)}.</p>
        <p className="mt-3 border-t border-borda pt-3 text-sm text-tinta">
          {e.comissaoMaximaSemPrejuizo !== null ? (
            <>
              Comissão máxima sem prejuízo:{" "}
              <strong className="numerico">
                {e.comissaoMaximaSemPrejuizo.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
              </strong>{" "}
              sobre o que cai na conta, sem frete
            </>
          ) : (
            <>Nem sem comissão esta operação dá lucro com os custos atuais.</>
          )}
        </p>
      </div>

      <div className="rounded-xl border border-borda">
        <Linha rotulo="Faturamento sem frete" valor={e.bruto} percentualTexto="100%" forte />
        <Linha
          rotulo="Não pagos, cancelados e reembolsados"
          detalhe={`Média das marcas atuais: ${percentual(1 - referencia.fracaoReceitaReal)} do faturamento não vira dinheiro`}
          valor={-e.naoEntrou}
          percentualTexto={sobreBruto(e.naoEntrou)}
          marcador="var(--color-naopago)"
        />
        <Linha rotulo="Receita real" valor={e.receitaReal} percentualTexto={sobreBruto(e.receitaReal)} forte />
        <Linha
          rotulo={`Impostos (${ROTULO_REGIME[e.regime]})`}
          detalhe={detalheImpostos}
          valor={-e.impostos}
          percentualTexto={sobreBruto(e.impostos)}
          marcador="var(--color-imposto)"
        />
        <Linha
          rotulo="DIFAL"
          detalhe={detalheDifal}
          valor={-e.difal}
          percentualTexto={sobreBruto(e.difal)}
          marcador="var(--color-difal)"
        />
        <Linha
          rotulo="Taxa da plataforma e do pagamento"
          detalhe={`Média de ${percentual(referencia.cargaTaxas)} do valor pago com frete (${moeda(e.recebido)})`}
          valor={-e.taxas}
          percentualTexto={sobreBruto(e.taxas)}
          marcador="var(--color-taxa)"
        />
        <Linha
          rotulo="Custo de fabricação"
          detalhe={`Média de ${percentual(referencia.cmvSobreReceitaReal)} da receita real. ${percentual(referencia.coberturaCusto, 0)} das vendas têm ficha de custo; o resto foi estimado pela mesma proporção`}
          valor={-e.cmv}
          percentualTexto={sobreBruto(e.cmv)}
          marcador="var(--color-custo)"
        />
        <Linha
          rotulo="Comissão do influencer"
          detalhe={`${e.percentual.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% sobre o que cai na conta, sem frete (${moeda(e.baseComissao)})`}
          valor={-e.comissao}
          percentualTexto={sobreBruto(e.comissao)}
          marcador="var(--color-comissao)"
        />
        {referencia.despesasCompartilhadas > 0 && (
          <Linha
            rotulo="Parte nas despesas compartilhadas"
            detalhe={`${moeda(referencia.despesasCompartilhadas)} do mês, divididos com as ${referencia.marcas} marcas atuais pelo faturamento sem frete`}
            valor={-e.parteCompartilhada}
            percentualTexto={sobreBruto(e.parteCompartilhada)}
            marcador="var(--color-comissao)"
          />
        )}
        {e.socios > 0 && (
          <Linha
            rotulo="Participação dos sócios"
            detalhe={`${e.percentualSocios.toLocaleString("pt-BR")}% do valor pago com frete (${moeda(e.recebido)})`}
            valor={-e.socios}
            percentualTexto={sobreBruto(e.socios)}
            marcador="var(--color-socios)"
          />
        )}
        <Linha
          rotulo={empate ? "Resultado" : ganha ? "Lucro operacional" : "Prejuízo operacional"}
          valor={e.lucro}
          percentualTexto={sobreBruto(e.lucro)}
          forte
          cor={cor}
        />
      </div>

      <p className="text-xs text-tinta-fraca">
        Estimativa com as médias de {rotuloMes} das {referencia.marcas} marcas atuais — não
        é previsão. Um influencer com público diferente (mais boleto, ticket mais baixo)
        muda o quanto do faturamento vira dinheiro, e o custo de fabricação depende do mix
        de produtos. Percentuais à direita são sobre o faturamento sem frete. Além dele, o
        cliente paga cerca de {moeda(e.frete)} de frete por mês à parte, que vai para a
        transportadora e não entra em imposto, comissão nem custo.
        {(referencia.impostosNaoConfirmados || referencia.taxasNaoConfirmadas) &&
          " Parte das alíquotas e taxas usadas ainda não foi confirmada pelo contador ou pela fatura."}
      </p>
    </div>
  );
}
