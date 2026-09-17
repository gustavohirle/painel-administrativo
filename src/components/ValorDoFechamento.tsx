"use client";

import { useActionState, useEffect, useState } from "react";

import { salvarValorDoFechamento } from "@/app/actions";
import { moeda } from "@/lib/format";
import type { CampoFechamento } from "@/types/fechamento";
import { ESTADO_INICIAL } from "@/types/formulario";

/**
 * Campo do fechamento do mes, dentro do item da legenda da pizza (5.1.3).
 *
 * Fechado, mostra so o calculado (quando ha informado) e o botao. Aberto, o
 * campo de valor. Vazio + Salvar volta ao calculado.
 */
export function ValorDoFechamento({
  mes,
  campo,
  calculado,
  informado,
}: {
  mes: string;
  campo: CampoFechamento;
  calculado: number;
  informado: number | null;
}) {
  const [aberto, setAberto] = useState(false);
  const [estado, acao, salvando] = useActionState(salvarValorDoFechamento, ESTADO_INICIAL);

  // Salvou: fecha. A pagina ja volta com o valor novo (revalidatePath).
  useEffect(() => {
    if (estado.ok) setAberto(false);
  }, [estado]);

  const valorInicial =
    informado === null
      ? ""
      : informado.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (!aberto) {
    return (
      <span className="mt-0.5 block text-xs text-tinta-fraca">
        {informado !== null && (
          <>
            informado no fechamento · calculado{" "}
            <span className="numerico">{moeda(calculado)}</span>
            {" · "}
          </>
        )}
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="font-semibold text-tinta underline decoration-borda-forte underline-offset-2 hover:decoration-tinta"
        >
          {informado === null ? "informar valor do fechamento" : "alterar"}
        </button>
        {estado.mensagem && !estado.ok && (
          <span className="block text-naopago">{estado.mensagem}</span>
        )}
      </span>
    );
  }

  return (
    <form action={acao} className="mt-1.5 space-y-1.5">
      <input type="hidden" name="mes" value={mes} />
      <input type="hidden" name="campo" value={campo} />
      <span className="block text-xs text-tinta-fraca">
        calculado <span className="numerico">{moeda(calculado)}</span>
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          name="valor"
          inputMode="decimal"
          autoFocus
          defaultValue={valorInicial}
          placeholder="R$ do fechamento"
          aria-label="Valor do fechamento"
          className="numerico w-36 rounded-md border border-borda-forte bg-superficie px-2 py-1 text-sm text-tinta focus:border-tinta focus:outline-none"
        />
        <button
          type="submit"
          disabled={salvando}
          className="rounded-md bg-tinta px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-60"
        >
          {salvando ? "Salvando…" : "Salvar"}
        </button>
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="rounded-md border border-borda-forte px-2.5 py-1 text-xs font-medium text-tinta-media"
        >
          Cancelar
        </button>
      </div>
      <span className="block text-xs text-tinta-fraca">
        Deixe em branco e salve para voltar ao calculado.
      </span>
      {estado.mensagem && !estado.ok && (
        <span className="block text-xs text-naopago">{estado.mensagem}</span>
      )}
    </form>
  );
}
