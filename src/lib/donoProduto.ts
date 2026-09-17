/**
 * De quem e cada produto (secao 5.11).
 *
 * Cada influencer tem a sua loja Nuvemshop, com chave de API propria, e um
 * produto existe numa loja so. Por isso, sabida a loja de origem do produto
 * (`Produto.marca`), o dono nao e escolha: e o influencer ativo daquela marca,
 * pela mesma regra da apuracao (5.9, o primeiro ativo manda).
 *
 * O dono continua GRAVADO no produto (`influencerId`) -- e dele que a
 * apuracao, o estoque e as ordens leem. Estas funcoes dizem quando o gravado
 * saiu da regra, e as actions regravam: ao trazer produtos, ao salvar um
 * produto e ao cadastrar, editar ou remover um influencer.
 *
 * Funcoes puras.
 */

import { REGIME_SEM_INFLUENCER } from "@/lib/config";
import { idsMarcadosPorPadrao } from "@/lib/impostos";
import type { Influencer } from "@/types/dominio";
import type { Imposto } from "@/types/fiscal";
import type { ItemCatalogo, Pedido } from "@/types/nuvemshop";
import { chaveProduto, type EntradaProduto, type Produto } from "@/types/produto";

/** Marca -> primeiro influencer ativo dela. */
export function influencersPorMarca<I extends Pick<Influencer, "marca" | "ativo">>(
  influencers: I[],
): Map<string, I> {
  const porMarca = new Map<string, I>();
  for (const influencer of influencers) {
    if (influencer.ativo && !porMarca.has(influencer.marca)) {
      porMarca.set(influencer.marca, influencer);
    }
  }
  return porMarca;
}

/**
 * O dono que a regra manda.
 *
 * Produto com loja conhecida: o influencer ativo da marca, ou `null` se a loja
 * ainda nao tem influencer. Produto sem loja (criado a mao): o que estiver
 * gravado, porque ali o dono foi escolha de quem cadastrou.
 */
export function donoPelaLoja(
  produto: Pick<Produto, "marca" | "influencerId">,
  influencers: Pick<Influencer, "id" | "marca" | "ativo">[],
): string | null {
  if (produto.marca === null) return produto.influencerId;
  return influencersPorMarca(influencers).get(produto.marca)?.id ?? null;
}

/**
 * Produtos cujo dono gravado nao e o da loja, ja com a correcao.
 *
 * Trocar de dono pode trocar de regime, e o regime decide quais impostos
 * existem para o produto: quando o regime muda, os impostos voltam aos que
 * nascem marcados no regime novo (`idsMarcadosPorPadrao`). Mesmo regime, a
 * marcacao feita a mao fica.
 *
 * Produto sem dono conta como `REGIME_SEM_INFLUENCER`, que e o regime com que
 * a importacao o marcou.
 */
export function ajustesDeDono(
  produtos: Produto[],
  influencers: Influencer[],
  impostos: Imposto[],
): { id: string; entrada: EntradaProduto }[] {
  const porId = new Map(influencers.map((i) => [i.id, i]));
  const ajustes: { id: string; entrada: EntradaProduto }[] = [];

  for (const produto of produtos) {
    if (produto.marca === null) continue;
    const novoDono = donoPelaLoja(produto, influencers);
    if (novoDono === produto.influencerId) continue;

    const regimeAntes =
      (produto.influencerId && porId.get(produto.influencerId)?.regime) || REGIME_SEM_INFLUENCER;
    const regimeDepois = (novoDono && porId.get(novoDono)?.regime) || REGIME_SEM_INFLUENCER;

    const { id, atualizadoEm: _atualizadoEm, ...entrada } = produto;
    ajustes.push({
      id,
      entrada: {
        ...entrada,
        influencerId: novoDono,
        impostosIds:
          regimeAntes === regimeDepois
            ? produto.impostosIds
            : idsMarcadosPorPadrao(impostos, regimeDepois),
      },
    });
  }
  return ajustes;
}

