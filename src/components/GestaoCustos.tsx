"use client";

import { Fragment, useActionState, useMemo, useState } from "react";

import { removerCusto, salvarCusto } from "@/app/custos/actions";
import { ESTADO_INICIAL } from "@/types/formulario";
import { inteiro, moeda, percentual, razaoSegura } from "@/lib/format";
import type { CustoProduto } from "@/types/dominio";

/** Uma linha da tela: sempre no nivel da variante, que e onde o custo muda. */
export interface ItemCusteavel {
  produtoId: number;
  varianteId: number;
  nome: string;
  sku: string | null;
  unidadesVendidas: number;
  precoMedio: number;
  receita: number;
  custoUnitario: number | null;
}

interface GestaoCustosProps {
  itens: ItemCusteavel[];
  custos: CustoProduto[];
  /**
   * Quem nao ve financeiro cadastra o custo, mas nao ve preco de venda nem
   * margem: essas duas colunas dizem quanto a empresa ganha, nao quanto o
   * produto custa.
   */
  podeVerFinanceiro: boolean;
}

export function GestaoCustos({
  itens,
  custos,
  podeVerFinanceiro,
}: GestaoCustosProps) {
  const [filtro, setFiltro] = useState<"todos" | "semCusto">("todos");
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<ItemCusteavel | null>(null);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return itens.filter((item) => {
      if (filtro === "semCusto" && item.custoUnitario !== null) return false;
      if (!termo) return true;
      return (
        item.nome.toLowerCase().includes(termo) ||
        (item.sku ?? "").toLowerCase().includes(termo)
      );
    });
  }, [itens, filtro, busca]);

  const semCusto = itens.filter((i) => i.custoUnitario === null);
  const receitaSemCusto = semCusto.reduce((s, i) => s + i.receita, 0);
  const receitaTotal = itens.reduce((s, i) => s + i.receita, 0);

  // Colunas: Produto, Unidades, [Preco medio], Custo, [Margem], Acao.
  const colunas = podeVerFinanceiro ? 6 : 4;

  function fichaDe(item: ItemCusteavel): CustoProduto | undefined {
    return custos.find(
      (c) =>
        c.produtoId === item.produtoId &&
        (c.varianteId === item.varianteId || c.varianteId === null),
    );
  }

  return (
    <div className="space-y-5">
      {semCusto.length > 0 && (
        <div className="rounded-lg border border-alerta-borda bg-alerta-fundo px-5 py-4">
          <p className="text-sm font-semibold text-naopago">
            {semCusto.length} item(ns) sem custo cadastrado
          </p>
          <p className="mt-1 text-sm text-tinta-media">
            {podeVerFinanceiro ? (
              <>
                Representam{" "}
                <strong className="numerico text-tinta">
                  {moeda(receitaSemCusto)}
                </strong>{" "}
                de receita no mes, ou{" "}
                <strong className="numerico text-tinta">
                  {percentual(razaoSegura(receitaSemCusto, receitaTotal))}
                </strong>{" "}
                do total vendido. Enquanto nao forem informados, esses itens ficam
                de fora do calculo de lucro.
              </>
            ) : (
              <>
                Enquanto o custo desses itens nao for informado, eles ficam de
                fora do calculo de resultado da empresa.
              </>
            )}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex overflow-hidden rounded-lg border border-borda-forte">
          {(
            [
              ["todos", `Todos (${itens.length})`],
              ["semCusto", `Sem custo (${semCusto.length})`],
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
          placeholder="Buscar por nome ou SKU"
          className="min-w-[240px] flex-1 rounded-lg border border-borda-forte bg-superficie px-4 py-2 text-sm text-tinta placeholder:text-tinta-fraca"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-borda-forte text-left text-xs uppercase tracking-wider text-tinta-fraca">
              <th className="py-2.5 pr-4 font-semibold">Produto</th>
              <th className="py-2.5 pr-4 text-right font-semibold">Unidades</th>
              {podeVerFinanceiro && (
                <th className="py-2.5 pr-4 text-right font-semibold">Preco medio</th>
              )}
              <th className="py-2.5 pr-4 text-right font-semibold">Custo unitario</th>
              {podeVerFinanceiro && (
                <th className="py-2.5 pr-4 text-right font-semibold">Margem</th>
              )}
              <th className="py-2.5 text-right font-semibold">Acao</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((item) => {
              const margem =
                item.custoUnitario === null
                  ? null
                  : item.precoMedio - item.custoUnitario;
              const aberto =
                editando?.produtoId === item.produtoId &&
                editando?.varianteId === item.varianteId;

              return (
                <Fragment key={`${item.produtoId}-${item.varianteId}`}>
                  <tr
                    className={`border-b border-borda ${
                      item.custoUnitario === null ? "bg-alerta-fundo" : ""
                    }`}
                  >
                    <td className="py-3 pr-4">
                      <p className="font-semibold text-tinta">{item.nome}</p>
                      {item.sku && (
                        <p className="numerico text-xs text-tinta-fraca">{item.sku}</p>
                      )}
                    </td>
                    <td className="numerico py-3 pr-4 text-right text-tinta-media">
                      {inteiro(item.unidadesVendidas)}
                    </td>
                    {podeVerFinanceiro && (
                      <td className="numerico py-3 pr-4 text-right text-tinta-media">
                        {moeda(item.precoMedio)}
                      </td>
                    )}
                    <td className="numerico py-3 pr-4 text-right">
                      {item.custoUnitario === null ? (
                        <span className="text-xs font-semibold uppercase text-naopago">
                          nao cadastrado
                        </span>
                      ) : (
                        <span className="text-tinta">{moeda(item.custoUnitario)}</span>
                      )}
                    </td>
                    {podeVerFinanceiro && (
                      <td className="numerico py-3 pr-4 text-right font-semibold">
                        {margem === null ? (
                          <span className="text-tinta-fraca">—</span>
                        ) : (
                          <span className="text-real">
                            {percentual(razaoSegura(margem, item.precoMedio))}
                          </span>
                        )}
                      </td>
                    )}
                    <td className="py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setEditando(aberto ? null : item)}
                        className="rounded-md border border-borda-forte bg-superficie px-3 py-1.5 text-sm font-medium text-tinta hover:bg-fundo"
                      >
                        {aberto
                          ? "Fechar"
                          : item.custoUnitario === null
                            ? "Cadastrar"
                            : "Editar"}
                      </button>
                    </td>
                  </tr>

                  {/*
                    O formulario abre AQUI, na linha logo abaixo do item.
                    Antes ele ficava depois da tabela inteira: com 47 produtos,
                    clicar em "Editar" parecia nao fazer nada, porque o
                    formulario abria fora da tela.
                  */}
                  {aberto && (
                    <tr>
                      <td colSpan={colunas} className="p-0 pb-4">
                        <FormularioCusto
                          item={item}
                          ficha={fichaDe(item)}
                          podeVerFinanceiro={podeVerFinanceiro}
                          aoFechar={() => setEditando(null)}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}

            {visiveis.length === 0 && (
              <tr>
                <td colSpan={colunas} className="py-10 text-center text-tinta-media">
                  Nenhum produto encontrado com esse filtro.
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

function FormularioCusto({
  item,
  ficha,
  podeVerFinanceiro,
  aoFechar,
}: {
  item: ItemCusteavel;
  ficha: CustoProduto | undefined;
  podeVerFinanceiro: boolean;
  aoFechar: () => void;
}) {
  const [estado, acaoSalvar, salvando] = useActionState(salvarCusto, ESTADO_INICIAL);
  const [estadoRemocao, acaoRemover, removendo] = useActionState(
    removerCusto,
    ESTADO_INICIAL,
  );

  // Espelha os campos para mostrar o total enquanto o dono digita.
  const [campos, setCampos] = useState({
    custoMateriaPrima: ficha?.custoMateriaPrima ?? 0,
    custoEmbalagem: ficha?.custoEmbalagem ?? 0,
    custoMaoDeObra: ficha?.custoMaoDeObra ?? 0,
    custoIndireto: ficha?.custoIndireto ?? 0,
  });

  const total =
    campos.custoMateriaPrima +
    campos.custoEmbalagem +
    campos.custoMaoDeObra +
    campos.custoIndireto;
  const margem = item.precoMedio - total;

  const linhas = [
    ["custoMateriaPrima", "Materia-prima"],
    ["custoEmbalagem", "Embalagem"],
    ["custoMaoDeObra", "Mao de obra"],
    ["custoIndireto", "Custo indireto (rateio)"],
  ] as const;

  return (
    <div className="rounded-xl border-2 border-tinta bg-superficie p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-tinta">{item.nome}</h3>
          <p className="text-sm text-tinta-media">
            Custo por unidade fabricada.
            {podeVerFinanceiro && (
              <>
                {" "}
                Preco medio de venda:{" "}
                <strong className="numerico text-tinta">
                  {moeda(item.precoMedio)}
                </strong>
              </>
            )}
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

      <form action={acaoSalvar} className="space-y-5">
        <input type="hidden" name="id" value={ficha?.id ?? ""} />
        <input type="hidden" name="produtoId" value={item.produtoId} />
        <input type="hidden" name="varianteId" value={item.varianteId} />
        <input type="hidden" name="sku" value={item.sku ?? ""} />
        <input type="hidden" name="nome" value={item.nome} />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {linhas.map(([campo, rotulo]) => (
            <label key={campo} className="block">
              <span className="text-sm font-medium text-tinta">{rotulo}</span>
              <div className="mt-1 flex items-center gap-2 rounded-lg border border-borda-forte bg-superficie px-3 py-2 focus-within:border-tinta">
                <span className="text-sm font-medium text-tinta-fraca">R$</span>
                <input
                  name={campo}
                  inputMode="decimal"
                  defaultValue={String(campos[campo]).replace(".", ",")}
                  onChange={(e) => {
                    const n = Number(e.target.value.replace(",", "."));
                    setCampos((c) => ({
                      ...c,
                      [campo]: Number.isFinite(n) ? n : 0,
                    }));
                  }}
                  className="numerico w-full bg-transparent text-right text-lg font-semibold text-tinta outline-none"
                />
              </div>
            </label>
          ))}
        </div>

        <div
          className={`grid gap-4 rounded-lg border border-borda bg-fundo px-5 py-4 ${
            podeVerFinanceiro ? "sm:grid-cols-3" : ""
          }`}
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-tinta-fraca">
              Custo total por unidade
            </p>
            <p className="numerico mt-1 text-2xl font-semibold text-tinta">
              {moeda(total)}
            </p>
          </div>

          {podeVerFinanceiro && (
            <>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-tinta-fraca">
                  Margem por unidade
                </p>
                <p
                  className="numerico mt-1 text-2xl font-semibold"
                  style={{
                    color: margem >= 0 ? "var(--color-real)" : "var(--color-naopago)",
                  }}
                >
                  {moeda(margem)}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-tinta-fraca">
                  Margem percentual
                </p>
                <p
                  className="numerico mt-1 text-2xl font-semibold"
                  style={{
                    color: margem >= 0 ? "var(--color-real)" : "var(--color-naopago)",
                  }}
                >
                  {percentual(razaoSegura(margem, item.precoMedio))}
                </p>
              </div>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={salvando}
            className="rounded-lg bg-tinta px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {salvando ? "Salvando..." : "Salvar custo"}
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

      {ficha && (
        <form action={acaoRemover} className="mt-4 border-t border-borda pt-4">
          <input type="hidden" name="id" value={ficha.id} />
          <button
            type="submit"
            disabled={removendo}
            className="text-sm font-medium text-naopago hover:underline disabled:opacity-50"
          >
            {removendo ? "Removendo..." : "Remover esta ficha de custo"}
          </button>
        </form>
      )}
    </div>
  );
}
