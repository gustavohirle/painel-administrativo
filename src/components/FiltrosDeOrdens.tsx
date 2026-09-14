"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import type { FiltrosOrdens } from "@/lib/ordens";
import { ROTULO_SITUACAO, type SituacaoOrdem } from "@/types/ordemFabricacao";

export interface OpcaoInfluencer {
  id: string;
  nome: string;
  marca: string;
}

interface FiltrosDeOrdensProps {
  filtros: FiltrosOrdens;
  influencers: OpcaoInfluencer[];
  /** Quantas ordens casaram, e quantas existem. Escrito ao lado do filtro. */
  encontradas: number;
  total: number;
  /** `true` quando a lista foi cortada no teto. */
  cortada: boolean;
}

const SITUACOES: SituacaoOrdem[] = ["aguardando", "aprovada", "recusada", "cancelada"];

/**
 * Filtro da lista de ordens.
 *
 * Escreve na URL e deixa o SERVIDOR filtrar, igual aos controles do relatorio.
 * Nao e so consistencia de estilo: filtrando no navegador, as 500 ordens
 * teriam que chegar nele primeiro -- e cada uma carrega os tracos das duas
 * assinaturas. Filtrando no servidor, desce so o que casou.
 *
 * A caixa de texto envia no Enter (ou no botao), nao a cada tecla. Cada
 * alteracao da URL e uma ida ao servidor; a cada letra seriam dez idas para
 * uma palavra, e a lista piscaria embaixo dos dedos. Os seletores aplicam na
 * hora, porque ali e um clique so.
 */
export function FiltrosDeOrdens({
  filtros,
  influencers,
  encontradas,
  total,
  cortada,
}: FiltrosDeOrdensProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [pendente, iniciarTransicao] = useTransition();
  const [texto, setTexto] = useState(filtros.busca);

  // O campo segue a URL: voltar no historico ou limpar o filtro tem que
  // esvaziar a caixa tambem, senao ela mostra um termo que nao esta mais valendo.
  useEffect(() => setTexto(filtros.busca), [filtros.busca]);

  function aplicar(mudanca: Partial<FiltrosOrdens>) {
    const novo = { ...filtros, ...mudanca };
    const params = new URLSearchParams();

    if (novo.busca.trim() !== "") params.set("busca", novo.busca.trim());
    if (novo.influencerId) params.set("influencer", novo.influencerId);
    if (novo.situacao) params.set("situacao", novo.situacao);

    const consulta = params.toString();
    iniciarTransicao(() =>
      router.replace(consulta === "" ? pathname : `${pathname}?${consulta}`),
    );
  }

  const ativo =
    filtros.busca.trim() !== "" || filtros.influencerId !== null || filtros.situacao !== null;

  return (
    <div className="mb-5 rounded-xl border border-borda bg-fundo px-3 py-3 sm:px-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            aplicar({ busca: texto });
          }}
          className="flex min-w-0 flex-1 gap-2"
        >
          <label className="block min-w-0 flex-1">
            <span className="mb-1 block text-xs font-medium text-tinta-media">
              Buscar
            </span>
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Produto, SKU, marca, número da ordem, quem pediu..."
              className="w-full rounded-lg border border-borda-forte bg-superficie px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={pendente}
            className="mt-auto rounded-lg border border-borda-forte bg-superficie px-3 py-2 text-sm font-medium text-tinta disabled:opacity-60"
          >
            Buscar
          </button>
        </form>

        <label className="block sm:w-52">
          <span className="mb-1 block text-xs font-medium text-tinta-media">
            Influencer
          </span>
          <select
            value={filtros.influencerId ?? ""}
            onChange={(e) => aplicar({ influencerId: e.target.value || null })}
            className="w-full rounded-lg border border-borda-forte bg-superficie px-3 py-2 text-sm text-tinta"
          >
            <option value="">Todos</option>
            {influencers.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nome} &mdash; {i.marca}
              </option>
            ))}
          </select>
        </label>

        <label className="block sm:w-48">
          <span className="mb-1 block text-xs font-medium text-tinta-media">
            Situação
          </span>
          <select
            value={filtros.situacao ?? ""}
            onChange={(e) =>
              aplicar({ situacao: (e.target.value || null) as SituacaoOrdem | null })
            }
            className="w-full rounded-lg border border-borda-forte bg-superficie px-3 py-2 text-sm text-tinta"
          >
            <option value="">Todas</option>
            {SITUACOES.map((s) => (
              <option key={s} value={s}>
                {ROTULO_SITUACAO[s]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-tinta-media">
        <span>
          {encontradas === total
            ? `${total} ordem(ns)`
            : `${encontradas} de ${total} ordem(ns)`}
          {pendente && " -- buscando..."}
        </span>

        {cortada && (
          <span className="text-naopago">
            Mostrando as mais recentes. Refine a busca para ver as outras.
          </span>
        )}

        {ativo && (
          <button
            type="button"
            onClick={() =>
              aplicar({ busca: "", influencerId: null, situacao: null })
            }
            className="font-medium text-tinta underline underline-offset-2"
          >
            Limpar filtro
          </button>
        )}
      </div>
    </div>
  );
}
