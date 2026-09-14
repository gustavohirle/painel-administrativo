import type { Metadata, Viewport } from "next";
import { Suspense } from "react";

import { IndicadorNavegacao } from "@/components/IndicadorNavegacao";

import "./globals.css";

export const metadata: Metadata = {
  title: "Painel Administrativo",
  description:
    "Raio-x financeiro de lojas Nuvemshop: faturamento, custos de fabricacao e comissoes.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen antialiased">
        {/* Suspense: o indicador le a URL (useSearchParams), o que sem limite
            obrigaria toda pagina estatica a renderizar no navegador. */}
        <Suspense fallback={null}>
          <IndicadorNavegacao />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
