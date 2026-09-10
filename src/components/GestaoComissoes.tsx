"use client";

import { Fragment, useActionState, useState } from "react";

import { removerInfluencer, salvarInfluencer } from "@/app/comissoes/actions";
import { ESTADO_INICIAL } from "@/types/formulario";
import { moeda, percentual } from "@/lib/format";
import type { BaseComissao, Influencer } from "@/types/dominio";
import type { ComissaoInfluencer } from "@/lib/costing";

const ROTULO_BASE: Record<BaseComissao, string> = {
  bruto: "Faturamento bruto",
  recebido: "Dinheiro recebido",
  receitaReal: "Receita real (sem frete)",
};

const EXPLICACAO_BASE: Record<BaseComissao, string> = {
  bruto:
    "Inclui pedidos cancelados, reembolsados e boletos que nunca foram pagos.",
  recebido: "Somente pedidos efetivamente pagos, incluindo o frete cobrado.",
  receitaReal: "Pedidos pagos, descontando o frete cobrado do cliente.",
};

interface GestaoComissoesProps {
  influencers: Influencer[];
  calculadas: ComissaoInfluencer[];
  marcas: string[];
}

export function GestaoComissoes({
  influencers,
  calculadas,
  marcas,
}: GestaoComissoesProps) {
  const [editando, setEditando] = useState<Influencer | null | "novo">(null);

  const porId = new Map(calculadas.map((c) => [c.influencerId, c]));

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setEditando(editando === "novo" ? null : "novo")}
          className="rounded-lg bg-tinta px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          {editando === "novo" ? "Cancelar" : "Novo contrato"}
        </button>
      </div>

      {editando === "novo" && (
        <FormularioInfluencer
          influencer={null}
          marcas={marcas}
          aoFechar={() => setEditando(null)}
        />
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-borda-forte text-left text-xs uppercase tracking-wider text-tinta-fraca">
              <th className="py-2.5 pr-4 font-semibold">Influencer</th>
              <th className="py-2.5 pr-4 font-semibold">Marca</th>
              <th className="py-2.5 pr-4 text-right font-semibold">Percentual</th>
              <th className="py-2.5 pr-4 font-semibold">Base de calculo</th>
              <th className="py-2.5 pr-4 text-right font-semibold">Valor base</th>
              <th className="py-2.5 pr-4 text-right font-semibold">Comissao no mes</th>
              <th className="py-2.5 text-right font-semibold">Acao</th>
            </tr>
          </thead>
          <tbody>
            {influencers.map((influencer) => {
              const calculo = porId.get(influencer.id);
              const aberto =
                editando !== "novo" && editando?.id === influencer.id;

              return (
                <Fragment key={influencer.id}>
                <tr
                  className={`border-b border-borda ${
                    influencer.ativo ? "" : "opacity-55"
                  }`}
                >
                  <td className="py-3 pr-4">
                    <p className="font-semibold text-tinta">{influencer.nome}</p>
                    {!influencer.ativo && (
                      <p className="text-xs font-semibold uppercase text-tinta-fraca">
                        inativo
                      </p>
                    )}
                    {influencer.observacao && (
                      <p className="mt-0.5 max-w-xs text-xs text-tinta-fraca">
                        {influencer.observacao}
                      </p>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-tinta-media">{influencer.marca}</td>
                  <td className="numerico py-3 pr-4 text-right font-semibold text-tinta">
                    {percentual(influencer.percentual / 100)}
                  </td>
                  <td className="py-3 pr-4">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        influencer.baseComissao === "bruto"
                          ? "bg-alerta-fundo text-naopago"
                          : "bg-real-claro text-real"
                      }`}
                    >
                      {ROTULO_BASE[influencer.baseComissao]}
                    </span>
                  </td>
                  <td className="numerico py-3 pr-4 text-right text-tinta-media">
                    {calculo ? moeda(calculo.valorBase) : "—"}
                  </td>
                  <td className="numerico py-3 pr-4 text-right font-semibold text-tinta">
                    {calculo ? moeda(calculo.valorComissao) : "—"}
                  </td>
                  <td className="py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setEditando(aberto ? null : influencer)}
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
                        <FormularioInfluencer
                          influencer={influencer}
                          marcas={marcas}
                          aoFechar={() => setEditando(null)}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}

            {influencers.length === 0 && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-tinta-media">
                  Nenhum contrato cadastrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}

// ---------------------------------------------------------------------------

function FormularioInfluencer({
  influencer,
  marcas,
  aoFechar,
}: {
  influencer: Influencer | null;
  marcas: string[];
  aoFechar: () => void;
}) {
  const [estado, acaoSalvar, salvando] = useActionState(
    salvarInfluencer,
    ESTADO_INICIAL,
  );
  const [estadoRemocao, acaoRemover, removendo] = useActionState(
    removerInfluencer,
    ESTADO_INICIAL,
  );
  const [base, setBase] = useState<BaseComissao>(
    influencer?.baseComissao ?? "bruto",
  );

  return (
    <div className="rounded-xl border-2 border-tinta bg-superficie p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <h3 className="text-lg font-semibold text-tinta">
          {influencer ? influencer.nome : "Novo contrato de comissao"}
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
        <input type="hidden" name="id" value={influencer?.id ?? ""} />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <label className="block">
            <span className="text-sm font-medium text-tinta">Nome</span>
            <input
              name="nome"
              required
              defaultValue={influencer?.nome ?? ""}
              className="mt-1 w-full rounded-lg border border-borda-forte bg-superficie px-3 py-2 text-tinta focus:border-tinta focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-tinta">Marca</span>
            <select
              name="marca"
              required
              defaultValue={influencer?.marca ?? marcas[0] ?? ""}
              className="mt-1 w-full rounded-lg border border-borda-forte bg-superficie px-3 py-2 text-tinta focus:border-tinta focus:outline-none"
            >
              {marcas.map((marca) => (
                <option key={marca} value={marca}>
                  {marca}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-tinta">Percentual</span>
            <div className="mt-1 flex items-center gap-2 rounded-lg border border-borda-forte bg-superficie px-3 py-2 focus-within:border-tinta">
              <input
                name="percentual"
                inputMode="decimal"
                required
                defaultValue={String(influencer?.percentual ?? 30).replace(".", ",")}
                className="numerico w-full bg-transparent text-right text-lg font-semibold text-tinta outline-none"
              />
              <span className="text-sm font-medium text-tinta-fraca">%</span>
            </div>
          </label>
        </div>

        <fieldset>
          <legend className="text-sm font-medium text-tinta">
            Base de calculo da comissao
          </legend>
          <div className="mt-2 grid gap-3 xl:grid-cols-3">
            {(["bruto", "recebido", "receitaReal"] as const).map((valor) => (
              <label
                key={valor}
                className={`cursor-pointer rounded-lg border-2 px-4 py-3 transition-colors ${
                  base === valor
                    ? "border-tinta bg-fundo"
                    : "border-borda hover:border-borda-forte"
                }`}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="baseComissao"
                    value={valor}
                    checked={base === valor}
                    onChange={() => setBase(valor)}
                    className="accent-[var(--color-tinta)]"
                  />
                  <span className="text-sm font-semibold text-tinta">
                    {ROTULO_BASE[valor]}
                  </span>
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-tinta-media">
                  {EXPLICACAO_BASE[valor]}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="block">
          <span className="text-sm font-medium text-tinta">
            Observacao <span className="text-tinta-fraca">(opcional)</span>
          </span>
          <textarea
            name="observacao"
            rows={2}
            defaultValue={influencer?.observacao ?? ""}
            className="mt-1 w-full rounded-lg border border-borda-forte bg-superficie px-3 py-2 text-tinta focus:border-tinta focus:outline-none"
          />
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="ativo"
            defaultChecked={influencer?.ativo ?? true}
            className="h-4 w-4 accent-[var(--color-tinta)]"
          />
          <span className="text-sm font-medium text-tinta">
            Contrato ativo (entra no calculo do painel)
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={salvando}
            className="rounded-lg bg-tinta px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {salvando ? "Salvando..." : "Salvar contrato"}
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

      {influencer && (
        <form action={acaoRemover} className="mt-4 border-t border-borda pt-4">
          <input type="hidden" name="id" value={influencer.id} />
          <button
            type="submit"
            disabled={removendo}
            className="text-sm font-medium text-naopago hover:underline disabled:opacity-50"
          >
            {removendo ? "Removendo..." : "Remover este contrato"}
          </button>
        </form>
      )}
    </div>
  );
}
