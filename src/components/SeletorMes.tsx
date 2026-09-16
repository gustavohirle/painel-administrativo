"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useTransition } from "react";

import { mesAno } from "@/lib/format";
import { COOKIE_MES } from "@/lib/mesDaTela";

/** Cookie de sessao: vale em todas as abas ate trocar ou fechar o navegador. */
function guardarMes(mes: string) {
  document.cookie = `${COOKIE_MES}=${encodeURIComponent(mes)}; path=/; SameSite=Lax`;
}

interface SeletorMesProps {
  meses: string[];
  mesSelecionado: string;
}

/**
 * Troca o mes analisado mantendo o resto da URL intacto, e guarda a escolha
 * para as outras abas (ver `lib/mesDaTela.ts`).
 */
export function SeletorMes({ meses, mesSelecionado }: SeletorMesProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pendente, iniciarTransicao] = useTransition();

  // Mes que veio escrito na URL (link compartilhado, ou a propria troca) passa
  // a valer para as outras abas. O mes padrao -- o mais recente, sem ?mes= --
  // NAO e gravado: senao, quando um mes novo comecasse, a tela ficaria presa
  // no anterior sem ninguem ter escolhido isso.
  const doEndereco = searchParams.get("mes");
  useEffect(() => {
    if (doEndereco && doEndereco === mesSelecionado) guardarMes(mesSelecionado);
  }, [doEndereco, mesSelecionado]);

  function trocar(mes: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("mes", mes);
    guardarMes(mes);
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