/**
 * Loja de origem de cada item vendido ou do catalogo, pela chave do produto.
 *
 * O catalogo vence as vendas (e o que a loja tem hoje). Um item que aparece
 * em duas lojas nao tem loja definida: fica fora, e o produto segue sem marca
 * -- atribuir a qualquer uma das duas daria o produto ao influencer errado
 * metade das vezes.
 */
export function lojasPorChave(pedidos: Pedido[], catalogo: ItemCatalogo[] = []): Map<string, string> {
  const vistas = new Map<string, Set<string>>();
  const anotar = (chave: string, marca: string) => {
    const conjunto = vistas.get(chave) ?? new Set<string>();
    conjunto.add(marca);
    vistas.set(chave, conjunto);
  };

  const doCatalogo = new Map<string, Set<string>>();
  for (const item of catalogo) {
    const chave = chaveProduto(item.produtoId, item.varianteId);
    const conjunto = doCatalogo.get(chave) ?? new Set<string>();
    conjunto.add(item.marca);
    doCatalogo.set(chave, conjunto);
  }
  for (const pedido of pedidos) {
    for (const item of pedido.products) {
      const chave = chaveProduto(item.product_id, item.variant_id);
      if (!doCatalogo.has(chave)) anotar(chave, pedido.marca);
    }
  }
  for (const [chave, marcas] of doCatalogo) vistas.set(chave, marcas);

  const lojas = new Map<string, string>();
  for (const [chave, marcas] of vistas) {
    if (marcas.size === 1) lojas.set(chave, [...marcas][0]!);
  }
  return lojas;
}

/**
 * Produtos que ainda nao sabem de que loja sao, e a loja que os dados dizem.
 *
 * Serve para o cadastro feito antes de o produto guardar a loja. Produto
 * inteiro (`varianteId` nulo) usa a loja de qualquer variante dele, desde que
 * todas digam a mesma.
 */
export function lojasParaCompletar(
  produtos: Produto[],
  lojas: Map<string, string>,
): { produto: Produto; marca: string }[] {
  const porProdutoId = new Map<number, Set<string>>();
  for (const [chave, marca] of lojas) {
    const produtoId = Number(chave.split(":")[0]);
    const conjunto = porProdutoId.get(produtoId) ?? new Set<string>();
    conjunto.add(marca);
    porProdutoId.set(produtoId, conjunto);
  }

  const resultado: { produto: Produto; marca: string }[] = [];
  for (const produto of produtos) {
    if (produto.marca !== null || produto.origem !== "nuvemshop") continue;
    let marca = lojas.get(produto.chave);
    if (!marca && produto.varianteId === null) {
      const marcas = porProdutoId.get(produto.produtoId);
      if (marcas?.size === 1) marca = [...marcas][0];
    }
    if (marca) resultado.push({ produto, marca });
  }
  return resultado;
}

/**
 * Produtos de um influencer que mudou de REGIME, com os impostos do regime novo.
 *
 * Mesma regra de `ajustesDeDono`: regime novo, marcacao volta aos tributos que
 * nascem marcados nele (`idsMarcadosPorPadrao`). Sem isso, o produto de quem
 * passou do Presumido para o Simples continuava com o ICMS do Presumido -- que
 * no Simples nao conta -- e sem o do Simples.
 */
export function ajustesDeRegime(
  produtos: Produto[],
  influencerId: string,
  impostos: Imposto[],
  regimeNovo: Influencer["regime"],
): { id: string; entrada: EntradaProduto }[] {
  const padrao = idsMarcadosPorPadrao(impostos, regimeNovo);
  return produtos
    .filter((p) => p.influencerId === influencerId)
    .map((produto) => {
      const { id, atualizadoEm: _atualizadoEm, ...entrada } = produto;
      return { id, entrada: { ...entrada, impostosIds: padrao } };
    });
}
