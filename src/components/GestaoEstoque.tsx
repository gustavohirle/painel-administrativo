"use client";

import { useActionState, useMemo, useState } from "react";

import { registrarContagem } from "@/app/estoque/actions";
import { data as formatarData, inteiro } from "@/lib/format";
import { ESTADO_INICIAL } from "@/types/formulario";
import type { SaldoEstoque } from "@/types/produto";

const ROTULO_SITUACAO: Record<SaldoEstoque["situacao"], string> = {
  negativo: "negativo",
  critico: "critico",
  baixo: "baixo",
  sem_contagem: "sem contagem",
  saudavel: "saudavel",
};

const COR_SITUACAO: Record<SaldoEstoque["situacao"], string> = {
  negativo: "bg-naopago text-white",
  critico: "bg-alerta-fundo text-naopago border border-alerta-borda",
  baixo: "bg-fundo text-reembolsado border border-borda-forte",
  sem_contagem: "bg-fundo text-tinta-fraca border border-borda",
  saudavel: "bg-real-claro text-real",
};

export function GestaoEstoque({ saldos }: { saldos: SaldoEstoque[] }) {
  const [busca, setBusca] = useState("");
  const [somenteAlertas, setSomenteAlertas] = useState(false);
  const [contando, setContando] = useState<SaldoEstoque | null>(null);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return saldos.filter((saldo) => {
      if (
        somenteAlertas &&
        saldo.situacao !== "negativo" &&
        saldo.situacao !== "critico" &&
        saldo.situacao !== "baixo" &&
        saldo.situacao !== "sem_contagem"
      ) {
        return false;
      }
      if (!termo) return true;
      return (
        saldo.nome.toLowerCase().includes(termo) ||
        (saldo.sku ?? "").toLowerCase().includes(termo)
      );
    });
  }, [saldos, busca, somenteAlertas]);

  const precisamAtencao = saldos.filter(
    (s) => s.situacao === "negativo" || s.situacao === "critico",
  );

  return (
    <div className="space-y-5">
      {precisamAtencao.length > 0 && (
        <div className="rounded-lg border border-alerta-borda bg-alerta-fundo px-5 py-4">
          <p className="text-sm font-semibold text-naopago">
            {precisamAtencao.length} item(ns) precisam de reposicao agora
          </p>
          <p className="mt-1 text-sm leading-relaxed text-tinta-media">
            Saldo negativo indica que a contagem esta desatualizada ou que saiu
            mais do que havia registrado. Saldo critico e o que cobre menos de
            uma semana no ritmo de venda atual.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 rounded-lg border border-borda-forte bg-superficie px-4 py-2">
          <input
            type="checkbox"
            checked={somenteAlertas}
            onChange={(e) => setSomenteAlertas(e.target.checked)}
            className="h-4 w-4 accent-[var(--color-tinta)]"
          />
          <span className="text-sm font-medium text-tinta">
            So o que precisa de atencao
          </span>
        </label>

        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou SKU"
          className="min-w-[240px] flex-1 rounded-lg border border-borda-forte bg-superficie px-4 py-2 text-sm text-tinta placeholder:text-tinta-fraca"
        />
      </div>

      {contando && (
        <FormularioContagem
          item={contando}
          aoFechar={() => setContando(null)}
        />
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-borda-forte text-left text-xs uppercase tracking-wider text-tinta-fraca">
              <th className="py-2.5 pr-4 font-semibold">Produto</th>
              <th className="py-2.5 pr-4 text-right font-semibold">
                Ultima contagem
              </th>
              <th className="py-2.5 pr-4 text-right font-semibold">
                Saiu desde entao
              </th>
              <th className="py-2.5 pr-4 text-right font-semibold">Saldo atual</th>
              <th className="py-2.5 pr-4 text-right font-semibold">
                Vendas no mes
              </th>
              <th className="py-2.5 pr-4 text-right font-semibold">Cobertura</th>
              <th className="py-2.5 pr-4 font-semibold">Situacao</th>
              <th className="py-2.5 text-right font-semibold">Acao</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((saldo) => (
              <tr
                key={saldo.chave}
                className={`border-b border-borda ${
                  saldo.situacao === "negativo" || saldo.situacao === "critico"
                    ? "bg-alerta-fundo"
                    : ""
                }`}
              >
                <td className="py-3 pr-4">
                  <p className="font-semibold text-tinta">{saldo.nome}</p>
                  {saldo.sku && (
                    <p className="numerico text-xs text-tinta-fraca">{saldo.sku}</p>
                  )}
                </td>
                <td className="numerico py-3 pr-4 text-right text-tinta-media">
                  {saldo.quantidadeContada === null ? (
                    "—"
                  ) : (
                    <>
                      {inteiro(saldo.quantidadeContada)}
                      <span className="block text-xs text-tinta-fraca">
                        {saldo.dataContagem ? formatarData(saldo.dataContagem) : ""}
                      </span>
                    </>
                  )}
                </td>
                <td className="numerico py-3 pr-4 text-right text-tinta-media">
                  {saldo.quantidadeContada === null
                    ? "—"
                    : `-${inteiro(saldo.vendidoDesdeContagem)}`}
                </td>
                <td
                  className={`numerico py-3 pr-4 text-right text-lg font-semibold ${
                    saldo.saldoAtual === null
                      ? "text-tinta-fraca"
                      : saldo.saldoAtual < 0
                        ? "text-naopago"
                        : "text-tinta"
                  }`}
                >
                  {saldo.saldoAtual === null ? "—" : inteiro(saldo.saldoAtual)}
                </td>
                <td className="numerico py-3 pr-4 text-right text-tinta-media">
                  {inteiro(saldo.vendidoNoPeriodo)}
                </td>
                <td className="numerico py-3 pr-4 text-right text-tinta-media">
                  {saldo.diasDeCobertura === null
                    ? "—"
                    : `${Math.max(0, Math.round(saldo.diasDeCobertura))} dias`}
                </td>
                <td className="py-3 pr-4">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${COR_SITUACAO[saldo.situacao]}`}
                  >
                    {ROTULO_SITUACAO[saldo.situacao]}
                  </span>
                </td>
                <td className="py-3 text-right">
                  <button
                    type="button"
                    onClick={() =>
                      setContando(contando?.chave === saldo.chave ? null : saldo)
                    }
                    className="rounded-md border border-borda-forte bg-superficie px-3 py-1.5 text-sm font-medium text-tinta hover:bg-fundo"
                  >
                    Contar
                  </button>
                </td>
              </tr>
            ))}

            {visiveis.length === 0 && (
              <tr>
                <td colSpan={8} className="py-10 text-center text-tinta-media">
                  Nenhum item encontrado com esse filtro.
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

function FormularioContagem({
  item,
  aoFechar,
}: {
  item: SaldoEstoque;
  aoFechar: () => void;
}) {
  const [estado, acao, salvando] = useActionState(registrarContagem, ESTADO_INICIAL);
  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <div className="rounded-xl border-2 border-tinta bg-superficie p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-tinta">{item.nome}</h3>
          <p className="text-sm text-tinta-media">
            {item.saldoAtual === null
              ? "Nunca contado."
              : `Saldo calculado hoje: ${inteiro(item.saldoAtual)} un.`}
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
        <input type="hidden" name="chave" value={item.chave} />
        <input type="hidden" name="nome" value={item.nome} />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <label className="block">
            <span className="text-sm font-medium text-tinta">
              Quantidade contada
            </span>
            <input
              name="quantidade"
              type="number"
              min={0}
              required
              autoFocus
              defaultValue={item.saldoAtual ?? 0}
              className="numerico mt-1 w-full rounded-lg border border-borda-forte bg-superficie px-3 py-2 text-right text-lg font-semibold text-tinta focus:border-tinta focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-tinta">Data da contagem</span>
            <input
              name="dataContagem"
              type="date"
              max={hoje}
              defaultValue={hoje}
              required
              className="mt-1 w-full rounded-lg border border-borda-forte bg-superficie px-3 py-2 text-tinta focus:border-tinta focus:outline-none"
            />
          </label>

          <label className="block xl:col-span-2">
            <span className="text-sm font-medium text-tinta">
              Observacao <span className="text-tinta-fraca">(opcional)</span>
            </span>
            <input
              name="observacao"
              className="mt-1 w-full rounded-lg border border-borda-forte bg-superficie px-3 py-2 text-tinta focus:border-tinta focus:outline-none"
            />
          </label>
        </div>

        <p className="text-xs leading-relaxed text-tinta-fraca">
          O painel guarda a contagem e a data, nao um saldo. O saldo atual e
          sempre a contagem menos o que saiu depois dela -- inclusive o que saiu
          dentro de kits. Recontar nao apaga o historico.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={salvando}
            className="rounded-lg bg-tinta px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {salvando ? "Registrando..." : "Registrar contagem"}
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
