"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/** Se a navegacao falhar em silencio, a barra nao pode ficar para sempre. */
const TEMPO_MAXIMO_MS = 15_000;

/**
 * Barra fina no topo enquanto a proxima tela carrega.
 *
 * Toda pagina do painel e renderizada no servidor a cada visita (dado
 * financeiro em cache mente), e o Next so troca a tela quando a nova chega
 * inteira. Sem nenhum sinal, os ~200-600 ms dessa espera -- mais o tunel,
 * quando o acesso e de fora -- pareciam clique que nao pegou, e a reacao
 * natural e clicar de novo.
 *
 * Escuta cliques em QUALQUER link interno (abas, cartoes de influencer, abas do
 * simulador), em vez de ser plugada em cada componente: um link novo ganha o
 * indicador sem ninguem lembrar de ligar. Some quando o endereco muda.
 */
export function IndicadorNavegacao() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [carregando, setCarregando] = useState(false);

  const endereco = `${pathname}?${searchParams.toString()}`;

  useEffect(() => {
    setCarregando(false);
  }, [endereco]);

  useEffect(() => {
    if (!carregando) return;
    const limite = window.setTimeout(() => setCarregando(false), TEMPO_MAXIMO_MS);
    return () => window.clearTimeout(limite);
  }, [carregando]);

  useEffect(() => {
    function aoClicar(evento: MouseEvent) {
      // Abrir em outra aba, baixar, ou clique com modificador: esta tela fica.
      if (evento.button !== 0 || evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) {
        return;
      }

      const link = (evento.target as Element | null)?.closest?.("a");
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;

      const destino = new URL(link.href, window.location.href);
      if (destino.origin !== window.location.origin) return;
      // So a ancora muda: o navegador rola, nao ha tela nova para esperar.
      if (destino.pathname === window.location.pathname && destino.search === window.location.search) {
        return;
      }
      // PDF abre como documento, fora do painel.
      if (destino.pathname.endsWith("/pdf")) return;

      setCarregando(true);
    }

    document.addEventListener("click", aoClicar, true);
    return () => document.removeEventListener("click", aoClicar, true);
  }, []);

  if (!carregando) return null;

  return (
    <div role="progressbar" aria-label="Carregando" className="barra-carregando">
      <span />
    </div>
  );
}
