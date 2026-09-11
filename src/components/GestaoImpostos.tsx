"use client";

import { Fragment, useActionState, useState } from "react";

import { removerImposto, salvarImposto } from "@/app/impostos/actions";
import { inteiro, moeda, percentual } from "@/lib/format";
import { ESTADO_INICIAL } from "@/types/formulario";
import type { EsferaImposto, Imposto, RegimeTributario } from "@/types/fiscal";

const REGIMES: RegimeTributario[] = [
  "simples_nacional",
  "lucro_presumido",
  "lucro_real",
];

const ROTULO_REGIME: Record<RegimeTributario, string> = {
  simples_nacional: "Simples Nacional",
  lucro_presumido: "Lucro Presumido",
  lucro_real: "Lucro Real",
};

const ROTULO_REGIME_CURTO: Record<RegimeTributario, string> = {
  simples_nacional: "Simples",
  lucro_presumido: "Presumido",
  lucro_real: "Real",
};

const NOTA_DO_REGIME: Record<RegimeTributario, string> = {
  simples_nacional:
    "IRPJ, CSLL, PIS, COFINS, CPP, IPI e ICMS ja estao dentro da guia unica e " +
    "sao calculados pela tabela do Anexo II. Aqui entram apenas os tributos " +
    "recolhidos POR FORA dela.",
  lucro_presumido:
    "Cada tributo e recolhido separadamente. PIS, COFINS, IRPJ e CSLL incidem " +
    "sobre toda a receita da marca; ICMS e IPI dependem do produto.",
  lucro_real:
    "PIS e COFINS nao cumulativos dao direito a credito sobre insumos, que " +
    "este painel nao modela -- informe a aliquota efetiva liquida de creditos.",
};

const ROTULO_ESFERA: Record<EsferaImposto, string> = {
  federal: "Federal",
  estadual: "Estadual",
  municipal: "Municipal",
};

/** Uma operacao: qual marca, de quem, em que regime. */
export interface OperacaoDoRegime {
  marca: string;
  nome: string;
  regime: RegimeTributario;
}

interface GestaoImpostosProps {
  impostos: Imposto[];
  /** Quantos produtos marcaram cada imposto. */
  usoPorImposto: Record<string, number>;
  /** Marcas em cada regime, para o catalogo nao ficar solto da realidade. */
  operacoes: OperacaoDoRegime[];
  /**
   * Valor apurado de cada imposto no mes, vindo da propria apuracao.
   *
   * Nao e recalculado aqui de proposito: um imposto por produto incide so
   * sobre a receita dos produtos marcados, e multiplicar a aliquota pela
   * receita consolidada superestimava -- o ICMS aparecia com a base das cinco
   * marcas quando so tres estao no regime dele.
   */
  valorPorImposto: Record<string, number>;
}

/*
 * Catalogo dos impostos que podem incidir sobre um produto.
 *
 * Organizado POR REGIME porque e assim que o painel usa: o produto herda o
 * regime do influencer dono, e dai sai o conjunto de tributos dele. Um imposto
 * que vale em mais de um regime aparece em cada secao -- de proposito, porque
 * a aliquota e a mesma mas o contexto e outro.
 *
 * NAO existe "regime da empresa". Cada marca tem o seu, e se edita no cadastro
 * do influencer.
 */
