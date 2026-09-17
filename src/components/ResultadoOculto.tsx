"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

/*
 * Resultado operacional oculto (secao 5.1.5).
 *
 * Pedido do cliente: o lucro ou prejuizo do mes abre escondido -- sem valor e
 * sem cor, porque o verde ou o vermelho ja contam a historia -- e so aparece
 * quando ele manda mostrar. Um estado so para a tela inteira: o numero do
 * topo, a pizza e o raio-x abrem e fecham juntos, senao o valor escondido num
 * lugar estaria a mostra no outro.
 *
 * E ocultacao VISUAL, para a tela aberta numa reuniao: o valor segue no HTML
 * da pagina de quem esta logado.
 */

const Contexto = createContext<{ visivel: boolean; alternar: () => void }>({
  // Fora do provedor (outras telas), o resultado aparece normalmente.
  visivel: true,
  alternar: () => {},
});

/** Toda tela abre com o resultado oculto. */
export function ProvedorResultado({ children }: { children: ReactNode }) {
  const [visivel, setVisivel] = useState(false);
  return (
    <Contexto.Provider value={{ visivel, alternar: () => setVisivel((v) => !v) }}>
      {children}
    </Contexto.Provider>
  );
}

/** Mostra `children` com o resultado visivel, e `mascara` com ele oculto. */
export function Oculto({ children, mascara = null }: { children: ReactNode; mascara?: ReactNode }) {
  return useContext(Contexto).visivel ? children : mascara;
}

/** O texto que ocupa o lugar do valor. */
export const VALOR_OCULTO = "R$ ••••••";

export function BotaoResultado({ className = "" }: { className?: string }) {
  const { visivel, alternar } = useContext(Contexto);
  return (
    <button
      type="button"
      onClick={alternar}
      aria-pressed={visivel}
      className={`rounded-md border border-borda-forte bg-superficie px-2.5 py-1 text-xs font-semibold text-tinta hover:bg-fundo ${className}`}
    >
      {visivel ? "Ocultar resultado" : "Mostrar resultado"}
    </button>
  );
}
