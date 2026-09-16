/**
 * Cadastro de kits (aba /kits). Funcoes PURAS.
 *
 * A Nuvemshop entrega o kit como um produto so e nao diz de que ele e feito:
 * na loja real `is_kit` vem falso nos 33 kits e nao existe endpoint de
 * componentes. A composicao esta so no texto da descricao, e por isso e
 * cadastro -- escolhida a mao, item por item, a partir dos produtos que ja
 * estao no cadastro.
 *
 * A composicao e o que faz o custo do kit sair sozinho (soma dos itens) e o
 * estoque baixar os componentes certos. Ver `custoUnitarioComKit`.
 */

import { custoUnitarioComKit, custoUnitarioDe, indexarCustos } from "@/lib/costing";
import { indexarProdutos } from "@/lib/impostos";
import { pedidosRecebidos } from "@/lib/metrics";
import type { CustoProduto } from "@/types/dominio";
import type { Pedido } from "@/types/nuvemshop";
import {
  AVISO_KIT_SEM_COMPOSICAO,
  chaveProduto,
  partesDaChave,
  PROFUNDIDADE_MAXIMA_KIT,
  type ComponenteKit,
  type Produto,
} from "@/types/produto";

/** Mais que isso num kit so e erro de digitacao, nao um kit. */
export const MAXIMO_ITENS_KIT = 30;
export const MAXIMO_QUANTIDADE_ITEM = 999;

export interface ItemDoKit {
  chave: string;
  /** Nome ATUAL do cadastro; o copiado no kit so vale se o item sumiu. */
  nome: string;
  sku: string | null;
  quantidade: number;
  /** Custo de uma unidade do item (kit dentro de kit ja resolvido), ou `null`. */
  custoUnitario: number | null;
  /** O item saiu do cadastro depois de entrar no kit. */
  removido: boolean;
}

export interface KitCadastrado {
  id: string;
  chave: string;
  nome: string;
  sku: string | null;
  ativo: boolean;
  itens: ItemDoKit[];
  /** Unidades do kit vendidas e pagas no periodo. */
  vendidos: number;
  /** O custo que o painel usa: ficha propria, senao soma dos itens, senao `null`. */
  custoUnitario: number | null;
  /** O kit tem ficha de custo propria, que vence a soma dos itens. */
  temFichaPropria: boolean;
  /** Itens ainda sem custo: enquanto houver, a soma nao sai. */
  itensSemCusto: number;
}

/**
 * Os kits do cadastro, com os itens e o custo como o resto do painel enxerga.
 *
 * Ordem: mais vendidos primeiro -- e onde montar muda mais o resultado.
 */
export function listarKits(
  produtos: Produto[],
  custos: CustoProduto[],
  pedidosDoPeriodo: Pedido[],
): KitCadastrado[] {
  const indiceCustos = indexarCustos(custos);
  const indiceProdutos = indexarProdutos(produtos);
  const porChave = new Map(produtos.map((p) => [p.chave, p]));

  const vendidos = new Map<string, number>();
  for (const pedido of pedidosRecebidos(pedidosDoPeriodo)) {
    for (const item of pedido.products) {
      const chave = chaveProduto(item.product_id, item.variant_id);
      vendidos.set(chave, (vendidos.get(chave) ?? 0) + item.quantity);
      // Kit cadastrado para o produto inteiro casa com qualquer variante.
      const doProduto = chaveProduto(item.product_id, null);
      vendidos.set(doProduto, (vendidos.get(doProduto) ?? 0) + item.quantity);
    }
  }

  const custoDe = (chave: string) => {
    const { produtoId, varianteId } = partesDaChave(chave);
    return custoUnitarioComKit(indiceCustos, indiceProdutos, produtoId, varianteId ?? 0);
  };

  return produtos
    .filter((p) => p.ehKit)
    .map((kit) => {
      const itens: ItemDoKit[] = kit.componentes.map((c) => {
        const atual = porChave.get(c.chave);
        return {
          chave: c.chave,
          nome: atual?.nome ?? c.nome,
          sku: atual?.sku ?? null,
          quantidade: c.quantidade,
          custoUnitario: atual ? custoDe(c.chave) : null,
          removido: !atual,
        };
      });
      return {
        id: kit.id,
        chave: kit.chave,
        nome: kit.nome,
        sku: kit.sku,
        ativo: kit.ativo,
        itens,
        vendidos: vendidos.get(kit.chave) ?? 0,
        custoUnitario: custoDe(kit.chave),
        temFichaPropria:
          custoUnitarioDe(indiceCustos, kit.produtoId, kit.varianteId ?? 0) !== null,
        itensSemCusto: itens.filter((i) => i.custoUnitario === null).length,
      };
    })
    .sort((a, b) => b.vendidos - a.vendidos || a.nome.localeCompare(b.nome, "pt-BR"));
}

