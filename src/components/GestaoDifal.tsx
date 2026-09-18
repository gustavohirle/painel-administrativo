"use client";

import { Fragment, useActionState, useMemo, useState } from "react";

import { salvarAliquotaEstadual } from "@/app/difal/actions";
import { inteiro, moeda, percentual, razaoSegura } from "@/lib/format";
import { ESTADO_INICIAL } from "@/types/formulario";
import type { AliquotaEstado } from "@/types/fiscal";
import type { LinhaEstado } from "@/lib/difal";

interface GestaoDifalProps {
  aliquotas: AliquotaEstado[];
  /** Vendas do mes por estado, para mostrar o que cada aliquota move. */
  porEstado: LinhaEstado[];
  ufOrigem: string;
}

/*
 * Cadastro das aliquotas internas, uma por estado.
 *
 * A tabela une duas coisas: o cadastro editavel e o que ele produziu no mes.
 * Separar em duas telas obrigaria a ir e voltar para responder "quanto muda se
 * eu corrigir Sao Paulo" -- que e a pergunta que o dono vai fazer.
 */
export function GestaoDifal({ aliquotas, porEstado, ufOrigem }: GestaoDifalProps) {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"comVenda" | "todos" | "aConfirmar">(
    "comVenda",
  );
  const [editando, setEditando] = useState<string | null>(null);

  const vendasPorUF = useMemo(
    () => new Map(porEstado.map((l) => [l.uf, l])),
    [porEstado],
  );

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return aliquotas.filter((a) => {
      const venda = vendasPorUF.get(a.uf);
      if (filtro === "comVenda" && !venda) return false;
      if (filtro === "aConfirmar" && a.confirmadoPeloContador) return false;
      if (!termo) return true;
      return (
        a.uf.toLowerCase().includes(termo) || a.nome.toLowerCase().includes(termo)
      );
    });
  }, [aliquotas, vendasPorUF, filtro, busca]);

  const comVenda = aliquotas.filter((a) => vendasPorUF.has(a.uf));
  const aConfirmar = aliquotas.filter((a) => !a.confirmadoPeloContador);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex overflow-hidden rounded-lg border border-borda-forte">
          {(
            [
              ["comVenda", `Com venda no mes (${comVenda.length})`],
              ["todos", `Todos os estados (${aliquotas.length})`],
              ["aConfirmar", `A confirmar (${aConfirmar.length})`],
            ] as const
          ).map(([valor, rotulo]) => (
            <button
              key={valor}
              type="button"
              onClick={() => setFiltro(valor)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                filtro === valor
                  ? "bg-tinta text-white"
                  : "bg-superficie text-tinta-media hover:text-tinta"
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>

        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por estado ou sigla"
          className="min-w-[220px] flex-1 rounded-lg border border-borda-forte bg-superficie px-4 py-2 text-sm text-tinta placeholder:text-tinta-fraca"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="tabela-ancorada w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-borda-forte text-left text-xs uppercase tracking-wider text-tinta-fraca">
              <th className="py-2.5 pr-4 font-semibold">Estado</th>
              <th className="py-2.5 pr-4 text-right font-semibold">Interna</th>
              <th className="py-2.5 pr-4 text-right font-semibold">Interestadual</th>
              <th className="py-2.5 pr-4 text-right font-semibold">DIFAL</th>
              <th className="py-2.5 pr-4 text-right font-semibold">Pedidos</th>
              <th className="py-2.5 pr-4 text-right font-semibold">Base</th>
              <th className="py-2.5 pr-4 text-right font-semibold">
                DIFAL no mês
              </th>
              <th className="py-2.5 text-right font-semibold">Ação</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((aliquota) => {
              const venda = vendasPorUF.get(aliquota.uf);
              const aberto = editando === aliquota.uf;
              const interna = aliquota.uf === ufOrigem.toUpperCase();
              const interestadual = venda?.aliquotaInterestadual ?? 12;
              const diferenca = interna
                ? 0
                : Math.max(0, aliquota.aliquotaInterna - interestadual);

              return (
                <Fragment key={aliquota.uf}>
                  <tr
                    className={`border-b border-borda ${aliquota.ativo ? "" : "opacity-55"}`}
                  >
                    <td className="py-3 pr-4">
                      <p className="font-semibold text-tinta">
                        {aliquota.uf}
                        <span className="ml-2 text-xs font-normal text-tinta-media">
                          {aliquota.nome}
                        </span>
                      </p>
                      {interna && (
                        <p className="text-xs text-tinta-fraca">
                          estado de origem: venda interna, sem DIFAL
                        </p>
                      )}
                    </td>

                    <td className="numerico py-3 pr-4 text-right font-semibold text-tinta">
                      {percentual(aliquota.aliquotaInterna / 100, 2)}
                    </td>
                    <td className="numerico py-3 pr-4 text-right text-tinta-media">
                      {interna ? "—" : percentual(interestadual / 100, 0)}
                    </td>
                    <td
                      className={`numerico py-3 pr-4 text-right font-semibold ${
                        diferenca > 0 ? "text-imposto" : "text-tinta-fraca"
                      }`}
                    >
                      {interna ? "—" : percentual(diferenca / 100, 2)}
                    </td>

                    <td className="numerico py-3 pr-4 text-right text-tinta-media">
                      {venda ? inteiro(venda.pedidos) : "—"}
                    </td>
                    <td className="numerico py-3 pr-4 text-right text-tinta-media">
                      {venda ? moeda(venda.base) : "—"}
                    </td>
                    <td className="numerico py-3 pr-4 text-right font-semibold text-tinta">
                      {venda && venda.difal > 0 ? moeda(venda.difal) : "—"}
                    </td>

                    <td className="py-3 text-right">
                      <span className="flex items-center justify-end gap-2">
                        {!aliquota.confirmadoPeloContador && (
                          <span
                            title="A alíquota deste estado ainda não foi confirmada com o contador."
                            className="rounded-full border border-alerta-borda bg-alerta-fundo px-2 py-0.5 text-xs font-semibold text-naopago"
                          >
                            a confirmar
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => setEditando(aberto ? null : aliquota.uf)}
                          className="rounded-md border border-borda-forte bg-superficie px-3 py-1.5 text-sm font-medium text-tinta hover:bg-fundo"
                        >
                          {aberto ? "Fechar" : "Editar"}
                        </button>
                      </span>
                    </td>
                  </tr>

                  {aberto && (
                    <tr>
                      <td colSpan={8} className="p-0 pb-4">
<div className="linha-de-edicao">
                        <FormularioAliquota
                          aliquota={aliquota}
                          interestadual={interestadual}
                          interna={interna}
                          aoFechar={() => setEditando(null)}
                        />
                      </div>
</td>
                    </tr>
                  )}
                </Fragment>
              );
            })}

            {visiveis.length === 0 && (
              <tr>
                <td colSpan={8} className="py-10 text-center text-tinta-media">
                  Nenhum estado encontrado com esse filtro.
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

function FormularioAliquota({
  aliquota,
  interestadual,
  interna,
  aoFechar,
}: {
  aliquota: AliquotaEstado;
  interestadual: number;
  interna: boolean;
  aoFechar: () => void;
}) {
  const [estado, acao, salvando] = useActionState(
    salvarAliquotaEstadual,
    ESTADO_INICIAL,
  );
  const [valor, setValor] = useState(aliquota.aliquotaInterna);

  const diferenca = interna ? 0 : Math.max(0, valor - interestadual);

  return (
    <div className="rounded-xl border-2 border-tinta bg-superficie p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-tinta">
            {aliquota.nome} ({aliquota.uf})
          </h3>
          <p className="text-sm text-tinta-media">
            {interna
              ? "Estado de origem da fábrica: a venda é interna e não gera DIFAL."
              : `Aliquota interestadual aplicada: ${percentual(interestadual / 100, 0)}.`}
          </p>
        </div>
        <button
          type="button"
          onClick={aoFechar}
          className="rounded-md border border-borda-forte px-3 py-1.5 text-sm font-medium text-tinta-media hover:text-tinta"
        >
          Fechar
        </button>
      </div>

      <form action={acao} className="space-y-5">
        <input type="hidden" name="uf" value={aliquota.uf} />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <label className="block">
            <span className="text-sm font-medium text-tinta">
              Alíquota interna do estado
            </span>
            <div className="mt-1 flex items-center gap-2 rounded-lg border border-borda-forte bg-superficie px-3 py-2 focus-within:border-tinta">
              <input
                name="aliquotaInterna"
                inputMode="decimal"
                defaultValue={String(aliquota.aliquotaInterna).replace(".", ",")}
                onChange={(e) => {
                  const n = Number(e.target.value.replace(",", "."));
                  setValor(Number.isFinite(n) ? n : 0);
                }}
                className="numerico w-full bg-transparent text-right text-lg font-semibold text-tinta outline-none"
              />
              <span className="text-sm font-medium text-tinta-fraca">%</span>
            </div>
          </label>

          <div className="rounded-lg border border-borda bg-fundo px-4 py-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-tinta-fraca">
              DIFAL resultante
            </p>
            <p className="numerico mt-1 text-2xl font-semibold text-imposto">
              {interna ? "—" : percentual(diferenca / 100, 2)}
            </p>
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-borda bg-fundo px-5 py-4">
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              name="ativo"
              defaultChecked={aliquota.ativo}
              className="mt-0.5 h-4 w-4 accent-[var(--color-tinta)]"
            />
            <span>
              <span className="block text-sm font-medium text-tinta">
                Ativo (entra no cálculo do DIFAL)
              </span>
              <span className="block text-xs text-tinta-media">
                Desmarcado, as vendas para este estado continuam aparecendo, mas
                sem gerar DIFAL.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              name="confirmadoPeloContador"
              defaultChecked={aliquota.confirmadoPeloContador}
              className="mt-0.5 h-4 w-4 accent-[var(--color-tinta)]"
            />
            <span>
              <span className="block text-sm font-medium text-tinta">
                Alíquota confirmada pelo contador
              </span>
              <span className="block text-xs text-tinta-media">
                Enquanto estiver desmarcado, o painel avisa que o número ainda é
                o valor semeado, não um confirmado.
              </span>
            </span>
          </label>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-tinta">
            Observação <span className="text-tinta-fraca">(opcional)</span>
          </span>
          <textarea
            name="observacao"
            rows={2}
            defaultValue={aliquota.observacao ?? ""}
            className="mt-1 w-full rounded-lg border border-borda-forte bg-superficie px-3 py-2 text-tinta focus:border-tinta focus:outline-none"
          />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={salvando}
            className="rounded-lg bg-tinta px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {salvando ? "Salvando..." : "Salvar alíquota"}
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
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Barra horizontal com a participacao de cada estado no DIFAL do mes. */
export function DifalPorEstado({
  porEstado,
  total,
}: {
  porEstado: LinhaEstado[];
  total: number;
}) {
  /*
   * Aqui a ordem por valor E o assunto: o cartao promete "os maiores destinos"
   * e corta nos 12 primeiros. `porEstado` chega em ordem alfabetica (e o que
   * serve as tabelas de conferencia, ver `apurarDifal`), entao a barra ordena
   * por conta propria -- cortar 12 de uma lista alfabetica entregaria os
   * estados que comecam com A, nao os maiores.
   */
  const comDifal = porEstado
    .filter((l) => l.difal > 0)
    .sort((a, b) => b.difal - a.difal || b.base - a.base);
  if (comDifal.length === 0) {
    return (
      <p className="text-sm text-tinta-media">
        Nenhum DIFAL no mês. Ou as vendas foram todas dentro do estado de
        origem, ou as marcas estão no Simples Nacional -- optante não recolhe
        DIFAL como remetente.
      </p>
    );
  }

  const maior = Math.max(...comDifal.map((l) => l.difal), 1);

  return (
    <div className="space-y-2.5">
      {comDifal.slice(0, 12).map((linha) => (
        <div key={linha.uf} className="flex items-center gap-4">
          <span className="w-10 shrink-0 text-sm font-semibold text-tinta">
            {linha.uf}
          </span>
          <div className="h-6 flex-1 overflow-hidden rounded bg-fundo">
            <div
              className="h-full rounded bg-imposto"
              style={{ width: `${(linha.difal / maior) * 100}%` }}
            />
          </div>
          <span className="numerico w-32 shrink-0 text-right text-sm font-semibold text-tinta">
            {moeda(linha.difal)}
          </span>
          <span className="numerico w-16 shrink-0 text-right text-sm text-tinta-media">
            {percentual(razaoSegura(linha.difal, total))}
          </span>
        </div>
      ))}

      {comDifal.length > 12 && (
        <p className="pt-1 text-xs text-tinta-fraca">
          Mostrando os 12 maiores de {comDifal.length} estados com DIFAL no mês.
        </p>
      )}
    </div>
  );
}
