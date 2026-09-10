import Link from "next/link";

import { inteiro, moeda, moedaRedonda, percentual, razaoSegura } from "@/lib/format";
import {
  linhasConsolidadas,
  type ApuracaoDeUmInfluencer,
  type ResultadoImpostos,
} from "@/lib/impostos";
import { tetoEmAlerta } from "@/lib/simplesNacional";
import type { RegimeTributario } from "@/types/fiscal";

const ROTULO_REGIME: Record<RegimeTributario, string> = {
  simples_nacional: "Simples Nacional",
  lucro_presumido: "Lucro Presumido",
  lucro_real: "Lucro Real",
};

/*
 * Para onde vai o imposto.
 *
 * A apuracao e por influencer porque cada marca e uma operacao separada, com
 * regime proprio: consolidar tudo num regime so daria um numero que nao
 * corresponde a nenhuma das marcas.
 */
export function CargaTributaria({
  resultado,
}: {
  resultado: ResultadoImpostos;
}) {
  const consolidado = linhasConsolidadas(resultado);
  const maiorFatia = Math.max(...consolidado.map((l) => l.valor), 1);

  const regimesEmUso = [
    ...new Set(resultado.porInfluencer.map((a) => a.regime)),
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="rounded-lg border border-borda bg-fundo px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-tinta-fraca">
            Imposto no mes
          </p>
          <p className="numerico mt-1 text-3xl font-semibold text-tinta">
            {moedaRedonda(resultado.totalSobreVenda)}
          </p>
          <p className="mt-1 text-sm text-tinta-media">
            {percentual(resultado.cargaSobreReceita)} do que foi recebido
          </p>
        </div>

        <div className="rounded-lg border border-borda bg-fundo px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-tinta-fraca">
            Operacoes apuradas
          </p>
          <p className="numerico mt-1 text-3xl font-semibold text-tinta">
            {inteiro(resultado.porInfluencer.length)}
          </p>
          <p className="mt-1 text-sm text-tinta-media">
            {regimesEmUso.map((r) => ROTULO_REGIME[r]).join(" e ")}
          </p>
        </div>

        <div className="rounded-lg border border-borda bg-fundo px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-tinta-fraca">
            Receita tributada
          </p>
          <p className="numerico mt-1 text-3xl font-semibold text-tinta">
            {moedaRedonda(resultado.baseReceita)}
          </p>
          <p className="mt-1 text-sm text-tinta-media">
            Somente o que entrou em caixa
          </p>
        </div>
      </div>

      {resultado.temTributoDoRegimeInativo && (
        <div className="rounded-lg border border-alerta-borda bg-alerta-fundo px-5 py-4">
          <p className="text-sm font-semibold text-naopago">
            Ha tributo do regime fora desta conta
          </p>
          <p className="mt-1 max-w-4xl text-sm leading-relaxed text-tinta-media">
            Alguns tributos que incidem nestes regimes estao sem aliquota
            informada, e por isso nao entram no total acima. Eles aparecem
            listados em cada operacao abaixo. O imposto real e maior que o
            exibido enquanto isso nao for preenchido.
          </p>
        </div>
      )}

      {consolidado.length > 0 && (
        <div>
          <h3 className="mb-3 text-base font-semibold text-tinta">
            O que e recolhido, somando todas as marcas
          </h3>
          <div className="space-y-2.5">
            {consolidado.map((linha) => (
              <div key={linha.impostoId} className="flex items-center gap-4">
                <span className="w-28 shrink-0 text-sm font-semibold text-tinta">
                  {linha.sigla}
                </span>
                <div className="h-7 flex-1 overflow-hidden rounded bg-fundo">
                  <div
                    className="h-full rounded bg-bruto"
                    style={{ width: `${(linha.valor / maiorFatia) * 100}%` }}
                  />
                </div>
                <span className="numerico w-36 shrink-0 text-right text-sm font-semibold text-tinta">
                  {moeda(linha.valor)}
                </span>
                <span className="numerico w-20 shrink-0 text-right text-sm text-tinta-media">
                  {percentual(razaoSegura(linha.valor, resultado.baseReceita))}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="mb-1 text-base font-semibold text-tinta">
          Marca a marca
        </h3>
        <p className="mb-4 text-sm text-tinta-media">
          Cada influencer tem a sua operacao e o seu regime. O enquadramento e
          editado no cadastro de comissoes.
        </p>

        <div className="space-y-4">
          {resultado.porInfluencer.map((apuracao) => (
            <CartaoDaOperacao key={apuracao.marca} apuracao={apuracao} />
          ))}
        </div>
      </div>

      {resultado.produtosSemCadastro > 0 && (
        <div className="rounded-lg border border-alerta-borda bg-alerta-fundo px-5 py-4">
          <p className="text-sm font-semibold text-naopago">
            {resultado.produtosSemCadastro} produto(s) vendido(s) sem cadastro
          </p>
          <p className="mt-1 text-sm leading-relaxed text-tinta-media">
            Somam{" "}
            <strong className="numerico text-tinta">
              {moeda(resultado.receitaSemCadastro)}
            </strong>{" "}
            de receita no mes. Sem cadastro nao ha influencer dono, e sem
            influencer nao ha regime -- impostos que dependem do produto nao
            incidem sobre eles.
          </p>
          <Link
            href="/produtos"
            className="mt-3 inline-flex rounded-md bg-tinta px-3.5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Cadastrar os produtos que faltam
          </Link>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function CartaoDaOperacao({ apuracao }: { apuracao: ApuracaoDeUmInfluencer }) {
  const alerta = apuracao.monitorTeto
    ? tetoEmAlerta(apuracao.monitorTeto.situacao)
    : false;

  return (
    <div
      className={`rounded-lg border px-5 py-4 ${
        alerta ? "border-alerta-borda bg-alerta-fundo" : "border-borda bg-superficie"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-base font-semibold text-tinta">{apuracao.marca}</p>
          <p className="text-sm text-tinta-media">{apuracao.nome}</p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              apuracao.regime === "simples_nacional"
                ? "bg-real-claro text-real"
                : "bg-fundo text-tinta"
            }`}
          >
            {ROTULO_REGIME[apuracao.regime]}
            {apuracao.simples && ` · faixa ${apuracao.simples.faixa}`}
          </span>

          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wider text-tinta-fraca">
              Imposto no mes
            </p>
            <p className="numerico text-xl font-semibold text-tinta">
              {moeda(apuracao.total)}
            </p>
          </div>

          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wider text-tinta-fraca">
              Sobre a receita
            </p>
            <p className="numerico text-xl font-semibold text-tinta">
              {percentual(apuracao.cargaSobreReceita)}
            </p>
          </div>
        </div>
      </div>

      {/* --- Tributos que somam ------------------------------------------- */}
      {apuracao.linhas.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-borda pt-3">
          {apuracao.linhas.map((linha) => (
            <span key={linha.impostoId} className="text-sm">
              <span className="font-semibold text-tinta">{linha.sigla}</span>{" "}
              <span className="numerico text-tinta-media">
                {moeda(linha.valor)}
              </span>{" "}
              <span className="numerico text-xs text-tinta-fraca">
                ({percentual(linha.aliquota / 100, 2)})
              </span>
            </span>
          ))}
        </div>
      )}

      {/* --- Limites do Simples ------------------------------------------- */}
      {apuracao.monitorTeto && (
        <div className="mt-4 border-t border-borda pt-3">
          <p
            className={`text-sm font-semibold ${alerta ? "text-naopago" : "text-tinta"}`}
          >
            {apuracao.monitorTeto.titulo}
          </p>
          <p className="mt-1 max-w-4xl text-xs leading-relaxed text-tinta-media">
            {apuracao.monitorTeto.explicacao}
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <BarraLimite
              rotulo="Sublimite de ICMS"
              uso={apuracao.monitorTeto.usoDoSublimite}
              limite="R$ 3,6 mi"
            />
            <BarraLimite
              rotulo="Teto do Simples"
              uso={apuracao.monitorTeto.usoDoTeto}
              limite="R$ 4,8 mi"
            />
          </div>

          <p className="mt-2 text-xs text-tinta-fraca">
            Receita de 12 meses desta marca:{" "}
            <strong className="numerico text-tinta-media">
              {moedaRedonda(apuracao.rbt12.valor)}
            </strong>
            {apuracao.rbt12.projetado &&
              ` (projetada a partir de ${apuracao.rbt12.mesesConsiderados} meses)`}
            .
          </p>
        </div>
      )}

      {/* --- Detalhamento da guia unica ----------------------------------- */}
      {apuracao.detalheDoDAS.length > 0 && (
        <details className="mt-3 border-t border-borda pt-3">
          <summary className="cursor-pointer text-sm font-medium text-tinta-media hover:text-tinta">
            O que ha dentro da guia unica (detalhamento, nao soma)
          </summary>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
            {apuracao.detalheDoDAS.map((linha) => (
              <span key={linha.impostoId} className="text-sm">
                <span className="font-semibold text-tinta">{linha.sigla}</span>{" "}
                <span className="numerico text-tinta-media">
                  {moeda(linha.valor)}
                </span>{" "}
                <span className="numerico text-xs text-tinta-fraca">
                  ({percentual(linha.aliquota / 100, 2)})
                </span>
              </span>
            ))}
          </div>
        </details>
      )}

      {/* --- Lacunas declaradas ------------------------------------------- */}
      {apuracao.inativosDoRegime.length > 0 && (
        <div className="mt-3 rounded border border-alerta-borda bg-alerta-fundo px-4 py-3">
          <p className="text-xs font-semibold text-naopago">
            Fora desta conta:{" "}
            {apuracao.inativosDoRegime.map((i) => i.sigla).join(", ")}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-tinta-media">
            Incidem neste regime, mas estao sem aliquota informada no cadastro
            fiscal. O imposto real desta marca e maior que o exibido.
          </p>
        </div>
      )}
    </div>
  );
}

function BarraLimite({
  rotulo,
  uso,
  limite,
}: {
  rotulo: string;
  uso: number;
  limite: string;
}) {
  const estourou = uso >= 1;

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
        <span className="font-medium text-tinta-media">{rotulo}</span>
        <span className="numerico font-semibold text-tinta">
          {percentual(uso, 0)} de {limite}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-fundo">
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.min(100, uso * 100)}%`,
            backgroundColor: estourou
              ? "var(--color-naopago)"
              : "var(--color-real)",
          }}
        />
      </div>
    </div>
  );
}
