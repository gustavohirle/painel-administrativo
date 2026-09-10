import Link from "next/link";

import { SeletorMes } from "@/components/SeletorMes";
import { NavegacaoPrincipal } from "@/components/NavegacaoPrincipal";

interface CabecalhoProps {
  demonstracao: boolean;
  meses?: string[];
  mesSelecionado?: string;
}

/**
 * Barra superior fixa.
 *
 * O selo de demonstracao mora aqui: discreto, mas SEMPRE visivel. Deixar
 * duvida sobre a origem dos numeros seria pior do que nao mostrar nada.
 */
export function Cabecalho({
  demonstracao,
  meses,
  mesSelecionado,
}: CabecalhoProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-borda bg-superficie/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-3 px-6 py-3">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-tinta text-sm font-bold text-white">
            PA
          </span>
          <span className="text-base font-semibold tracking-tight text-tinta">
            Painel Administrativo
          </span>
        </Link>

        <NavegacaoPrincipal />

        <div className="ml-auto flex items-center gap-4">
          {meses && mesSelecionado && (
            <SeletorMes meses={meses} mesSelecionado={mesSelecionado} />
          )}
          {demonstracao && <SeloDemonstracao />}
        </div>
      </div>
    </header>
  );
}

/** Selo permanente. Nao remover sem que os dados sejam reais. */
export function SeloDemonstracao() {
  return (
    <span
      title="Os numeros desta tela sao ficticios, gerados para demonstracao. Nenhum dado real da loja foi utilizado."
      className="listrado-demo inline-flex items-center gap-2 rounded-full border border-alerta-borda bg-alerta-fundo px-3 py-1.5 text-xs font-semibold text-naopago"
    >
      <span className="h-2 w-2 rounded-full bg-naopago" />
      Dados de demonstracao
    </span>
  );
}