export function GestaoImpostos({
  impostos,
  usoPorImposto,
  operacoes,
  valorPorImposto,
}: GestaoImpostosProps) {
  /*
   * Chave "regime-idDoImposto", nao so o id.
   *
   * Um imposto que vale em mais de um regime aparece em mais de uma secao.
   * Guardando so o id, clicar em "Editar" no Presumido abria o formulario
   * tambem na secao do Lucro Real -- dois formularios identicos na tela.
   */
  const [editando, setEditando] = useState<string | null>(null);

  const semRegime = impostos.filter((i) => i.regimes.length === 0);

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-sm leading-relaxed text-tinta-media">
          Estes sao os tributos que podem incidir sobre um produto. Cada um vale
          para um ou mais regimes; no cadastro do produto, escolher o influencer
          ja traz marcados os do regime dele. As aliquotas vem preenchidas com os
          valores basicos e sao editaveis.
        </p>
        <button
          type="button"
          onClick={() => setEditando(editando === "novo" ? null : "novo")}
          className="rounded-lg bg-tinta px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          {editando === "novo" ? "Cancelar" : "Novo imposto"}
        </button>
      </div>

      {editando === "novo" && (
        <FormularioImposto imposto={null} aoFechar={() => setEditando(null)} />
      )}

      {REGIMES.map((regime) => (
        <SecaoDoRegime
          key={regime}
          regime={regime}
          impostos={impostos.filter((i) => i.regimes.includes(regime))}
          marcas={operacoes.filter((o) => o.regime === regime)}
          usoPorImposto={usoPorImposto}
          valorPorImposto={valorPorImposto}
          editando={editando}
          setEditando={setEditando}
        />
      ))}

      {semRegime.length > 0 && (
        <SecaoDoRegime
          regime={null}
          impostos={semRegime}
          marcas={[]}
          usoPorImposto={usoPorImposto}
          valorPorImposto={valorPorImposto}
          editando={editando}
          setEditando={setEditando}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function SecaoDoRegime({
  regime,
  impostos,
  marcas,
  usoPorImposto,
  valorPorImposto,
  editando,
  setEditando,
}: {
  regime: RegimeTributario | null;
  impostos: Imposto[];
  marcas: OperacaoDoRegime[];
  usoPorImposto: Record<string, number>;
  valorPorImposto: Record<string, number>;
  editando: string | null;
  setEditando: (chave: string | null) => void;
}) {
  const chaveDaSecao = regime ?? "sem";
  return (
    <section>
      <div className="mb-3 border-b border-borda-forte pb-2">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="text-base font-semibold text-tinta">
            {regime ? ROTULO_REGIME[regime] : "Sem regime definido"}
          </h3>
          <p className="text-sm text-tinta-media">
            {regime === null
              ? "Nao entram em nenhum calculo enquanto nao tiverem regime."
              : marcas.length === 0
                ? "Nenhuma marca neste regime hoje."
                : `${marcas.length} marca(s): ${marcas.map((m) => m.marca).join(", ")}`}
          </p>
        </div>
        {regime && (
          <p className="mt-1 max-w-4xl text-xs leading-relaxed text-tinta-fraca">
            {NOTA_DO_REGIME[regime]}
          </p>
        )}
      </div>

      {impostos.length === 0 ? (
        <p className="py-4 text-sm text-tinta-media">
          Nenhum imposto cadastrado para este regime.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-borda text-left text-xs uppercase tracking-wider text-tinta-fraca">
                <th className="py-2 pr-4 font-semibold">Imposto</th>
                <th className="py-2 pr-4 text-right font-semibold">Aliquota</th>
                <th className="py-2 pr-4 font-semibold">Incide sobre</th>
                <th className="py-2 pr-4 text-right font-semibold">Produtos</th>
                <th
                  className="py-2 pr-4 text-right font-semibold"
                  title="Valor apurado neste mes, somando as marcas que estao neste regime."
                >
                  Apurado no mes
                </th>
                <th className="py-2 pr-4 font-semibold">Situacao</th>
                <th className="py-2 text-right font-semibold">Acao</th>
              </tr>
            </thead>
            <tbody>
              {impostos.map((imposto) => {
                const chave = `${chaveDaSecao}-${imposto.id}`;
                const aberto = editando === chave;
                // Vem da apuracao, ja com a base certa de cada marca.
                const valor = imposto.ativo
                  ? (valorPorImposto[imposto.id] ?? 0)
                  : null;

                return (
                  <Fragment key={`${regime ?? "sem"}-${imposto.id}`}>
                    <tr
                      className={`border-b border-borda ${imposto.ativo ? "" : "opacity-60"}`}
                    >
                      <td className="py-3 pr-4">
                        <p className="font-semibold text-tinta">
                          {imposto.sigla}
                          <span className="ml-2 text-xs font-normal text-tinta-fraca">
                            {ROTULO_ESFERA[imposto.esfera]}
                          </span>
                        </p>
                        <p className="text-xs text-tinta-fraca">{imposto.nome}</p>
                        {imposto.regimes.length > 1 && regime && (
                          <p className="mt-0.5 text-xs text-tinta-fraca">
                            vale tambem em{" "}
                            {imposto.regimes
                              .filter((r) => r !== regime)
                              .map((r) => ROTULO_REGIME_CURTO[r])
                              .join(", ")}
                          </p>
                        )}
                      </td>

                      <td className="numerico py-3 pr-4 text-right font-semibold text-tinta">
                        {percentual(imposto.aliquota / 100, 2)}
                        {imposto.percentualPresuncao !== null && (
                          <span className="block text-xs font-normal text-tinta-fraca">
                            sobre {percentual(imposto.percentualPresuncao / 100, 0)} da
                            receita
                          </span>
                        )}
                      </td>

                      <td className="py-3 pr-4 text-xs text-tinta-media">
                        {imposto.aplicacaoPorProduto
                          ? "Produtos marcados"
                          : "Toda a receita da marca"}
                      </td>

                      <td className="numerico py-3 pr-4 text-right text-tinta-media">
                        {imposto.aplicacaoPorProduto
                          ? inteiro(usoPorImposto[imposto.id] ?? 0)
                          : "—"}
                      </td>

                      <td className="numerico py-3 pr-4 text-right text-tinta-media">
                        {valor === null ? "—" : moeda(valor)}
                      </td>

                      <td className="py-3 pr-4">
                        <div className="flex flex-wrap gap-1.5">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              imposto.ativo
                                ? "bg-real-claro text-real"
                                : "bg-fundo text-tinta-fraca"
                            }`}
                          >
                            {imposto.ativo ? "ativo" : "inativo"}
                          </span>
                          {!imposto.confirmadoPeloContador && (
                            <span
                              title="A aliquota ainda nao foi confirmada com o contador."
                              className="rounded-full border border-alerta-borda bg-alerta-fundo px-2.5 py-0.5 text-xs font-semibold text-naopago"
                            >
                              a confirmar
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setEditando(aberto ? null : chave)}
                          className="rounded-md border border-borda-forte bg-superficie px-3 py-1.5 text-sm font-medium text-tinta hover:bg-fundo"
                        >
                          {aberto ? "Fechar" : "Editar"}
                        </button>
                      </td>
                    </tr>

                    {imposto.observacao && !aberto && (
                      <tr className="border-b border-borda">
                        <td
                          colSpan={7}
                          className="pb-3 pr-4 text-xs leading-relaxed text-tinta-media"
                        >
                          {imposto.observacao}
                        </td>
                      </tr>
                    )}

                    {/*
                      O formulario abre AQUI, na linha logo abaixo do item.
                      Depois da tabela inteira, clicar em "Editar" parecia nao
                      fazer nada: o formulario abria fora da tela.
                    */}
                    {aberto && (
                      <tr>
                        <td colSpan={7} className="p-0 pb-4">
                          <FormularioImposto
                            imposto={imposto}
                            aoFechar={() => setEditando(null)}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

function FormularioImposto({
  imposto,
  aoFechar,
}: {
  imposto: Imposto | null;
  aoFechar: () => void;
}) {
  const [estado, acaoSalvar, salvando] = useActionState(salvarImposto, ESTADO_INICIAL);
  const [estadoRemocao, acaoRemover, removendo] = useActionState(
    removerImposto,
    ESTADO_INICIAL,
  );
  const [base, setBase] = useState<"receita" | "lucro">(
    imposto?.baseIncidencia ?? "receita",
  );

  return (
    <div className="rounded-xl border-2 border-tinta bg-superficie p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <h3 className="text-lg font-semibold text-tinta">
          {imposto ? `${imposto.sigla} — ${imposto.nome}` : "Novo imposto"}
        </h3>
        <button
          type="button"
          onClick={aoFechar}
          className="rounded-md border border-borda-forte px-3 py-1.5 text-sm font-medium text-tinta-media hover:text-tinta"
        >
          Fechar
        </button>
      </div>

      <form action={acaoSalvar} className="space-y-5">
        <input type="hidden" name="id" value={imposto?.id ?? ""} />
        <input type="hidden" name="dentroDoDAS" value="false" />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <label className="block xl:col-span-2">
            <span className="text-sm font-medium text-tinta">Nome</span>
            <input
              name="nome"
              required
              defaultValue={imposto?.nome ?? ""}
              className="mt-1 w-full rounded-lg border border-borda-forte bg-superficie px-3 py-2 text-tinta focus:border-tinta focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-tinta">Sigla</span>
            <input
              name="sigla"
              required
              defaultValue={imposto?.sigla ?? ""}
              className="mt-1 w-full rounded-lg border border-borda-forte bg-superficie px-3 py-2 text-tinta focus:border-tinta focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-tinta">Esfera</span>
            <select
              name="esfera"
              defaultValue={imposto?.esfera ?? "estadual"}
              className="mt-1 w-full rounded-lg border border-borda-forte bg-superficie px-3 py-2 text-tinta"
            >
              <option value="federal">Federal</option>
              <option value="estadual">Estadual</option>
              <option value="municipal">Municipal</option>
            </select>
          </label>
        </div>

        <fieldset className="rounded-lg border border-borda bg-fundo px-5 py-4">
          <legend className="px-2 text-sm font-medium text-tinta">
            Em quais regimes este tributo incide
          </legend>
          <p className="mb-3 text-xs leading-relaxed text-tinta-media">
            E o que faz o cadastro de produto se preencher sozinho: escolhido o
            influencer, o painel marca os impostos do regime dele.
          </p>

          <div className="grid gap-3 xl:grid-cols-3">
            {REGIMES.map((valor) => (
              <label key={valor} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="regimes"
                  value={valor}
                  defaultChecked={imposto?.regimes.includes(valor) ?? false}
                  className="h-4 w-4 accent-[var(--color-tinta)]"
                />
                <span className="text-sm font-medium text-tinta">
                  {ROTULO_REGIME[valor]}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <label className="block">
            <span className="text-sm font-medium text-tinta">Aliquota</span>
            <div className="mt-1 flex items-center gap-2 rounded-lg border border-borda-forte bg-superficie px-3 py-2 focus-within:border-tinta">
              <input
                name="aliquota"
                inputMode="decimal"
                defaultValue={String(imposto?.aliquota ?? 0).replace(".", ",")}
                className="numerico w-full bg-transparent text-right text-lg font-semibold text-tinta outline-none"
              />
              <span className="text-sm font-medium text-tinta-fraca">%</span>
            </div>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-tinta">Incide sobre</span>
            <select
              name="baseIncidencia"
              value={base}
              onChange={(e) => setBase(e.target.value as "receita" | "lucro")}
              className="mt-1 w-full rounded-lg border border-borda-forte bg-superficie px-3 py-2 text-tinta"
            >
              <option value="receita">Receita</option>
              <option value="lucro">Lucro presumido</option>
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-tinta">Presuncao</span>
            <div className="mt-1 flex items-center gap-2 rounded-lg border border-borda-forte bg-superficie px-3 py-2 focus-within:border-tinta">
              <input
                name="percentualPresuncao"
                inputMode="decimal"
                disabled={base !== "lucro"}
                placeholder="8"
                defaultValue={
                  imposto?.percentualPresuncao == null
                    ? ""
                    : String(imposto.percentualPresuncao).replace(".", ",")
                }
                className="numerico w-full bg-transparent text-right text-lg font-semibold text-tinta outline-none disabled:opacity-40"
              />
              <span className="text-sm font-medium text-tinta-fraca">%</span>
            </div>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-tinta">Deducao mensal</span>
            <div className="mt-1 flex items-center gap-2 rounded-lg border border-borda-forte bg-superficie px-3 py-2 focus-within:border-tinta">
              <span className="text-sm font-medium text-tinta-fraca">R$</span>
              <input
                name="deducaoMensal"
                inputMode="decimal"
                disabled={base !== "lucro"}
                placeholder="20.000"
                defaultValue={
                  imposto?.deducaoMensal == null
                    ? ""
                    : String(imposto.deducaoMensal).replace(".", ",")
                }
                className="numerico w-full bg-transparent text-right text-lg font-semibold text-tinta outline-none disabled:opacity-40"
              />
            </div>
          </label>
        </div>

        {base === "lucro" && (
          <p className="text-xs leading-relaxed text-tinta-fraca">
            Base = presuncao x receita, menos a deducao mensal. O adicional de
            IRPJ, por exemplo, e 10% sobre 8% da receita que exceder R$ 20 mil no
            mes -- sem a deducao seria cobrado desde o primeiro real.
          </p>
        )}

        <div className="space-y-3 rounded-lg border border-borda bg-fundo px-5 py-4">
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              name="aplicacaoPorProduto"
              defaultChecked={imposto?.aplicacaoPorProduto ?? true}
              className="mt-0.5 h-4 w-4 accent-[var(--color-tinta)]"
            />
            <span>
              <span className="block text-sm font-medium text-tinta">
                Incide apenas nos produtos marcados
              </span>
              <span className="block text-xs text-tinta-media">
                Use para tributos que dependem do NCM, como ICMS-ST e IPI.
                Desmarcado, incide sobre toda a receita da marca.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              name="ativo"
              defaultChecked={imposto?.ativo ?? true}
              className="mt-0.5 h-4 w-4 accent-[var(--color-tinta)]"
            />
            <span className="text-sm font-medium text-tinta">
              Ativo (entra no calculo do painel)
            </span>
          </label>

          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              name="confirmadoPeloContador"
              defaultChecked={imposto?.confirmadoPeloContador ?? false}
              className="mt-0.5 h-4 w-4 accent-[var(--color-tinta)]"
            />
            <span>
              <span className="block text-sm font-medium text-tinta">
                Aliquota confirmada pelo contador
              </span>
              <span className="block text-xs text-tinta-media">
                Enquanto estiver desmarcado, o painel exibe o aviso de que o
                numero ainda e estimativa.
              </span>
            </span>
          </label>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-tinta">
            Quando se aplica <span className="text-tinta-fraca">(opcional)</span>
          </span>
          <textarea
            name="observacao"
            rows={3}
            defaultValue={imposto?.observacao ?? ""}
            className="mt-1 w-full rounded-lg border border-borda-forte bg-superficie px-3 py-2 text-tinta focus:border-tinta focus:outline-none"
          />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={salvando}
            className="rounded-lg bg-tinta px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {salvando ? "Salvando..." : "Salvar imposto"}
          </button>
          {(estado.mensagem || estadoRemocao.mensagem) && (
            <span
              className={`text-sm font-medium ${
                estado.ok || estadoRemocao.ok ? "text-real" : "text-naopago"
              }`}
            >
              {estado.mensagem || estadoRemocao.mensagem}
            </span>
          )}
        </div>
      </form>

      {imposto && (
        <form action={acaoRemover} className="mt-4 border-t border-borda pt-4">
          <input type="hidden" name="id" value={imposto.id} />
          <button
            type="submit"
            disabled={removendo}
            className="text-sm font-medium text-naopago hover:underline disabled:opacity-50"
          >
            {removendo ? "Removendo..." : "Remover este imposto"}
          </button>
        </form>
      )}
    </div>
  );
}
