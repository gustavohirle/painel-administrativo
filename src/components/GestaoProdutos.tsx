"use client";

import { Fragment, useActionState, useMemo, useState } from "react";

import { removerProduto, salvarProduto } from "@/app/produtos/actions";
import { REGIME_SEM_INFLUENCER } from "@/lib/config";
import { idsMarcadosPorPadrao } from "@/lib/impostos";
import { inteiro } from "@/lib/format";
import { ESTADO_INICIAL } from "@/types/formulario";
import type { Imposto, RegimeTributario } from "@/types/fiscal";
import type { ComponenteKit, Produto } from "@/types/produto";

/** Opcao selecionavel como componente de kit. */
export interface OpcaoComponente {
  chave: string;
  nome: string;
}

/** O que a tela precisa saber de cada influencer: quem e, e em que regime esta. */
export interface OpcaoInfluencer {
  id: string;
  nome: string;
  marca: string;
  regime: RegimeTributario;
}

const ROTULO_REGIME: Record<RegimeTributario, string> = {
  simples_nacional: "Simples Nacional",
  lucro_presumido: "Lucro Presumido",
  lucro_real: "Lucro Real",
};

interface GestaoProdutosProps {
  produtos: Produto[];
  impostos: Imposto[];
  influencers: OpcaoInfluencer[];
  /** Unidades vendidas no mes, por chave. Ordena a lista pelo que importa. */
  vendasPorChave: Record<string, number>;
  podeVerFinanceiro: boolean;
}

