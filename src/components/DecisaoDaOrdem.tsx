"use client";

import { useActionState, useState } from "react";

import { assinarOrdem, recusarOrdem } from "@/app/assinar/[token]/actions";
import { QuadroAssinatura } from "@/components/QuadroAssinatura";
import { ESTADO_INICIAL } from "@/types/formulario";

/**
 * As duas respostas possiveis a uma ordem: assinar ou recusar.
 *
 * Aprovar e o caminho principal e fica aberto na tela; recusar mora atras de
 * um clique. Nao e para esconder a recusa -- e para que o botao grande e obvio
 * seja o que a pessoa veio fazer, e que recusar exija um segundo passo, ja que
 * ela precisa escrever o motivo de qualquer forma.
 */
export function DecisaoDaOrdem({ token }: { token: string }) {
  const [aprovar, acaoAprovar, aprovando] = useActionState(assinarOrdem, ESTADO_INICIAL);
  const [recusar, acaoRecusar, recusando] = useActionState(recusarOrdem, ESTADO_INICIAL);
  const [mostrarRecusa, setMostrarRecusa] = useState(false);
  const [temAssinatura, setTemAssinatura] = useState(false);

  return (
    <div>
      <form action={acaoAprovar}>
        <input type="hidden" name="token" value={token} />

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-tinta">
            Seu nome completo
          </span>
          <input
            name="nome"
            autoComplete="name"
            placeholder="Como você assina"
            className="w-full rounded-lg border border-borda-forte px-3 py-2.5 text-base"
          />
        </label>

        <div className="mt-4">
          <QuadroAssinatura
            campo="tracos"
            rotulo="Assinatura de quem recebe o pedido"
            aoMudar={setTemAssinatura}
          />
        </div>

        <button
          type="submit"
          disabled={!temAssinatura || aprovando}
          className="mt-5 w-full rounded-lg bg-tinta px-4 py-3 text-base font-semibold text-white disabled:opacity-50"
        >
          {aprovando ? "Assinando..." : "Aprovar e assinar"}
        </button>

        {!temAssinatura && (
          <p className="mt-2 text-center text-xs text-tinta-fraca">
            Assine no quadro acima para liberar o botão.
          </p>
        )}

        {aprovar.mensagem && (
          <p
            className={`mt-3 rounded-lg px-3 py-2 text-sm ${
              aprovar.ok
                ? "bg-fundo text-real"
                : "border border-alerta-borda bg-alerta-fundo text-naopago"
            }`}
          >
            {aprovar.mensagem}
          </p>
        )}
      </form>

      <div className="mt-6 border-t border-borda pt-4">
        {!mostrarRecusa ? (
          <button
            type="button"
            onClick={() => setMostrarRecusa(true)}
            className="text-sm font-medium text-tinta-media underline underline-offset-2"
          >
            Não consigo atender este pedido
          </button>
        ) : (
          <form action={acaoRecusar} className="space-y-3">
            <input type="hidden" name="token" value={token} />

            <p className="text-sm font-semibold text-tinta">Recusar o pedido</p>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-tinta">
                Seu nome completo
              </span>
              <input
                name="nome"
                autoComplete="name"
                className="w-full rounded-lg border border-borda-forte px-3 py-2.5 text-base"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-tinta">
                Motivo
              </span>
              <textarea
                name="motivo"
                rows={3}
                placeholder="Falta materia-prima, prazo curto demais, quantidade acima da capacidade..."
                className="w-full rounded-lg border border-borda-forte px-3 py-2 text-sm"
              />
              <span className="mt-1 block text-xs text-tinta-media">
                Quem pediu vai ler exatamente isto.
              </span>
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={recusando}
                className="rounded-lg border border-borda-forte px-4 py-2 text-sm font-semibold text-naopago disabled:opacity-60"
              >
                {recusando ? "Enviando..." : "Confirmar recusa"}
              </button>
              <button
                type="button"
                onClick={() => setMostrarRecusa(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-tinta-media"
              >
                Voltar
              </button>
            </div>

            {recusar.mensagem && (
              <p className={`text-sm ${recusar.ok ? "text-real" : "text-naopago"}`}>
                {recusar.mensagem}
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
