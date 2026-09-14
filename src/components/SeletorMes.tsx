"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { mesAno } from "@/lib/format";

interface SeletorMesProps {
  meses: string[];
  mesSelecionado: string;
}

/** Troca o mes analisado mantendo o resto da URL intacto. */
export function SeletorMes({ meses, mesSelecionado }: SeletorMesProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pendente, iniciarTransicao] = useTransition();

  function trocar(mes: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("mes", mes);
    iniciarTransicao(() => router.push(`${pathname}?${params.toString()}`));
  }

  return (
    <label className="flex shrink-0 items-center gap-2 text-sm">
      {/* No celular o rotulo sai: sao 34px disputando a linha com o selo de
          demonstracao e o botao de sair, e o proprio "Set/26" ja diz o que e. */}
      <span className="hidden font-medium text-tinta-media sm:inline">Mês</span>
      <select
        value={mesSelecionado}
        onChange={(e) => trocar(e.target.value)}
        disabled={pendente}
        className="rounded-lg border border-borda-forte bg-superficie px-2 py-1.5 text-sm font-semibold text-tinta shadow-sm disabled:opacity-60 sm:px-3"
      >
        {meses.map((mes) => (
          <option key={mes} value={mes}>
            {mesAno(mes)}
          </option>
        ))}
      </select>
    </label>
  );
}