export type ResultadoComposicao =
  | { ok: true; componentes: ComponenteKit[] }
  | { ok: false; mensagem: string };

/**
 * Confere a composicao que chegou do formulario e devolve a que vai para o banco.
 *
 * O formulario so manda CHAVE e QUANTIDADE; o nome e resolvido aqui, a partir
 * do cadastro. Server Action e endpoint publico (5.13): aceitar o nome do
 * navegador deixaria gravar um kit cujo texto nao corresponde ao item.
 *
 * Item repetido vira uma linha so, com as quantidades somadas. Kit que acaba
 * contendo a si mesmo -- direto ou por outro kit -- e recusado: a soma do custo
 * pararia no limite de profundidade e o kit ficaria sem custo sem explicacao.
 */
export function validarComposicao(
  kit: Produto,
  pedidos: Array<{ chave: string; quantidade: number }>,
  produtos: Produto[],
): ResultadoComposicao {
  const porChave = new Map(produtos.map((p) => [p.chave, p]));
  const somadas = new Map<string, number>();

  for (const { chave, quantidade } of pedidos) {
    if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > MAXIMO_QUANTIDADE_ITEM) {
      return { ok: false, mensagem: `Quantidade inválida: use um número inteiro de 1 a ${MAXIMO_QUANTIDADE_ITEM}.` };
    }
    if (chave === kit.chave) {
      return { ok: false, mensagem: "Um kit não pode conter ele mesmo." };
    }
    if (!porChave.has(chave)) {
      return { ok: false, mensagem: "Um dos itens não está mais no cadastro de produtos." };
    }
    somadas.set(chave, (somadas.get(chave) ?? 0) + quantidade);
  }

  if (somadas.size > MAXIMO_ITENS_KIT) {
    return { ok: false, mensagem: `Um kit aceita até ${MAXIMO_ITENS_KIT} itens diferentes.` };
  }

  // Algum item, aberto ate o fim, leva de volta a este kit?
  const contem = (chave: string, alvo: string, profundidade: number): boolean => {
    if (chave === alvo) return true;
    if (profundidade > PROFUNDIDADE_MAXIMA_KIT) return true;
    const produto = porChave.get(chave);
    if (!produto?.ehKit) return false;
    return produto.componentes.some((c) => contem(c.chave, alvo, profundidade + 1));
  };
  for (const chave of somadas.keys()) {
    if (contem(chave, kit.chave, 0)) {
      return {
        ok: false,
        mensagem: `"${porChave.get(chave)!.nome}" já contém este kit (ou vai fundo demais em kits dentro de kits).`,
      };
    }
  }

  return {
    ok: true,
    componentes: [...somadas.entries()].map(([chave, quantidade]) => ({
      chave,
      nome: porChave.get(chave)!.nome,
      quantidade,
    })),
  };
}

/** Tira da observacao o aviso de "falta montar", que deixa de valer quando ha itens. */
export function limparAvisoDeKit(observacao: string | null): string | null {
  if (!observacao) return observacao;
  const limpa = observacao.replace(AVISO_KIT_SEM_COMPOSICAO, "").replace(/\s{2,}/g, " ").trim();
  return limpa === "" ? null : limpa;
}

/**
 * Rotulo de cada produto no campo de escolha. Nome e SKU; quando dois produtos
 * ficam com o mesmo rotulo (a loja real tem o Watermelon duas vezes, o antigo e
 * o novo), entra o numero do produto para distinguir.
 */
export function rotulosParaEscolha(
  produtos: Produto[],
): Array<{ chave: string; rotulo: string; ehKit: boolean }> {
  const base = produtos.map((p) => ({
    chave: p.chave,
    rotulo: p.sku ? `${p.nome} · ${p.sku}` : p.nome,
    ehKit: p.ehKit,
    produtoId: p.produtoId,
  }));
  const vezes = new Map<string, number>();
  for (const b of base) vezes.set(b.rotulo, (vezes.get(b.rotulo) ?? 0) + 1);
  return base
    .map((b) => ({
      chave: b.chave,
      rotulo: (vezes.get(b.rotulo) ?? 0) > 1 ? `${b.rotulo} · nº ${b.produtoId}` : b.rotulo,
      ehKit: b.ehKit,
    }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
}
