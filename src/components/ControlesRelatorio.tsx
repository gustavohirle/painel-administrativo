"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";

import { mesAno, rotuloMetodo } from "@/lib/format";
import { escreverConfiguracaoNaUrl } from "@/lib/relatoriosUrl";
import {
  DIMENSOES,
  EXPLICACAO_METRICA,
  METRICAS,
  ROTULO_DIMENSAO,
  ROTULO_METRICA,
  metricaDisponivel,
  motivoIndisponivel,
  type CombinacaoPronta,
  type ConfiguracaoRelatorio,
  type Dimensao,
  type Metrica,
} from "@/types/relatorio";

interface ControlesRelatorioProps {
  configuracao: ConfiguracaoRelatorio;
  combinacoes: CombinacaoPronta[];
  meses: string[];
  marcas: string[];
  estados: string[];
  pagamentos: string[];
}

/**
 * Controles do relatorio.
 *
 * Nao calcula nada: escreve a configuracao na URL e deixa o servidor refazer a
 * conta. Por isso a tela continua funcionando se o cliente colar o link em
 * outro navegador -- o estado esta todo no endereco, nao na memoria da aba.
 */
export function ControlesRelatorio({
  configuracao,
  combinacoes,
  meses,
  marcas,
  estados,
  pagamentos,
}: ControlesRelatorioProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [pendente, iniciarTransicao] = useTransition();

  function aplicar(mudanca: Partial<ConfiguracaoRelatorio>) {
    const nova: ConfiguracaoRelatorio = { ...configuracao, ...mudanca };
    const params = escreverConfiguracaoNaUrl(nova);
    iniciarTransicao(() => router.replace(`${pathname}?${params.toString()}`));
  }

  /** Troca a dimensao e poda as metricas que deixaram de valer nela. */
  function trocarAgrupamento(agruparPor: Dimensao) {
    const metricas = configuracao.metricas.filter((m) =>
      metricaDisponivel(agruparPor, m),
    );

    aplicar({
      agruparPor,
      // Agrupar por X e depois por X de novo nao quebra em nada.
      depoisPor: configuracao.depoisPor === agruparPor ? null : configuracao.depoisPor,
      // Sem isso a tabela ficaria sem coluna nenhuma ao sair de "marca" para
      // "estado", que derruba comissao, imposto e lucro de uma vez so.
      metricas: metricas.length ? metricas : ["recebido"],
      ordenarPor: metricas.includes(configuracao.ordenarPor)
        ? configuracao.ordenarPor
        : (metricas[0] ?? "recebido"),
    });
  }

  function alternarMetrica(metrica: Metrica) {
    const marcada = configuracao.metricas.includes(metrica);
    const metricas = marcada
      ? configuracao.metricas.filter((m) => m !== metrica)
      : [...configuracao.metricas, metrica];

    aplicar({
      metricas,
      ordenarPor: metricas.includes(configuracao.ordenarPor)
        ? configuracao.ordenarPor
        : (metricas[0] ?? configuracao.ordenarPor),
    });
  }

  function alternarFiltro(
    campo: "marcas" | "estados" | "pagamentos",
    valor: string,
  ) {
    const atual = configuracao.filtros[campo];
    aplicar({
      filtros: {
        ...configuracao.filtros,
        [campo]: atual.includes(valor)
          ? atual.filter((v) => v !== valor)
          : [...atual, valor],
      },
    });
  }

  const metricasVisiveis = METRICAS.filter(
    (m) => metricaDisponivel(configuracao.agruparPor, m) || configuracao.metricas.includes(m),
  );

  const temFiltro =
    configuracao.filtros.marcas.length > 0 ||
    configuracao.filtros.estados.length > 0 ||
    configuracao.filtros.pagamentos.length > 0 ||
    configuracao.filtros.mesInicial !== "" ||
    configuracao.filtros.mesFinal !== "";

  return (
    <div
      className={`sem-impressao space-y-5 rounded-xl border border-borda bg-superficie px-4 py-5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] sm:px-6 ${
        pendente ? "opacity-60" : ""
      }`}
    >
      {/* --- Combinacoes prontas ------------------------------------------ */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-tinta-fraca">
          Comece por uma pergunta
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {combinacoes.map((combinacao) => {
            const ativa =
              combinacao.configuracao.agruparPor === configuracao.agruparPor &&
              combinacao.configuracao.depoisPor === configuracao.depoisPor;

            return (
              <button
                key={combinacao.id}
                type="button"
                title={combinacao.pergunta}
                onClick={() =>
                  aplicar({ ...combinacao.configuracao, filtros: configuracao.filtros })
                }
                className={`rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors ${
                  ativa
                    ? "border-tinta bg-tinta text-white"
                    : "border-borda-forte text-tinta hover:bg-fundo"
                }`}
              >
                {combinacao.titulo}
              </button>
            );
          })}
        </div>
      </div>

      {/* --- Agrupamento e ordem ------------------------------------------ */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Campo rotulo="Agrupar por">
          <select
            value={configuracao.agruparPor}
            onChange={(e) => trocarAgrupamento(e.target.value as Dimensao)}
            className={ESTILO_SELECT}
          >
            {DIMENSOES.map((d) => (
              <option key={d} value={d}>
                {ROTULO_DIMENSAO[d]}
              </option>
            ))}
          </select>
        </Campo>

        <Campo rotulo="E depois por">
          <select
            value={configuracao.depoisPor ?? ""}
            onChange={(e) =>
              aplicar({ depoisPor: (e.target.value || null) as Dimensao | null })
            }
            className={ESTILO_SELECT}
          >
            <option value="">Nada -- um nível só</option>
            {DIMENSOES.filter((d) => d !== configuracao.agruparPor).map((d) => (
              <option key={d} value={d}>
                {ROTULO_DIMENSAO[d]}
              </option>
            ))}
          </select>
        </Campo>

        <Campo rotulo="De">
          <select
            value={configuracao.filtros.mesInicial}
            onChange={(e) =>
              aplicar({
                filtros: { ...configuracao.filtros, mesInicial: e.target.value },
              })
            }
            className={ESTILO_SELECT}
          >
            <option value="">Desde o inicio</option>
            {meses.map((mes) => (
              <option key={mes} value={mes}>
                {mesAno(mes)}
              </option>
            ))}
          </select>
        </Campo>

        <Campo rotulo="Até">
          <select
            value={configuracao.filtros.mesFinal}
            onChange={(e) =>
              aplicar({
                filtros: { ...configuracao.filtros, mesFinal: e.target.value },
              })
            }
            className={ESTILO_SELECT}
          >
            <option value="">Até o fim</option>
            {meses.map((mes) => (
              <option key={mes} value={mes}>
                {mesAno(mes)}
              </option>
            ))}
          </select>
        </Campo>
      </div>

      {/* --- Colunas ------------------------------------------------------- */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-tinta-fraca">
          Colunas
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {metricasVisiveis.map((metrica) => {
            const disponivel = metricaDisponivel(configuracao.agruparPor, metrica);
            const marcada = configuracao.metricas.includes(metrica);
            const motivo = motivoIndisponivel(configuracao.agruparPor, metrica);

            return (
              <label
                key={metrica}
                title={motivo ?? EXPLICACAO_METRICA[metrica]}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                  !disponivel
                    ? "cursor-not-allowed border-borda text-tinta-fraca"
                    : marcada
                      ? "cursor-pointer border-tinta bg-tinta text-white"
                      : "cursor-pointer border-borda-forte text-tinta hover:bg-fundo"
                }`}
              >
                <input
                  type="checkbox"
                  checked={marcada && disponivel}
                  disabled={!disponivel}
                  onChange={() => alternarMetrica(metrica)}
                  className="sr-only"
                />
                <span>{ROTULO_METRICA[metrica]}</span>
                {!disponivel && <span aria-hidden>x</span>}
              </label>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-tinta-media">
          Coluna apagada não vale para este agrupamento. Passe o mouse para ver
          o motivo -- o painel prefere deixar de fora a mostrar um rateio
          inventado.
        </p>
      </div>

      {/* --- Ordem e filtros ----------------------------------------------- */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Campo rotulo="Ordenar pela maior">
          <select
            value={configuracao.ordenarPor}
            onChange={(e) => aplicar({ ordenarPor: e.target.value as Metrica })}
            className={ESTILO_SELECT}
          >
            {configuracao.metricas.map((m) => (
              <option key={m} value={m}>
                {ROTULO_METRICA[m]}
              </option>
            ))}
          </select>
        </Campo>

        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg bg-tinta px-4 py-2 text-sm font-semibold text-white"
        >
          Imprimir / salvar PDF
        </button>
      </div>

      <details open={temFiltro} className="rounded-lg border border-borda">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-tinta">
          Filtros
          {temFiltro && (
            <span className="ml-2 rounded-full bg-tinta px-2 py-0.5 text-xs text-white">
              ativos
            </span>
          )}
        </summary>

        <div className="space-y-4 border-t border-borda px-4 py-4">
          <GrupoDeFiltro
            rotulo="Marcas"
            opcoes={marcas.map((m) => ({ valor: m, rotulo: m }))}
            selecionados={configuracao.filtros.marcas}
            aoAlternar={(v) => alternarFiltro("marcas", v)}
          />
          <GrupoDeFiltro
            rotulo="Meios de pagamento"
            opcoes={pagamentos.map((p) => ({ valor: p, rotulo: rotuloMetodo(p) }))}
            selecionados={configuracao.filtros.pagamentos}
            aoAlternar={(v) => alternarFiltro("pagamentos", v)}
          />
          <GrupoDeFiltro
            rotulo="Estados de destino"
            opcoes={estados.map((e) => ({ valor: e, rotulo: e }))}
            selecionados={configuracao.filtros.estados}
            aoAlternar={(v) => alternarFiltro("estados", v)}
          />

          <p className="text-xs text-tinta-media">
            Filtrar por estado ou por meio de pagamento corta cada marca ao meio.
            Comissão, imposto e lucro saem do relatório nesse caso: eles só
            existem para a marca inteira.
          </p>

          {temFiltro && (
            <button
              type="button"
              onClick={() =>
                aplicar({
                  filtros: {
                    mesInicial: "",
                    mesFinal: "",
                    marcas: [],
                    estados: [],
                    pagamentos: [],
                  },
                })
              }
              className="rounded-lg border border-borda-forte px-3 py-1.5 text-sm font-medium text-tinta hover:bg-fundo"
            >
              Limpar filtros
            </button>
          )}
        </div>
      </details>
    </div>
  );
}

const ESTILO_SELECT =
  "w-full rounded-lg border border-borda-forte bg-superficie px-3 py-2 text-sm font-medium text-tinta shadow-sm";

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-tinta-fraca">
        {rotulo}
      </span>
      {children}
    </label>
  );
}

function GrupoDeFiltro({
  rotulo,
  opcoes,
  selecionados,
  aoAlternar,
}: {
  rotulo: string;
  opcoes: Array<{ valor: string; rotulo: string }>;
  selecionados: string[];
  aoAlternar: (valor: string) => void;
}) {
  if (opcoes.length === 0) return null;

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-tinta-fraca">
        {rotulo}
        {selecionados.length === 0 && (
          <span className="ml-2 font-normal normal-case tracking-normal text-tinta-media">
            todos
          </span>
        )}
      </p>
      <div className="mt-2 flex max-h-40 flex-wrap gap-2 overflow-y-auto">
        {opcoes.map((opcao) => {
          const marcado = selecionados.includes(opcao.valor);
          return (
            <label
              key={opcao.valor}
              className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm ${
                marcado
                  ? "border-tinta bg-tinta text-white"
                  : "border-borda-forte text-tinta hover:bg-fundo"
              }`}
            >
              <input
                type="checkbox"
                checked={marcado}
                onChange={() => aoAlternar(opcao.valor)}
                className="sr-only"
              />
              {opcao.rotulo}
            </label>
          );
        })}
      </div>
    </div>
  );
}
