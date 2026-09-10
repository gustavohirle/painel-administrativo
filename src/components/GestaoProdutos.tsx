"use client";

import { useActionState, useMemo, useState } from "react";

import { removerProduto, salvarProduto } from "@/app/produtos/actions";
import { inteiro } from "@/lib/format";
import { ESTADO_INICIAL } from "@/types/formulario";
import type { Imposto } from "@/types/fiscal";
import type { ComponenteKit, Produto } from "@/types/produto";

/** Opcao selecionavel como componente de kit. */
export interface OpcaoComponente {
  chave: string;
  nome: string;
}

interface GestaoProdutosProps {
  produtos: Produto[];
  impostos: Imposto[];
  /** Unidades vendidas no mes, por chave. Ordena a lista pelo que importa. */
  vendasPorChave: Record<string, number>;
  podeVerFinanceiro: boolean;
}

export function GestaoProdutos({
  produtos,
  impostos,
  vendasPorChave,
  podeVerFinanceiro,
}: GestaoProdutosProps) {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "kits" | "semNcm">("todos");
  const [editando, setEditando] = useState<Produto | null | "novo">(null);

  const opcoes: OpcaoComponente[] = useMemo(
    () =>
      produtos
        .filter((p) => !p.ehKit)
        .map((p) => ({ chave: p.chave, nome: p.nome }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [produtos],
  );

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return produtos.filter((produto) => {
      if (filtro === "kits" && !produto.ehKit) return false;
      if (filtro === "semNcm" && produto.ncm) return false;
      if (!termo) return true;
      return (
        produto.nome.toLowerCase().includes(termo) ||
        (produto.sku ?? "").toLowerCase().includes(termo) ||
        (produto.ncm ?? "").includes(termo)
      );
    });
  }, [produtos, busca, filtro]);

  const kits = produtos.filter((p) => p.ehKit);
  const semNcm = produtos.filter((p) => !p.ncm);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex overflow-hidden rounded-lg border border-borda-forte">
          {(
            [
              ["todos", `Todos (${produtos.length})`],
              ["kits", `Kits (${kits.length})`],
              ["semNcm", `Sem NCM (${semNcm.length})`],
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
          placeholder="Buscar por nome, SKU ou NCM"
          className="min-w-[220px] flex-1 rounded-lg border border-borda-forte bg-superficie px-4 py-2 text-sm text-tinta placeholder:text-tinta-fraca"
        />

        <button
          type="button"
          onClick={() => setEditando(editando === "novo" ? null : "novo")}
          className="rounded-lg bg-tinta px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          {editando === "novo" ? "Cancelar" : "Novo produto"}
        </button>
      </div>

      {editando === "novo" && (
        <FormularioProduto
          produto={null}
          impostos={impostos}
          opcoes={opcoes}
          aoFechar={() => setEditando(null)}
        />
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-borda-forte text-left text-xs uppercase tracking-wider text-tinta-fraca">
              <th className="py-2.5 pr-4 font-semibold">Produto</th>
              <th className="py-2.5 pr-4 font-semibold">NCM</th>
              <th className="py-2.5 pr-4 font-semibold">Tipo</th>
              <th className="py-2.5 pr-4 font-semibold">Impostos marcados</th>
              {podeVerFinanceiro && (
                <th
                  className="py-2.5 pr-4 text-right font-semibold"
                  title="Para kit, quantos kits foram vendidos. Para item avulso, unidades que sairam, somando o que foi dentro de kit."
                >
                  Saidas no mes
                </th>
              )}
              <th className="py-2.5 text-right font-semibold">Acao</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((produto) => {
              const aberto = editando !== "novo" && editando?.id === produto.id;
              const marcados = impostos.filter((i) =>
                produto.impostosIds.includes(i.id),
              );

              return (
                <tr
                  key={produto.id}
                  className={`border-b border-borda ${produto.ativo ? "" : "opacity-60"}`}
                >
                  <td className="py-3 pr-4">
                    <p className="font-semibold text-tinta">{produto.nome}</p>
                    {produto.sku && (
                      <p className="numerico text-xs text-tinta-fraca">
                        {produto.sku}
                      </p>
                    )}
                  </td>
                  <td className="numerico py-3 pr-4 text-tinta-media">
                    {produto.ncm ?? (
                      <span className="text-xs font-semibold uppercase text-naopago">
                        nao informado
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    {produto.ehKit ? (
                      <span className="rounded-full bg-real-claro px-2.5 py-0.5 text-xs font-semibold text-real">
                        kit de {produto.componentes.length}
                      </span>
                    ) : (
                      <span className="text-xs text-tinta-media">avulso</span>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    {marcados.length === 0 ? (
                      <span className="text-xs text-tinta-fraca">nenhum</span>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {marcados.map((i) => (
                          <span
                            key={i.id}
                            className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                              i.ativo
                                ? "bg-fundo text-tinta"
                                : "bg-fundo text-tinta-fraca line-through"
                            }`}
                            title={
                              i.ativo
                                ? undefined
                                : "Imposto inativo no cadastro fiscal: nao entra no calculo."
                            }
                          >
                            {i.sigla}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                  {podeVerFinanceiro && (
                    <td className="numerico py-3 pr-4 text-right text-tinta-media">
                      {inteiro(vendasPorChave[produto.chave] ?? 0)}
                    </td>
                  )}
                  <td className="py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setEditando(aberto ? null : produto)}
                      className="rounded-md border border-borda-forte bg-superficie px-3 py-1.5 text-sm font-medium text-tinta hover:bg-fundo"
                    >
                      {aberto ? "Fechar" : "Editar"}
                    </button>
                  </td>
                </tr>
              );
            })}

            {visiveis.length === 0 && (
              <tr>
                <td
                  colSpan={podeVerFinanceiro ? 6 : 5}
                  className="py-10 text-center text-tinta-media"
                >
                  Nenhum produto encontrado com esse filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editando && editando !== "novo" && (
        <FormularioProduto
          produto={editando}
          impostos={impostos}
          opcoes={opcoes}
          aoFechar={() => setEditando(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function FormularioProduto({
  produto,
  impostos,
  opcoes,
  aoFechar,
}: {
  produto: Produto | null;
  impostos: Imposto[];
  opcoes: OpcaoComponente[];
  aoFechar: () => void;
}) {
  const [estado, acaoSalvar, salvando] = useActionState(salvarProduto, ESTADO_INICIAL);
  const [estadoRemocao, acaoRemover, removendo] = useActionState(
    removerProduto,
    ESTADO_INICIAL,
  );

  const [ehKit, setEhKit] = useState(produto?.ehKit ?? false);
  const [componentes, setComponentes] = useState<ComponenteKit[]>(
    produto?.componentes ?? [],
  );

  const porProduto = impostos.filter((i) => i.aplicacaoPorProduto);
  const globais = impostos.filter((i) => !i.aplicacaoPorProduto);

  function adicionarComponente() {
    const primeira = opcoes[0];
    if (!primeira) return;
    setComponentes((atual) => [
      ...atual,
      { chave: primeira.chave, nome: primeira.nome, quantidade: 1 },
    ]);
  }

  return (
    <div className="rounded-xl border-2 border-tinta bg-superficie p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-tinta">
            {produto ? produto.nome : "Novo produto"}
          </h3>
          {produto && (
            <p className="numerico text-xs text-tinta-fraca">
              Nuvemshop {produto.produtoId}
              {produto.varianteId !== null && ` / variante ${produto.varianteId}`}
            </p>
          )}
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
        <input type="hidden" name="id" value={produto?.id ?? ""} />
        <input type="hidden" name="origem" value={produto?.origem ?? "manual"} />
        <input
          type="hidden"
          name="componentes"
          value={JSON.stringify(ehKit ? componentes : [])}
        />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <label className="block xl:col-span-2">
            <span className="text-sm font-medium text-tinta">Nome</span>
            <input
              name="nome"
              required
              defaultValue={produto?.nome ?? ""}
              className="mt-1 w-full rounded-lg border border-borda-forte bg-superficie px-3 py-2 text-tinta focus:border-tinta focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-tinta">SKU</span>
            <input
              name="sku"
              defaultValue={produto?.sku ?? ""}
              className="numerico mt-1 w-full rounded-lg border border-borda-forte bg-superficie px-3 py-2 text-tinta focus:border-tinta focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-tinta">NCM</span>
            <input
              name="ncm"
              placeholder="3305.10.00"
              defaultValue={produto?.ncm ?? ""}
              className="numerico mt-1 w-full rounded-lg border border-borda-forte bg-superficie px-3 py-2 text-tinta focus:border-tinta focus:outline-none"
            />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-tinta">
              Id do produto na Nuvemshop{" "}
              <span className="text-tinta-fraca">(opcional)</span>
            </span>
            <input
              name="produtoId"
              inputMode="numeric"
              defaultValue={produto?.produtoId ?? ""}
              className="numerico mt-1 w-full rounded-lg border border-borda-forte bg-superficie px-3 py-2 text-tinta focus:border-tinta focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-tinta">
              Id da variante <span className="text-tinta-fraca">(opcional)</span>
            </span>
            <input
              name="varianteId"
              inputMode="numeric"
              defaultValue={produto?.varianteId ?? ""}
              className="numerico mt-1 w-full rounded-lg border border-borda-forte bg-superficie px-3 py-2 text-tinta focus:border-tinta focus:outline-none"
            />
          </label>
        </div>

        <p className="text-xs leading-relaxed text-tinta-fraca">
          Sao esses dois ids que ligam o cadastro as vendas. Deixando em branco,
          o produto recebe um id interno e fica cadastrado, mas nao casa com
          nenhum pedido ate os ids reais da Nuvemshop serem informados.
        </p>

        {/* --- Impostos --------------------------------------------------- */}
        <fieldset className="rounded-lg border border-borda bg-fundo px-5 py-4">
          <legend className="px-2 text-sm font-medium text-tinta">
            Impostos que incidem sobre este produto
          </legend>

          {porProduto.length === 0 ? (
            <p className="text-sm text-tinta-media">
              Nenhum imposto por produto cadastrado.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {porProduto.map((imposto) => (
                <label key={imposto.id} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    name="impostosIds"
                    value={imposto.id}
                    defaultChecked={produto?.impostosIds.includes(imposto.id) ?? true}
                    className="mt-0.5 h-4 w-4 accent-[var(--color-tinta)]"
                  />
                  <span>
                    <span className="block text-sm font-medium text-tinta">
                      {imposto.sigla}
                      {!imposto.ativo && (
                        <span className="ml-2 text-xs font-normal text-tinta-fraca">
                          (inativo no cadastro fiscal)
                        </span>
                      )}
                    </span>
                    <span className="block text-xs text-tinta-media">
                      {imposto.nome}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}

          {globais.length > 0 && (
            <p className="mt-4 border-t border-borda pt-3 text-xs leading-relaxed text-tinta-media">
              <strong className="text-tinta">
                {globais.map((i) => i.sigla).join(", ")}
              </strong>{" "}
              incidem sobre toda a receita e nao precisam ser marcados por
              produto. A guia unica do Simples tambem entra sobre o total.
            </p>
          )}
        </fieldset>

        {/* --- Kit --------------------------------------------------------- */}
        <fieldset className="rounded-lg border border-borda bg-fundo px-5 py-4">
          <legend className="px-2 text-sm font-medium text-tinta">
            Composicao
          </legend>

          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              name="ehKit"
              checked={ehKit}
              onChange={(e) => setEhKit(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[var(--color-tinta)]"
            />
            <span>
              <span className="block text-sm font-medium text-tinta">
                Este item e vendido como kit
              </span>
              <span className="block text-xs leading-relaxed text-tinta-media">
                A Nuvemshop entrega o kit como um produto so. Informando os
                componentes, o painel baixa o estoque de cada um e soma o custo
                de fabricacao real do kit.
              </span>
            </span>
          </label>

          {ehKit && (
            <div className="mt-4 space-y-3">
              {componentes.map((componente, indice) => (
                <div key={indice} className="flex flex-wrap items-center gap-2">
                  <select
                    value={componente.chave}
                    onChange={(e) => {
                      const opcao = opcoes.find((o) => o.chave === e.target.value);
                      setComponentes((atual) =>
                        atual.map((c, i) =>
                          i === indice && opcao
                            ? { ...c, chave: opcao.chave, nome: opcao.nome }
                            : c,
                        ),
                      );
                    }}
                    className="min-w-[260px] flex-1 rounded-lg border border-borda-forte bg-superficie px-3 py-2 text-sm text-tinta"
                  >
                    {opcoes.map((opcao) => (
                      <option key={opcao.chave} value={opcao.chave}>
                        {opcao.nome}
                      </option>
                    ))}
                  </select>

                  <input
                    type="number"
                    min={1}
                    value={componente.quantidade}
                    onChange={(e) =>
                      setComponentes((atual) =>
                        atual.map((c, i) =>
                          i === indice
                            ? { ...c, quantidade: Math.max(1, Number(e.target.value)) }
                            : c,
                        ),
                      )
                    }
                    className="numerico w-20 rounded-lg border border-borda-forte bg-superficie px-3 py-2 text-right text-sm font-semibold text-tinta"
                  />
                  <span className="text-sm text-tinta-media">un.</span>

                  <button
                    type="button"
                    onClick={() =>
                      setComponentes((atual) => atual.filter((_, i) => i !== indice))
                    }
                    className="rounded-md border border-borda-forte px-3 py-2 text-sm font-medium text-naopago hover:bg-superficie"
                  >
                    Remover
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={adicionarComponente}
                className="rounded-md border border-borda-forte bg-superficie px-3.5 py-2 text-sm font-medium text-tinta hover:bg-fundo"
              >
                Adicionar componente
              </button>

              {componentes.length === 0 && (
                <p className="text-sm text-naopago">
                  Um kit precisa de pelo menos um componente.
                </p>
              )}
            </div>
          )}
        </fieldset>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="ativo"
            defaultChecked={produto?.ativo ?? true}
            className="h-4 w-4 accent-[var(--color-tinta)]"
          />
          <span className="text-sm font-medium text-tinta">
            Produto ativo (entra nos calculos do painel)
          </span>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-tinta">
            Observacao <span className="text-tinta-fraca">(opcional)</span>
          </span>
          <textarea
            name="observacao"
            rows={2}
            defaultValue={produto?.observacao ?? ""}
            className="mt-1 w-full rounded-lg border border-borda-forte bg-superficie px-3 py-2 text-tinta focus:border-tinta focus:outline-none"
          />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={salvando}
            className="rounded-lg bg-tinta px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {salvando ? "Salvando..." : "Salvar produto"}
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

      {produto && (
        <form action={acaoRemover} className="mt-4 border-t border-borda pt-4">
          <input type="hidden" name="id" value={produto.id} />
          <button
            type="submit"
            disabled={removendo}
            className="text-sm font-medium text-naopago hover:underline disabled:opacity-50"
          >
            {removendo ? "Removendo..." : "Remover do cadastro"}
          </button>
        </form>
      )}
    </div>
  );
}
