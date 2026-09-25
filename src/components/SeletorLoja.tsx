"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

/**
 * Filtro de loja da tela inicial (secao 5.1).
 *
 * Pedido do cliente: ver a pizza so do TikTok. Ele filtra a TELA INTEIRA, e
 * nao apenas o grafico -- com a pizza de uma loja ao lado do raio-x de todas,
 * a mesma tela mostraria dois lucros diferentes, que e o que a secao 5.14
 * proibe no relatorio pelo mesmo motivo.
 *
 * A escolha mora na URL (`?loja=`), como os filtros do relatorio: a leitura de
 * um canal vira link, e o seletor de mes do cabecalho a preserva.
 */
export function SeletorLoja({
  lojas,
  selecionada,
}: {
  lojas: string[];
  /** `null` = todas. */
  selecionada: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pendente, iniciarTransicao] = useTransition();

  if (lojas.length < 2) return null;

  function escolher(loja: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (loja) params.set("loja", loja);
    else params.delete("loja");
    const consulta = params.toString();
    iniciarTransicao(() => router.push(consulta ? `${pathname}?${consulta}` : pathname));
  }

  const botao = (rotulo: string, valor: string | null) => {
    const ativo = valor === selecionada;
    return (
      <button
        key={rotulo}
        type="button"
        onClick={() => escolher(valor)}
        aria-pressed={ativo}
        disabled={pendente}
        className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60 ${
          ativo
            ? "bg-tinta text-white"
            : "bg-superficie text-tinta-media hover:text-tinta"
        }`}
      >
        {rotulo}
      </button>
    );
  };

  return (
    <div className="flex flex-wrap gap-1.5 rounded-xl border border-borda-forte p-1">
      {botao("Todas as lojas", null)}
      {lojas.map((loja) => botao(loja, loja))}
    </div>
  );
}
