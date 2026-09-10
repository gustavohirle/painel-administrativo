"use client";

import { Fragment, useActionState, useState } from "react";

import {
  removerImposto,
  salvarConfiguracaoFiscal,
  salvarImposto,
} from "@/app/impostos/actions";
import { moeda, percentual } from "@/lib/format";
import { ESTADO_INICIAL } from "@/types/formulario";
import type {
  ConfiguracaoFiscal,
  EsferaImposto,
  Imposto,
  RegimeTributario,
} from "@/types/fiscal";

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

const ROTULO_ESFERA: Record<EsferaImposto, string> = {
  federal: "Federal",
  estadual: "Estadual",
  municipal: "Municipal",
};

// ---------------------------------------------------------------------------
// Configuracao fiscal
// ---------------------------------------------------------------------------

export function FormularioConfiguracaoFiscal({
  config,
}: {
  config: ConfiguracaoFiscal;
}) {
  const [estado, acao, salvando] = useActionState(
    salvarConfiguracaoFiscal,
    ESTADO_INICIAL,
  );
  const [regime, setRegime] = useState<RegimeTributario>(config.regime);

  return (
    <form action={acao} className="space-y-5">
      <fieldset>
        <legend className="text-sm font-medium text-tinta">
          Regime tributario
        </legend>
        <div className="mt-2 grid gap-3 xl:grid-cols-3">
          {(
            ["simples_nacional", "lucro_presumido", "lucro_real"] as const
          ).map((valor) => (
            <label
              key={valor}
              className={`cursor-pointer rounded-lg border-2 px-4 py-3 transition-colors ${
                regime === valor
                  ? "border-tinta bg-fundo"
                  : "border-borda hover:border-borda-forte"
              }`}
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name="regime"
                  value={valor}
                  checked={regime === valor}
                  onChange={() => setRegime(valor)}
                  className="accent-[var(--color-tinta)]"
                />
                <span className="text-sm font-semibold text-tinta">
                  {ROTULO_REGIME[valor]}
                </span>
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-tinta-media">
                {valor === "simples_nacional" &&
                  "Guia unica, aliquota efetiva pela receita de 12 meses. Teto de R$ 4,8 mi/ano."}
                {valor === "lucro_presumido" &&
                  "PIS/COFINS cumulativos; IRPJ e CSLL sobre base presumida da receita."}
                {valor === "lucro_real" &&
                  "PIS/COFINS nao cumulativos com credito; IRPJ e CSLL sobre o lucro efetivo."}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="text-sm font-medium text-tinta">Anexo do Simples</span>
          <select
            name="anexoSimples"
            defaultValue={config.anexoSimples}
            disabled={regime !== "simples_nacional"}
            className="mt-1 w-full rounded-lg border border-borda-forte bg-superficie px-3 py-2 text-tinta disabled:opacity-50"
          >
            {(["I", "II", "III", "IV", "V"] as const).map((a) => (
              <option key={a} value={a}>
                Anexo {a}
                {a === "II" ? " (Industria)" : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-tinta">UF da empresa</span>
          <input
            name="uf"
            maxLength={2}
            defaultValue={config.uf}
            className="mt-1 w-full rounded-lg border border-borda-forte bg-superficie px-3 py-2 uppercase text-tinta focus:border-tinta focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-tinta">
            Receita de 12 meses{" "}
            <span className="text-tinta-fraca">(opcional)</span>
          </span>
          <input
            name="rbt12Manual"
            inputMode="decimal"
            placeholder="Calcular do historico"
            defaultValue={
              config.rbt12Manual === null
                ? ""
                : String(config.rbt12Manual).replace(".", ",")
            }
            className="numerico mt-1 w-full rounded-lg border border-borda-forte bg-superficie px-3 py-2 text-right text-tinta focus:border-tinta focus:outline-none"
          />
        </label>
      </div>

      <p className="text-xs leading-relaxed text-tinta-fraca">
        Deixando a receita de 12 meses em branco, o painel calcula a partir dos
        pedidos. Informe a mao quando o historico da loja for menor que o da
        empresa -- e o RBT12 que define a faixa e a aliquota efetiva.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={salvando}
          className="rounded-lg bg-tinta px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {salvando ? "Salvando..." : "Salvar configuracao"}
        </button>
        {estado.mensagem && (
          <span
            className={`text-sm font-medium ${estado.ok ? "text-real" : "text-naopago"}`}
          >
            {estado.mensagem}
          </span>
        )}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Cadastro de impostos
// ---------------------------------------------------------------------------

export function GestaoImpostos({
  impostos,
  baseReceita,
}: {
  impostos: Imposto[];
  baseReceita: number;
}) {
  const [editando, setEditando] = useState<Imposto | null | "novo">(null);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-sm text-tinta-media">
          Aqui ficam os tributos recolhidos <strong>por fora</strong> da guia
          unica. O que ja esta dentro do DAS nao entra nesta lista -- a
          reparticao vem da tabela oficial do Anexo II e aparece na apuracao
          abaixo. Cadastrar duas vezes faria o painel somar o mesmo imposto duas
          vezes.
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

      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-borda-forte text-left text-xs uppercase tracking-wider text-tinta-fraca">
              <th className="py-2.5 pr-4 font-semibold">Imposto</th>
              <th className="py-2.5 pr-4 font-semibold">Regimes</th>
              <th className="py-2.5 pr-4 text-right font-semibold">Aliquota</th>
              <th className="py-2.5 pr-4 font-semibold">Incidencia</th>
              <th className="py-2.5 pr-4 text-right font-semibold">
                Valor estimado
              </th>
              <th className="py-2.5 pr-4 font-semibold">Situacao</th>
              <th className="py-2.5 text-right font-semibold">Acao</th>
            </tr>
          </thead>
          <tbody>
            {impostos.map((imposto) => {
              const aberto = editando !== "novo" && editando?.id === imposto.id;
              const valor = imposto.ativo
                ? (baseReceita * imposto.aliquota) / 100
                : 0;

              return (
                <Fragment key={imposto.id}>
                <tr
                  className={`border-b border-borda ${imposto.ativo ? "" : "opacity-60"}`}
                >
                  <td className="py-3 pr-4">
                    <p className="font-semibold text-tinta">{imposto.sigla}</p>
                    <p className="text-xs text-tinta-fraca">{imposto.nome}</p>
                  </td>
                  <td className="py-3 pr-4">
                    {imposto.regimes.length === 0 ? (
                      <span className="text-xs text-tinta-fraca">nenhum</span>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {imposto.regimes.map((r) => (
                          <span
                            key={r}
                            className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                              r === "simples_nacional"
                                ? "bg-real-claro text-real"
                                : "bg-fundo text-tinta"
                            }`}
                          >
                            {ROTULO_REGIME_CURTO[r]}
                          </span>
                        ))}
                      </span>
                    )}
                    <span className="mt-0.5 block text-xs text-tinta-fraca">
                      {ROTULO_ESFERA[imposto.esfera]}
                    </span>
                  </td>
                  <td className="numerico py-3 pr-4 text-right font-semibold text-tinta">
                    {percentual(imposto.aliquota / 100, 2)}
                  </td>
                  <td className="py-3 pr-4 text-xs text-tinta-media">
                    {imposto.aplicacaoPorProduto
                      ? "Por produto marcado"
                      : "Sobre toda a receita"}
                  </td>
                  <td className="numerico py-3 pr-4 text-right text-tinta-media">
                    {imposto.ativo ? moeda(valor) : "—"}
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
                      onClick={() => setEditando(aberto ? null : imposto)}
                      className="rounded-md border border-borda-forte bg-superficie px-3 py-1.5 text-sm font-medium text-tinta hover:bg-fundo"
                    >
                      {aberto ? "Fechar" : "Editar"}
                    </button>
                  </td>
                </tr>

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

            {impostos.length === 0 && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-tinta-media">
                  Nenhum imposto cadastrado fora da guia unica.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {impostos.some((i) => i.observacao) && (
        <div className="space-y-3 rounded-lg border border-borda bg-fundo px-5 py-4">
          <p className="text-sm font-semibold text-tinta">Quando cada um se aplica</p>
          {impostos
            .filter((i) => i.observacao)
            .map((i) => (
              <p key={i.id} className="text-xs leading-relaxed text-tinta-media">
                <strong className="text-tinta">{i.sigla}.</strong> {i.observacao}
              </p>
            ))}
        </div>
      )}

    </div>
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
            {(
              [
                ["simples_nacional", "Simples Nacional"],
                ["lucro_presumido", "Lucro Presumido"],
                ["lucro_real", "Lucro Real"],
              ] as const
            ).map(([valor, rotulo]) => (
              <label key={valor} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="regimes"
                  value={valor}
                  defaultChecked={imposto?.regimes.includes(valor) ?? false}
                  className="h-4 w-4 accent-[var(--color-tinta)]"
                />
                <span className="text-sm font-medium text-tinta">{rotulo}</span>
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
            <span className="text-sm font-medium text-tinta">
              Deducao mensal
            </span>
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
            IRPJ, por exemplo, e 10% sobre 8% da receita que exceder R$ 20 mil
            no mes -- sem a deducao seria cobrado desde o primeiro real.
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
                Desmarcado, incide sobre toda a receita.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              name="ativo"
              defaultChecked={imposto?.ativo ?? false}
              className="mt-0.5 h-4 w-4 accent-[var(--color-tinta)]"
            />
            <span>
              <span className="block text-sm font-medium text-tinta">
                Ativo (entra no calculo do painel)
              </span>
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
