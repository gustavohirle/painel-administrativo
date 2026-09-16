"use client";

import { useActionState } from "react";

import { trazerProdutosDaNuvemshop } from "@/app/produtos/actions";
import { inteiro } from "@/lib/format";
import { ESTADO_INICIAL } from "@/types/formulario";

/**
 * Botao para trazer ao cadastro os produtos da Nuvemshop: o catalogo da loja,
 * pela API, mais o que ja vendeu.
 *
 * Fica sempre na tela, mesmo sem pendencia nas vendas: produto novo no
 * catalogo so aparece quando alguem pede, porque a pagina nao chama a API a
 * cada abertura. `faltando` conta so o que VENDEU sem cadastro -- e isso que
 * deixa imposto e custo de fora, e por isso ganha destaque.
 */
export function TrazerProdutosVendidos({ faltando }: { faltando: number }) {
  const [estado, acao, trazendo] = useActionState(trazerProdutosDaNuvemshop, ESTADO_INICIAL);

  return (
    <form
      action={acao}
      className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border border-borda bg-superficie px-5 py-4 shadow-[0_1px_2px_rgba(16,24,40,0.05)]"
    >
      <div className="min-w-0 flex-1 basis-64">
        {faltando > 0 ? (
          <p className="font-semibold text-naopago">
            {inteiro(faltando)} produto(s) vendido(s) ainda fora do cadastro
          </p>
        ) : (
          <p className="font-semibold text-tinta">Catálogo da Nuvemshop</p>
        )}
        <p className="mt-0.5 text-sm text-tinta-media">
          Traz os produtos da loja que ainda não estão no cadastro, com o nome, o
          SKU e os impostos do regime da marca. A Nuvemshop não informa de que
          um kit é feito: isso continua sendo montado aqui.
        </p>
      </div>
      <button
        type="submit"
        disabled={trazendo}
        className="rounded-lg bg-tinta px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {trazendo ? "Trazendo..." : "Trazer da Nuvemshop"}
      </button>
      {estado.mensagem && (
        <p
          className={`basis-full text-sm font-medium ${estado.ok ? "text-real" : "text-naopago"}`}
        >
          {estado.mensagem}
        </p>
      )}
    </form>
  );
}