export function GestaoProdutos({
  produtos,
  impostos,
  influencers,
  vendasPorChave,
  podeVerFinanceiro,
}: GestaoProdutosProps) {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "kits" | "semDono">("todos");
  const [editando, setEditando] = useState<Produto | null | "novo">(null);
  // Cada loja e de um influencer: com mais de uma, filtrar por loja e filtrar por dono.
  const [loja, setLoja] = useState("");
  const lojas = useMemo(
    () =>
      [...new Set(produtos.map((p) => p.marca).filter((m): m is string => m !== null))].sort(
        (a, b) => a.localeCompare(b, "pt-BR"),
      ),
    [produtos],
  );

  // Kit tambem pode ser componente ("Combo: Kit Golden Hour + Colônia"); o
  // proprio item sai da lista dentro do formulario.
  const opcoes: OpcaoComponente[] = useMemo(
    () =>
      produtos
        .map((p) => ({ chave: p.chave, nome: p.nome }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [produtos],
  );

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return produtos.filter((produto) => {
      if (filtro === "kits" && !produto.ehKit) return false;
      if (filtro === "semDono" && produto.influencerId) return false;
      if (loja && produto.marca !== loja) return false;
      if (!termo) return true;
      return (
        produto.nome.toLowerCase().includes(termo) ||
        (produto.sku ?? "").toLowerCase().includes(termo) ||
        (produto.ncm ?? "").includes(termo)
      );
    });
  }, [produtos, busca, filtro, loja]);

  const kits = produtos.filter((p) => p.ehKit);
  const semDono = produtos.filter((p) => !p.influencerId);
  const porId = new Map(influencers.map((i) => [i.id, i]));
  const colunas = podeVerFinanceiro ? 7 : 6;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex overflow-hidden rounded-lg border border-borda-forte">
          {(
            [
              ["todos", `Todos (${produtos.length})`],
              ["kits", `Kits (${kits.length})`],
              ["semDono", `Sem influencer (${semDono.length})`],
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

        {lojas.length > 1 && (
          <select
            value={loja}
            onChange={(e) => setLoja(e.target.value)}
            aria-label="Filtrar por loja"
            className="rounded-lg border border-borda-forte bg-superficie px-3 py-2 text-sm text-tinta"
          >
            <option value="">Todas as lojas</option>
            {lojas.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        )}

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
          influencers={influencers}
          opcoes={opcoes}
          aoFechar={() => setEditando(null)}
        />
      )}

      <div className="overflow-x-auto">
        <table className="tabela-ancorada w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-borda-forte text-left text-xs uppercase tracking-wider text-tinta-fraca">
              <th className="py-2.5 pr-4 font-semibold">Produto</th>
              <th className="py-2.5 pr-4 font-semibold">Influencer</th>
              <th className="py-2.5 pr-4 font-semibold">NCM</th>
              <th className="py-2.5 pr-4 font-semibold">Tipo</th>
              <th className="py-2.5 pr-4 font-semibold">Impostos do produto</th>
              {podeVerFinanceiro && (
                <th
                  className="py-2.5 pr-4 text-right font-semibold"
                  title="Para kit, quantos kits foram vendidos. Para item avulso, unidades que sairam, somando o que foi dentro de kit."
                >
                  Saídas no mês
                </th>
              )}
              <th className="py-2.5 text-right font-semibold">Ação</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((produto) => {
              const aberto = editando !== "novo" && editando?.id === produto.id;
              /*
               * So os impostos do REGIME do dono, que e o que a apuracao usa
               * (`impostosDoRegime`). O produto guarda as marcacoes antigas: um
               * item trazido da Nuvemshop antes de o influencer existir nasce
               * com as do regime padrao, e continua com elas depois que o dono
               * e cadastrado noutro regime. Mostrar aquilo fazia a tela
               * prometer imposto que ninguem paga -- PIS e COFINS apareciam em
               * produto de marca do Simples, onde os dois estao dentro do DAS.
               */
              const dono = produto.influencerId
                ? porId.get(produto.influencerId)
                : undefined;
              const doRegime = impostos.filter((i) =>
                i.regimes.includes(dono?.regime ?? REGIME_SEM_INFLUENCER),
              );
              const marcados = doRegime.filter((i) =>
                produto.impostosIds.includes(i.id),
              );
              const deOutroRegime = produto.impostosIds.filter(
                (id) =>
                  !doRegime.some((i) => i.id === id) &&
                  impostos.some((i) => i.id === id),
              ).length;

              return (
                <Fragment key={produto.id}>
                <tr
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
                  <td className="py-3 pr-4">
                    {(() => {
                      const dono = produto.influencerId
                        ? porId.get(produto.influencerId)
                        : undefined;
                      if (!dono) {
                        return (
                          <>
                            <span className="text-xs font-semibold uppercase text-naopago">
                              sem influencer
                            </span>
                            {produto.marca && (
                              <p className="text-xs text-tinta-fraca">
                                loja {produto.marca}, sem contrato
                              </p>
                            )}
                          </>
                        );
                      }
                      return (
                        <>
                          <p className="font-medium text-tinta">{dono.nome}</p>
                          <p className="text-xs text-tinta-fraca">
                            {produto.marca ? `loja ${produto.marca}` : "cadastrado à mão"} ·{" "}
                            {ROTULO_REGIME[dono.regime]}
                          </p>
                        </>
                      );
                    })()}
                  </td>
                  <td className="numerico py-3 pr-4 text-tinta-media">
                    {produto.ncm ?? (
                      <span className="text-xs font-semibold uppercase text-naopago">
                        não informado
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    {produto.ehKit && produto.componentes.length === 0 ? (
                      <span className="rounded-full bg-alerta-fundo px-2.5 py-0.5 text-xs font-semibold text-naopago">
                        kit · montar
                      </span>
                    ) : produto.ehKit ? (
                      <span className="rounded-full bg-real-claro px-2.5 py-0.5 text-xs font-semibold text-real">
                        kit de {produto.componentes.length}
                      </span>
                    ) : (
                      <span className="text-xs text-tinta-media">avulso</span>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    {deOutroRegime > 0 && (
                      <p
                        className="mb-1 text-xs text-tinta-fraca"
                        title="Marcações de quando o produto estava em outro regime. Não entram em conta nenhuma; somem ao salvar o produto."
                      >
                        {deOutroRegime} marcação(ões) de outro regime, sem efeito
                      </p>
                    )}
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

                  {/*
                    O formulario abre AQUI, na linha logo abaixo do item.
                    Depois da tabela inteira, clicar em "Editar" parecia nao
                    fazer nada: o formulario abria fora da tela.
                  */}
                  {aberto && (
                    <tr>
                      <td colSpan={colunas} className="p-0 pb-4">
<div className="linha-de-edicao">
                        <FormularioProduto
                          produto={produto}
                          impostos={impostos}
                          influencers={influencers}
                          opcoes={opcoes}
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

function FormularioProduto({
  produto,
  impostos,
  influencers,
  opcoes,
  aoFechar,
}: {
  produto: Produto | null;
  impostos: Imposto[];
  influencers: OpcaoInfluencer[];
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
  // Um kit nao pode conter a si mesmo (a action tambem barra).
  const opcoesDoKit = opcoes.filter((o) => o.chave !== produto?.chave);

  /*
   * Quem decide o dono, nesta ordem:
   * - produto que veio de uma loja: o influencer daquela loja (a lista ja vem
   *   so com os ativos, na ordem do cadastro, e o primeiro da marca manda);
   * - um influencer ativo so: ele;
   * - senao, escolha de quem cadastra.
   */
  const loja = produto?.marca ?? null;
  const daLoja = loja !== null ? (influencers.find((i) => i.marca === loja) ?? null) : null;
  const unico = influencers.length === 1 ? influencers[0]! : null;
  const fixo = loja !== null ? daLoja : unico;
  const [influencerId, setInfluencerId] = useState(
    loja !== null ? (daLoja?.id ?? "") : (produto?.influencerId ?? unico?.id ?? ""),
  );
  const dono = influencers.find((i) => i.id === influencerId) ?? null;

  /*
   * Impostos derivados do REGIME do influencer dono.
   *
   * E o que faz o cadastro se preencher sozinho: escolhido o influencer, o
   * painel sabe o regime dele e ja marca os tributos daquele conjunto. Trocar
   * o influencer troca a lista inteira, porque um produto do Simples e um do
   * Presumido nao pagam os mesmos tributos.
   */
  // Produto de loja sem influencer segue o regime padrao, como na apuracao;
  // uma lista vazia aqui apagaria as marcacoes ao salvar.
  const regime = dono?.regime ?? (loja !== null ? REGIME_SEM_INFLUENCER : null);
  const doRegime = regime ? impostos.filter((i) => i.regimes.includes(regime)) : [];

  const [marcados, setMarcados] = useState<string[]>(
    produto?.impostosIds ?? idsMarcadosPorPadrao(impostos, regime ?? REGIME_SEM_INFLUENCER),
  );

  function trocarInfluencer(novoId: string) {
    setInfluencerId(novoId);
    const novoDono = influencers.find((i) => i.id === novoId) ?? null;
    // Ao trocar o dono, os impostos do novo regime entram ja marcados.
    setMarcados(novoDono ? idsMarcadosPorPadrao(impostos, novoDono.regime) : []);
  }

  function adicionarComponente() {
    const primeira = opcoesDoKit[0];
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

        {/*
          Cada loja Nuvemshop e de UM influencer, e a chave da API e por loja:
          produto que veio de uma loja tem o dono decidido por ela, e a tela so
          informa (a action confere de novo). Produto criado a mao nao tem
          loja: com um influencer ativo so, e dele; com mais, e escolha.
        */}
        <div className="block">
          <span className="text-sm font-medium text-tinta">
            Influencer dono deste produto
          </span>
          {loja !== null && !daLoja ? (
            <>
              <input type="hidden" name="influencerId" value="" />
              <p className="mt-1 rounded-lg border border-alerta-borda bg-alerta-fundo px-3 py-2 text-naopago">
                A loja {loja} ainda não tem influencer cadastrado.
              </p>
              <span className="mt-1 block text-xs leading-relaxed text-tinta-media">
                Cadastre o contrato dele na aba Influencers com a marca “{loja}”:
                os produtos desta loja passam para ele sozinhos. Até lá, os
                impostos seguem o {ROTULO_REGIME[REGIME_SEM_INFLUENCER]}.
              </span>
            </>
          ) : fixo ? (
            <>
              <input type="hidden" name="influencerId" value={fixo.id} />
              <p className="mt-1 rounded-lg border border-borda bg-fundo px-3 py-2 text-tinta">
                {fixo.nome} — {fixo.marca} ({ROTULO_REGIME[fixo.regime]})
              </p>
              <span className="mt-1 block text-xs leading-relaxed text-tinta-media">
                {loja !== null
                  ? `Veio da loja ${loja} na Nuvemshop, e cada loja é de um influencer: o produto é dele.`
                  : "É o único influencer cadastrado: o produto é dele."}{" "}
                É o regime dele que define quais impostos incidem sobre este item.
              </span>
            </>
          ) : (
            <>
              <select
                name="influencerId"
                value={influencerId}
                onChange={(e) => trocarInfluencer(e.target.value)}
                className="mt-1 w-full rounded-lg border border-borda-forte bg-superficie px-3 py-2 text-tinta focus:border-tinta focus:outline-none"
              >
                <option value="">Sem influencer vinculado</option>
                {influencers.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nome} — {i.marca} ({ROTULO_REGIME[i.regime]})
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs leading-relaxed text-tinta-media">
                Um produto pertence a um influencer só. É o regime dele que define
                quais impostos incidem sobre este item.
              </span>
            </>
          )}
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
          São esses dois ids que ligam o cadastro às vendas. Deixando em branco,
          o produto recebe um id interno e fica cadastrado, mas não casa com
          nenhum pedido até os ids reais da Nuvemshop serem informados.
        </p>

        {/* --- Impostos --------------------------------------------------- */}
        <fieldset className="rounded-lg border border-borda bg-fundo px-5 py-4">
          <legend className="px-2 text-sm font-medium text-tinta">
            Impostos deste produto
          </legend>

          {!regime ? (
            <p className="text-sm text-tinta-media">
              Escolha o influencer dono acima. Os impostos aparecem sozinhos, a
              partir do regime tributário dele.
            </p>
          ) : doRegime.length === 0 ? (
            <p className="text-sm text-tinta-media">
              Nenhum imposto cadastrado para o regime{" "}
              {ROTULO_REGIME[regime]}. Cadastre em Impostos.
            </p>
          ) : (
            <>
              <p className="mb-3 text-xs leading-relaxed text-tinta-media">
                Do regime{" "}
                <strong className="text-tinta">{ROTULO_REGIME[regime]}</strong>
                {dono ? `, de ${dono.nome}` : ", o padrão enquanto a loja não tem influencer"}. O imposto só é cobrado nos produtos marcados:
                desmarcar tira o imposto deste item.
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                {doRegime.map((imposto) => {
                  /*
                   * Todo tributo sobre RECEITA e marcavel: ele so incide onde o
                   * produto o marcou. O de LUCRO (IRPJ, CSLL) aparece sem
                   * clique -- a base dele e a presuncao sobre a receita da
                   * marca inteira, que nao se reparte por produto. Escondê-lo
                   * seria pior: a empresa paga e a tela nao diria.
                   */
                  const marcavel = imposto.baseIncidencia !== "lucro";
                  return (
                    <label
                      key={imposto.id}
                      className={`flex items-start gap-2 ${
                        marcavel ? "" : "opacity-70"
                      }`}
                    >
                      <input
                        type="checkbox"
                        name="impostosIds"
                        value={imposto.id}
                        disabled={!marcavel}
                        checked={marcavel && marcados.includes(imposto.id)}
                        onChange={(e) =>
                          setMarcados((atual) =>
                            e.target.checked
                              ? [...atual, imposto.id]
                              : atual.filter((id) => id !== imposto.id),
                          )
                        }
                        className="mt-0.5 h-4 w-4 accent-[var(--color-tinta)]"
                      />
                      <span>
                        <span className="block text-sm font-medium text-tinta">
                          {imposto.sigla}{" "}
                          <span className="numerico font-normal text-tinta-media">
                            {String(imposto.aliquota).replace(".", ",")}%
                          </span>
                          {!imposto.ativo && (
                            <span className="ml-1 text-xs font-normal text-naopago">
                              (desativado no cadastro de impostos)
                            </span>
                          )}
                        </span>
                        <span className="block text-xs text-tinta-media">
                          {imposto.nome}
                          {marcavel
                            ? ""
                            : " · incide sobre o lucro presumido da marca, não sobre o produto"}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>

              {regime === "simples_nacional" && (
                <p className="mt-4 border-t border-borda pt-3 text-xs leading-relaxed text-tinta-media">
                  No Simples Nacional, IRPJ, CSLL, PIS, COFINS, CPP, IPI e ICMS
                  já estão dentro da guia única e por isso não aparecem aqui --
                  eles entram no cálculo pela tabela do Anexo, sobre a receita
                  inteira da marca.
                </p>
              )}
            </>
          )}
        </fieldset>

        {/* --- Kit --------------------------------------------------------- */}
        <fieldset className="rounded-lg border border-borda bg-fundo px-5 py-4">
          <legend className="px-2 text-sm font-medium text-tinta">
            Composição
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
                Este item é vendido como kit
              </span>
              <span className="block text-xs leading-relaxed text-tinta-media">
                A Nuvemshop entrega o kit como um produto só. Informando os
                componentes, o painel baixa o estoque de cada um e soma o custo
                de fabricação real do kit.
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
                      const opcao = opcoesDoKit.find((o) => o.chave === e.target.value);
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
                    {opcoesDoKit.map((opcao) => (
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
                  Composição ainda não informada. Até lá, o custo do kit vem da
                  ficha do próprio kit (aba Custos), e o estoque o conta como um
                  item só. Componente que não é vendido avulso se cadastra em
                  &quot;Novo produto&quot;.
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
            Produto ativo (entra nos cálculos do painel)
          </span>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-tinta">
            Observação <span className="text-tinta-fraca">(opcional)</span>
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
