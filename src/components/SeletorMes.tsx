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
    <label className="flex items-center gap-2 text-sm">
      <span className="font-medium text-tinta-media">Mes</span>
      <select
        value={mesSelecionado}
        onChange={(e) => trocar(e.target.value)}
        disabled={pendente}
        className="rounded-lg border border-borda-forte bg-superficie px-3 py-1.5 text-sm font-semibold text-tinta shadow-sm disabled:opacity-60"
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
