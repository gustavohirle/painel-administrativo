"use client";

import { useActionState, useEffect, useId, useMemo, useState } from "react";

import { incluirKit, salvarComposicaoKit } from "@/app/kits/actions";
import { inteiro, moeda } from "@/lib/format";
import type { KitCadastrado } from "@/lib/kits";
import { ESTADO_INICIAL } from "@/types/formulario";

export interface OpcaoItem {
  chave: string;
  rotulo: string;
  ehKit: boolean;
}

interface GestaoKitsProps {
  kits: KitCadastrado[];
  /** Todos os produtos do cadastro, para escolher os itens. */
  opcoes: OpcaoItem[];
  /** Produtos que ainda nao sao kit, para incluir. */
  naoKits: Array<{ id: string; rotulo: string }>;
  /** O perfil pode ver custo? (area `custos`). */
  mostrarCusto: boolean;
}

type Filtro = "todos" | "montar" | "montados";

export function GestaoKits({ kits, opcoes, naoKits, mostrarCusto }: GestaoKitsProps) {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);

  const aMontar = kits.filter((k) => k.itens.length === 0).length;
  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return kits.filter((k) => {
      if (filtro === "montar" && k.itens.length > 0) return false;
      if (filtro === "montados" && k.itens.length === 0) return false;
      if (!termo) return true;
      return `${k.nome} ${k.sku ?? ""}`.toLowerCase().includes(termo);
    });
  }, [kits, filtro, busca]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex overflow-hidden rounded-lg border border-borda-forte">
          {(
            [
              ["todos", `Todos (${kits.length})`],
              ["montar", `A montar (${aMontar})`],
              ["montados", `Montados (${kits.length - aMontar})`],
            ] as const
          ).map(([valor, rotulo]) => (
            <button
              key={valor}
              type="button"
              onClick={() => setFiltro(valor)}
              className={`px-3 py-2 text-sm font-medium transition-colors sm:px-4 ${
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
          placeholder="Buscar kit por nome ou SKU"
          className="min-w-0 flex-1 basis-56 rounded-lg border border-borda-forte bg-superficie px-4 py-2 text-sm text-tinta placeholder:text-tinta-fraca"
        />
      </div>

      {visiveis.length === 0 && (
        <p className="rounded-lg border border-dashed border-borda-forte px-4 py-6 text-sm text-tinta-media">
          Nenhum kit neste filtro.
        </p>
      )}

      <ul className="space-y-3">
        {visiveis.map((kit) => (
          <li key={kit.id}>
            <CartaoKit
              kit={kit}
              opcoes={opcoes}
              mostrarCusto={mostrarCusto}
              aberto={aberto === kit.id}
              aoAbrir={() => setAberto(aberto === kit.id ? null : kit.id)}
              aoFechar={() => setAberto(null)}
            />
          </li>
        ))}
      </ul>

      <IncluirKit naoKits={naoKits} />
    </div>
  );
}

function CartaoKit({
  kit,
  opcoes,
  mostrarCusto,
  aberto,
  aoAbrir,
  aoFechar,
}: {
  kit: KitCadastrado;
  opcoes: OpcaoItem[];
  mostrarCusto: boolean;
  aberto: boolean;
  aoAbrir: () => void;
  aoFechar: () => void;
}) {
  const montado = kit.itens.length > 0;
  // A mensagem de "salvo" mora aqui: o editor fecha ao salvar e levaria ela junto.
  const [salvo, setSalvo] = useState("");

  return (
    <article
      className={`rounded-xl border bg-superficie p-4 sm:p-5 ${
        montado ? "border-borda" : "border-alerta-borda"
      } ${kit.ativo ? "" : "opacity-70"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-60">
          <h3 className="font-semibold text-tinta">{kit.nome}</h3>
          <p className="mt-0.5 text-xs text-tinta-media">
            {kit.sku ? `SKU ${kit.sku} · ` : ""}
            {inteiro(kit.vendidos)} vendido(s) no mês
            {kit.ativo ? "" : " · inativo"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {montado ? (
            <span className="rounded-full bg-real-claro px-2.5 py-0.5 text-xs font-semibold text-real">
              {kit.itens.length} item(ns)
            </span>
          ) : (
            <span className="rounded-full bg-alerta-fundo px-2.5 py-0.5 text-xs font-semibold text-naopago">
              a montar
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              setSalvo("");
              aoAbrir();
            }}
            className="rounded-lg border border-borda-forte px-3.5 py-1.5 text-sm font-semibold text-tinta hover:bg-fundo"
          >
            {aberto ? "Fechar" : montado ? "Editar" : "Montar"}
          </button>
        </div>
      </div>

      {montado && !aberto && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {kit.itens.map((item) => (
            <li
              key={item.chave}
              className={`rounded-md border px-2.5 py-1 text-xs ${
                item.removido ? "border-alerta-borda text-naopago" : "border-borda text-tinta"
              }`}
            >
              <span className="numerico font-semibold">{item.quantidade}×</span> {item.nome}
              {item.removido && " (saiu do cadastro)"}
            </li>
          ))}
        </ul>
      )}

      {mostrarCusto && (
        <p className="mt-3 text-sm text-tinta-media">
          <CustoDoKit kit={kit} />
        </p>
      )}

      {salvo && !aberto && <p className="mt-2 text-sm font-medium text-real">{salvo}</p>}

      {aberto && (
        <EditorKit
          key={kit.id}
          kit={kit}
          opcoes={opcoes}
          mostrarCusto={mostrarCusto}
          aoFechar={(mensagem) => {
            if (mensagem) setSalvo(mensagem);
            aoFechar();
          }}
        />
      )}
    </article>
  );
}

function CustoDoKit({ kit }: { kit: KitCadastrado }) {
  if (kit.temFichaPropria && kit.custoUnitario !== null) {
    return (
      <>
        Custo do kit: <strong className="numerico text-tinta">{moeda(kit.custoUnitario)}</strong>{" "}
        (ficha do próprio kit, que vale no lugar da soma dos itens)
      </>
    );
  }
  if (kit.itens.length === 0) {
    return <>Sem itens e sem ficha própria: o kit ainda não tem custo.</>;
  }
  if (kit.custoUnitario !== null) {
    return (
      <>
        Custo do kit: <strong className="numerico text-tinta">{moeda(kit.custoUnitario)}</strong>{" "}
        (soma dos itens)
      </>
    );
  }
  return (
    <span className="text-naopago">
      Falta custo em {kit.itensSemCusto} item(ns); até lá o kit fica sem custo.
    </span>
  );
}

interface LinhaEditor {
  chave: string;
  nome: string;
  quantidade: number;
}

function EditorKit({
  kit,
  opcoes,
  mostrarCusto,
  aoFechar,
}: {
  kit: KitCadastrado;
  opcoes: OpcaoItem[];
  mostrarCusto: boolean;
  aoFechar: (mensagem?: string) => void;
}) {
  const [estado, acao, salvando] = useActionState(salvarComposicaoKit, ESTADO_INICIAL);
  const [linhas, setLinhas] = useState<LinhaEditor[]>(
    kit.itens.map((i) => ({ chave: i.chave, nome: i.nome, quantidade: i.quantidade })),
  );
  const [texto, setTexto] = useState("");
  const [quantidade, setQuantidade] = useState(1);
  const [aviso, setAviso] = useState("");
  const idLista = useId();

  // O proprio kit nao aparece entre os itens possiveis.
  const possiveis = useMemo(() => opcoes.filter((o) => o.chave !== kit.chave), [opcoes, kit.chave]);
  const porRotulo = useMemo(() => new Map(possiveis.map((o) => [o.rotulo, o])), [possiveis]);
  const custoPorChave = useMemo(
    () => new Map(kit.itens.map((i) => [i.chave, i.custoUnitario])),
    [kit.itens],
  );

  // Salvou: fecha o editor, a lista ja chega atualizada do servidor.
  useEffect(() => {
    if (estado.ok && estado.mensagem) aoFechar(estado.mensagem);
    // So a resposta da action decide; aoFechar muda a cada render do pai.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  function adicionar() {
    const escolhida = porRotulo.get(texto.trim());
    if (!escolhida) {
      setAviso("Escolha um produto da lista que aparece ao digitar.");
      return;
    }
    const qtd = Math.max(1, Math.min(999, Math.round(quantidade) || 1));
    setLinhas((atual) =>
      atual.some((l) => l.chave === escolhida.chave)
        ? atual.map((l) => (l.chave === escolhida.chave ? { ...l, quantidade: l.quantidade + qtd } : l))
        : [...atual, { chave: escolhida.chave, nome: escolhida.rotulo, quantidade: qtd }],
    );
    setTexto("");
    setQuantidade(1);
    setAviso("");
  }

  return (
    <div className="linha-de-edicao mt-4 rounded-lg border-2 border-tinta bg-fundo p-3 [--recuo-da-tabela:4.5rem] sm:p-4">
      <form action={acao} className="space-y-4">
        <input type="hidden" name="id" value={kit.id} />
        <input
          type="hidden"
          name="componentes"
          value={JSON.stringify(linhas.map((l) => ({ chave: l.chave, quantidade: l.quantidade })))}
        />

        <div>
          <p className="text-sm font-semibold text-tinta">Itens do kit</p>
          {linhas.length === 0 ? (
            <p className="mt-1 text-sm text-tinta-media">
              Nenhum item ainda. Adicione abaixo cada produto que vai dentro do kit.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {linhas.map((linha, indice) => (
                <li key={linha.chave} className="flex flex-wrap items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={999}
                    value={linha.quantidade}
                    aria-label={`Quantidade de ${linha.nome}`}
                    onChange={(e) =>
                      setLinhas((atual) =>
                        atual.map((l, i) =>
                          i === indice
                            ? { ...l, quantidade: Math.max(1, Math.min(999, Number(e.target.value) || 1)) }
                            : l,
                        ),
                      )
                    }
                    className="numerico w-16 rounded-lg border border-borda-forte bg-superficie px-2 py-1.5 text-right text-sm font-semibold text-tinta"
                  />
                  <span className="min-w-0 flex-1 basis-40 text-sm text-tinta">
                    {linha.nome}
                    {mostrarCusto && custoPorChave.has(linha.chave) && custoPorChave.get(linha.chave) === null && (
                      <span className="ml-1 text-xs text-naopago">(sem custo)</span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => setLinhas((atual) => atual.filter((_, i) => i !== indice))}
                    className="rounded-md border border-borda-forte px-2.5 py-1 text-xs font-medium text-naopago hover:bg-superficie"
                  >
                    Remover
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-borda bg-superficie p-3">
          <label htmlFor={`${idLista}-campo`} className="text-sm font-medium text-tinta">
            Adicionar item
          </label>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <input
              id={`${idLista}-campo`}
              list={idLista}
              value={texto}
              onChange={(e) => {
                setTexto(e.target.value);
                setAviso("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  adicionar();
                }
              }}
              placeholder="Digite o nome ou o SKU do produto"
              autoComplete="off"
              className="min-w-0 flex-1 basis-56 rounded-lg border border-borda-forte bg-superficie px-3 py-2 text-sm text-tinta placeholder:text-tinta-fraca"
            />
            <datalist id={idLista}>
              {possiveis.map((o) => (
                <option key={o.chave} value={o.rotulo}>
                  {o.ehKit ? "kit" : undefined}
                </option>
              ))}
            </datalist>
            <input
              type="number"
              min={1}
              max={999}
              value={quantidade}
              aria-label="Quantidade do item"
              onChange={(e) => setQuantidade(Number(e.target.value))}
              className="numerico w-16 rounded-lg border border-borda-forte bg-superficie px-2 py-2 text-right text-sm font-semibold text-tinta"
            />
            <button
              type="button"
              onClick={adicionar}
              className="rounded-lg border border-tinta px-3.5 py-2 text-sm font-semibold text-tinta hover:bg-fundo"
            >
              Adicionar
            </button>
          </div>
          {aviso && <p className="mt-1.5 text-sm text-naopago">{aviso}</p>}
          <p className="mt-1.5 text-xs text-tinta-fraca">
            Item que não é vendido sozinho (a loção de um kit, por exemplo) precisa
            existir na aba Produtos: cadastre-o lá em &quot;Novo produto&quot;.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={salvando}
            className="rounded-lg bg-tinta px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {salvando ? "Salvando..." : "Salvar composição"}
          </button>
          <button
            type="button"
            onClick={() => aoFechar()}
            className="text-sm font-medium text-tinta-media hover:text-tinta"
          >
            Cancelar
          </button>
          {estado.mensagem && !estado.ok && (
            <span className="text-sm font-medium text-naopago">{estado.mensagem}</span>
          )}
        </div>
      </form>
    </div>
  );
}

function IncluirKit({ naoKits }: { naoKits: Array<{ id: string; rotulo: string }> }) {
  const [estado, acao, incluindo] = useActionState(incluirKit, ESTADO_INICIAL);
  if (naoKits.length === 0) return null;

  return (
    <form
      action={acao}
      className="rounded-xl border border-dashed border-borda-forte bg-superficie p-4"
    >
      <label htmlFor="incluir-kit" className="text-sm font-semibold text-tinta">
        Faltou algum kit?
      </label>
      <p className="mt-0.5 text-xs text-tinta-media">
        Os kits foram reconhecidos pelo nome (Kit, Combo ou &quot;+&quot;). Se algum
        produto também é kit, inclua aqui.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          id="incluir-kit"
          name="id"
          defaultValue=""
          className="min-w-0 flex-1 basis-56 rounded-lg border border-borda-forte bg-superficie px-3 py-2 text-sm text-tinta"
        >
          <option value="" disabled>
            Escolha o produto
          </option>
          {naoKits.map((p) => (
            <option key={p.id} value={p.id}>
              {p.rotulo}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={incluindo}
          className="rounded-lg border border-tinta px-3.5 py-2 text-sm font-semibold text-tinta hover:bg-fundo disabled:opacity-50"
        >
          {incluindo ? "Incluindo..." : "Incluir como kit"}
        </button>
      </div>
      {estado.mensagem && (
        <p className={`mt-2 text-sm font-medium ${estado.ok ? "text-real" : "text-naopago"}`}>
          {estado.mensagem}
        </p>
      )}
    </form>
  );
}
