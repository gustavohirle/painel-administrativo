"use client";

import { Fragment, useActionState, useState } from "react";

import { salvarTaxaPlataforma } from "@/app/impostos/actions";
import { moeda, percentual, rotuloMetodo } from "@/lib/format";
import type { LinhaTaxaMetodo, ResultadoTaxasPlataforma } from "@/lib/plataforma";
import { ESTADO_INICIAL } from "@/types/formulario";
import {
  EXPLICACAO_BASE_TAXA,
  ROTULO_BASE_TAXA,
  type TaxaPlataforma,
} from "@/types/plataforma";

interface GestaoTaxasProps {
  taxas: TaxaPlataforma[];
  apuracao: ResultadoTaxasPlataforma;
}

/**
 * Cadastro das taxas de plataforma, com o apurado do mes ao lado.
 *
 * Mostrar a aliquota sozinha nao responde nada: 1,99% de boleto parece barato
 * ate ver que o fixo de R$ 3,49 por transacao leva a carga efetiva para perto
 * de 10% num pedido pequeno. Por isso cada linha traz o "apurado no mes" e a
 * carga efetiva de verdade, vindos da apuracao -- nao de uma multiplicacao
 * sobre a receita consolidada.
 */
export function GestaoTaxas({ taxas, apuracao }: GestaoTaxasProps) {
  const [editando, setEditando] = useState<string | null>(null);

  // Metodo que apareceu em pedido do mes mas nao tem cadastro entra na lista
  // mesmo assim: some-lo faria o total parecer completo quando nao esta.
  const porMetodo = new Map(apuracao.porMetodo.map((l) => [l.metodo, l]));
  const metodos = [
    ...new Set([...taxas.map((t) => t.metodo), ...apuracao.porMetodo.map((l) => l.metodo)]),
  ].sort((a, b) => (porMetodo.get(b)?.total ?? 0) - (porMetodo.get(a)?.total ?? 0));

  return (
    <div>
      {apuracao.metodosSemTaxa.length > 0 && (
        <p className="mb-4 rounded-lg border border-alerta-borda bg-alerta-fundo px-4 py-3 text-sm text-naopago">
          <strong className="font-semibold">
            {apuracao.metodosSemTaxa.map(rotuloMetodo).join(", ")}
          </strong>{" "}
          entrou no mês sem taxa ativa cadastrada:{" "}
          <span className="numerico">{moeda(apuracao.recebidoSemTaxa)}</span> de
          recebido ficaram fora desta conta.
        </p>
      )}

      {apuracao.temTaxaNaoConfirmada && (
        <p className="mb-4 text-sm text-tinta-media">
          As taxas marcadas como <strong className="text-tinta">não conferidas</strong>{" "}
          são ordem de grandeza pública, não o seu contrato. O percentual real muda
          com o plano, com o volume e com a antecipação de recebíveis &mdash;
          confira na fatura antes de usar como número fechado.
        </p>
      )}

      <div className="tabela-ancorada overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-borda-forte text-left text-xs uppercase tracking-wider text-tinta-fraca">
              <th className="py-2.5 pr-4 font-semibold">Meio de pagamento</th>
              <th className="py-2.5 pr-4 text-right font-semibold">Percentual</th>
              <th className="py-2.5 pr-4 text-right font-semibold">Fixo por transação</th>
              <th className="py-2.5 pr-4 font-semibold">Incide sobre</th>
              <th className="py-2.5 pr-4 text-right font-semibold">Apurado no mês</th>
              <th className="py-2.5 pr-4 text-right font-semibold">Carga efetiva</th>
              <th className="py-2.5 font-semibold">&nbsp;</th>
            </tr>
          </thead>
          <tbody>
            {metodos.map((metodo) => {
              const taxa = taxas.find((t) => t.metodo === metodo) ?? null;
              const linha = porMetodo.get(metodo) ?? null;
              const aberto = editando === metodo;

              return (
                <Fragment key={metodo}>
                  <tr className="border-b border-borda">
                    <td className="py-3 pr-4">
                      <span className="font-semibold text-tinta">{rotuloMetodo(metodo)}</span>
                      {taxa && !taxa.ativa && (
                        <span className="ml-2 rounded-full border border-borda-forte px-2 py-0.5 text-[11px] font-semibold text-tinta-fraca">
                          inativa
                        </span>
                      )}
                      {taxa && taxa.ativa && !taxa.confirmadaNaFatura && (
                        <span
                          title="Valor semeado. Confira na fatura da Nuvemshop."
                          className="ml-2 rounded-full border border-alerta-borda bg-alerta-fundo px-2 py-0.5 text-[11px] font-semibold text-naopago"
                        >
                          não conferida
                        </span>
                      )}
                      {taxa?.observacao && (
                        <span className="mt-0.5 block text-xs text-tinta-fraca">
                          {taxa.observacao}
                        </span>
                      )}
                    </td>
                    <td className="numerico py-3 pr-4 text-right text-tinta-media">
                      {taxa ? `${taxa.percentual.toLocaleString("pt-BR")}%` : "--"}
                    </td>
                    <td className="numerico py-3 pr-4 text-right text-tinta-media">
                      {taxa && taxa.valorFixo > 0 ? moeda(taxa.valorFixo) : "--"}
                    </td>
                    <td className="py-3 pr-4 text-xs text-tinta-media">
                      {taxa ? (
                        <span title={EXPLICACAO_BASE_TAXA[taxa.base]}>
                          {ROTULO_BASE_TAXA[taxa.base]}
                        </span>
                      ) : (
                        "--"
                      )}
                    </td>
                    <td className="numerico py-3 pr-4 text-right font-semibold text-tinta">
                      {linha ? moeda(linha.total) : moeda(0)}
                    </td>
                    <td className="numerico py-3 pr-4 text-right text-tinta-media">
                      {linha && linha.base > 0 ? percentual(linha.cargaEfetiva) : "--"}
                    </td>
                    <td className="py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setEditando(aberto ? null : metodo)}
                        className="rounded-lg border border-borda-forte px-3 py-1.5 text-sm font-medium text-tinta hover:bg-fundo"
                      >
                        {aberto ? "Fechar" : "Editar"}
                      </button>
                    </td>
                  </tr>

                  {aberto && (
                    <tr>
                      <td colSpan={7} className="p-0 pb-4">
                        <div className="linha-de-edicao">
                          <FormularioTaxa
                            metodo={metodo}
                            taxa={taxa}
                            linha={linha}
                            aoFechar={() => setEditando(null)}
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-borda-forte font-semibold text-tinta">
              <td className="py-3 pr-4">Total</td>
              <td className="py-3 pr-4" />
              <td className="py-3 pr-4" />
              <td className="py-3 pr-4" />
              <td className="numerico py-3 pr-4 text-right">{moeda(apuracao.total)}</td>
              <td className="numerico py-3 pr-4 text-right">
                {percentual(apuracao.cargaSobreRecebido)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function FormularioTaxa({
  metodo,
  taxa,
  linha,
  aoFechar,
}: {
  metodo: string;
  taxa: TaxaPlataforma | null;
  linha: LinhaTaxaMetodo | null;
  aoFechar: () => void;
}) {
  const [estado, acao, pendente] = useActionState(salvarTaxaPlataforma, ESTADO_INICIAL);

  return (
    <form
      action={acao}
      className="rounded-lg border border-borda-forte bg-superficie px-5 py-4"
    >
      <input type="hidden" name="metodo" value={metodo} />

      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="font-semibold text-tinta">{rotuloMetodo(metodo)}</p>
        <button
          type="button"
          onClick={aoFechar}
          className="rounded-lg border border-borda-forte px-3 py-1.5 text-sm text-tinta-media"
        >
          Fechar
        </button>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-tinta">
            Percentual sobre a venda
          </span>
          <input
            name="percentual"
            defaultValue={taxa?.percentual ?? 0}
            inputMode="decimal"
            className="w-full rounded-lg border border-borda-forte px-3 py-2 text-right text-lg"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-tinta">
            Valor fixo por transação
          </span>
          <input
            name="valorFixo"
            defaultValue={taxa?.valorFixo ?? 0}
            inputMode="decimal"
            className="w-full rounded-lg border border-borda-forte px-3 py-2 text-right text-lg"
          />
        </label>
      </div>

      {linha && linha.base > 0 && (
        <p className="mt-3 rounded-lg bg-fundo px-4 py-3 text-sm text-tinta-media">
          No mês, {linha.pedidosNaBase.toLocaleString("pt-BR")} pedido(s) entraram
          na base e somaram <span className="numerico">{moeda(linha.base)}</span>
          {linha.taxa?.base === "bruto" && linha.pedidosNaBase !== linha.pedidos && (
            <> &mdash; inclui {(linha.pedidosNaBase - linha.pedidos).toLocaleString("pt-BR")} não pago(s)</>
          )}.
          Do total cobrado, <span className="numerico">{moeda(linha.parcelaPercentual)}</span>{" "}
          veio do percentual e <span className="numerico">{moeda(linha.parcelaFixa)}</span>{" "}
          do valor fixo &mdash; carga efetiva de{" "}
          <strong className="numerico text-tinta">{percentual(linha.cargaEfetiva)}</strong>.
        </p>
      )}

      <label className="mt-4 block">
        <span className="mb-1 block text-sm font-medium text-tinta">
          A taxa incide sobre
        </span>
        <select
          name="base"
          defaultValue={taxa?.base ?? "bruto"}
          className="w-full rounded-lg border border-borda-forte bg-superficie px-3 py-2 text-sm font-medium text-tinta"
        >
          {(["bruto", "recebido"] as const).map((b) => (
            <option key={b} value={b}>
              {ROTULO_BASE_TAXA[b]}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-tinta-media">
          {EXPLICACAO_BASE_TAXA[taxa?.base ?? "bruto"]}
        </span>
      </label>

      <label className="mt-4 block">
        <span className="mb-1 block text-sm font-medium text-tinta">Observação</span>
        <input
          name="observacao"
          defaultValue={taxa?.observacao ?? ""}
          className="w-full rounded-lg border border-borda-forte px-3 py-2 text-sm"
        />
      </label>

      <div className="mt-4 space-y-2">
        <label className="flex items-center gap-2 text-sm text-tinta">
          <input type="checkbox" name="ativa" defaultChecked={taxa?.ativa ?? true} />
          Cobrar esta taxa no cálculo
        </label>
        <label className="flex items-center gap-2 text-sm text-tinta">
          <input
            type="checkbox"
            name="confirmadaNaFatura"
            defaultChecked={taxa?.confirmadaNaFatura ?? false}
          />
          Já conferi este valor na fatura
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pendente}
          className="rounded-lg bg-tinta px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pendente ? "Salvando..." : "Salvar taxa"}
        </button>
        {estado.mensagem && (
          <span className={`text-sm ${estado.ok ? "text-real" : "text-naopago"}`}>
            {estado.mensagem}
          </span>
        )}
      </div>
    </form>
  );
}
