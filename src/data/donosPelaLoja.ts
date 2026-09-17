/**
 * Regrava o dono dos produtos que sairam da regra "a loja decide o
 * influencer" (`lib/donoProduto.ts`).
 *
 * Chamado depois de toda mudanca que pode mexer nisso: produtos trazidos da
 * Nuvemshop e influencer cadastrado, editado ou removido. Sem isso, um produto
 * trazido antes de o influencer da loja existir ficaria sem dono para sempre.
 */

import type { RepositorioCadastros } from "@/data/repositorio";
import { ajustesDeDono } from "@/lib/donoProduto";

/** Devolve quantos produtos mudaram de dono. */
export async function aplicarDonosPelaLoja(repositorio: RepositorioCadastros): Promise<number> {
  const [produtos, influencers, impostos] = await Promise.all([
    repositorio.listarProdutos(),
    repositorio.listarInfluencers(),
    repositorio.listarImpostos(),
  ]);
  const ajustes = ajustesDeDono(produtos, influencers, impostos);
  for (const { id, entrada } of ajustes) await repositorio.salvarProduto(entrada, id);
  return ajustes.length;
}
