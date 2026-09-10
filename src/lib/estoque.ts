/**
 * Estoque, com decomposicao de kit. Funcoes PURAS.
 *
 * O problema que este arquivo resolve: a Nuvemshop entrega o kit como UM
 * produto, com product_id proprio. Ela nao sabe que o "Kit Barba" tira do
 * estoque um tonico e um shampoo. Sem decompor, vender 200 kits nao baixaria
 * nada do estoque dos componentes e a fabrica descobriria a falta na bancada.
 *
 * DECISAO: kit nao tem estoque proprio -- ele e montado sob demanda e consome
 * os componentes. Controlar estoque nos dois niveis contaria a mesma unidade
 * duas vezes.
 */

import { type Pedido } from "@/types/nuvemshop";
import {
  chaveProduto,
  DIAS_ESTOQUE_BAIXO,
  DIAS_ESTOQUE_CRITICO,
  PROFUNDIDADE_MAXIMA_KIT,
  type ChaveProduto,
  type ContagemEstoque,
  type Produto,
  type SaldoEstoque,
} from "@/types/produto";
import { razaoSegura } from "@/lib/format";
import { pedidosRecebidos } from "@/lib/metrics";
import { produtoDoItem, type IndiceProdutos } from "@/lib/impostos";

export interface UnidadeConsumida {
  chave: ChaveProduto;
  nome: string;
  quantidade: number;
}

/**
 * Expande um item vendido nas unidades que ele realmente consome.
 *
 * Item comum devolve ele mesmo. Kit devolve os componentes, multiplicados pela
 * quantidade vendida. Kit dentro de kit e resolvido recursivamente.
 */
export function expandirItemVendido(
  indice: IndiceProdutos,
  produtoId: number,
  varianteId: number,
  quantidade: number,
  nomeOriginal: string,
  profundidade = 0,
): UnidadeConsumida[] {
  const produto = produtoDoItem(indice, produtoId, varianteId);

  const naoEhKit =
    !produto ||
    !produto.ehKit ||
    produto.componentes.length === 0 ||
    profundidade >= PROFUNDIDADE_MAXIMA_KIT;

  if (naoEhKit) {
    return [
      {
        chave: chaveProduto(produtoId, varianteId),
        nome: produto?.nome ?? nomeOriginal,
        quantidade,
      },
    ];
  }

  return produto.componentes.flatMap((componente) => {
    const [p, v] = componente.chave.split(":");
    const componenteProdutoId = Number(p);
    const componenteVarianteId = v === "*" || v === undefined ? 0 : Number(v);

    return expandirItemVendido(
      indice,
      componenteProdutoId,
      componenteVarianteId,
      quantidade * componente.quantidade,
      componente.nome,
      profundidade + 1,
    );
  });
}

/**
 * Unidades consumidas por item, no conjunto de pedidos.
 *
 * `desde` filtra por data de criacao do pedido -- e o que permite calcular
 * "quanto saiu depois da ultima contagem".
 */
export function unidadesConsumidas(
  pedidos: Pedido[],
  indice: IndiceProdutos,
  desde?: string,
): Map<ChaveProduto, number> {
  const total = new Map<ChaveProduto, number>();

  for (const pedido of pedidosRecebidos(pedidos)) {
    if (desde && pedido.created_at < desde) continue;

    for (const item of pedido.products) {
      const unidades = expandirItemVendido(
        indice,
        item.product_id,
        item.variant_id,
        item.quantity,
        item.name,
      );

      for (const unidade of unidades) {
        total.set(unidade.chave, (total.get(unidade.chave) ?? 0) + unidade.quantidade);
      }
    }
  }

  return total;
}

/** Nome legivel de cada chave, a partir do cadastro e das vendas. */
function mapearNomes(
  produtos: Produto[],
  pedidos: Pedido[],
  indice: IndiceProdutos,
): Map<ChaveProduto, { nome: string; sku: string | null }> {
  const nomes = new Map<ChaveProduto, { nome: string; sku: string | null }>();

  for (const produto of produtos) {
    nomes.set(produto.chave, { nome: produto.nome, sku: produto.sku });
  }

  // Itens vendidos que ainda nao foram cadastrados tambem precisam de nome,
  // senao somem da tela justamente por estarem faltando.
  for (const pedido of pedidosRecebidos(pedidos)) {
    for (const item of pedido.products) {
      for (const unidade of expandirItemVendido(
        indice,
        item.product_id,
        item.variant_id,
        item.quantity,
        item.name,
      )) {
        if (!nomes.has(unidade.chave)) {
          nomes.set(unidade.chave, { nome: unidade.nome, sku: item.sku });
        }
      }
    }
  }

  return nomes;
}

function classificar(
  saldo: number | null,
  dias: number | null,
): SaldoEstoque["situacao"] {
  if (saldo === null) return "sem_contagem";
  if (saldo < 0) return "negativo";
  if (dias === null) return saldo === 0 ? "critico" : "saudavel";
  if (dias <= DIAS_ESTOQUE_CRITICO) return "critico";
  if (dias <= DIAS_ESTOQUE_BAIXO) return "baixo";
  return "saudavel";
}

export interface OpcoesSaldo {
  /** Pedidos do periodo em analise, para medir o ritmo de venda. */
  pedidosDoPeriodo: Pedido[];
  /** Base inteira, para descontar o que saiu desde a contagem. */
  pedidosHistorico: Pedido[];
  /** Dias que o periodo analisado cobre. Usado no calculo de cobertura. */
  diasDoPeriodo: number;
}

/**
 * Saldo de cada item.
 *
 *   saldo atual = ultima contagem - unidades consumidas desde a contagem
 *
 * Repare que e uma funcao pura da contagem e dos pedidos: rodar duas vezes da
 * o mesmo numero. Um saldo mutavel, decrementado a cada apuracao, iria a zero
 * sozinho a cada recarga da pagina.
 */
export function calcularSaldos(
  produtos: Produto[],
  contagens: ContagemEstoque[],
  opcoes: OpcoesSaldo,
): SaldoEstoque[] {
  const indice = {
    porVariante: new Map<ChaveProduto, Produto>(),
    porProduto: new Map<number, Produto>(),
  };
  for (const produto of produtos) {
    if (!produto.ativo) continue;
    if (produto.varianteId === null) indice.porProduto.set(produto.produtoId, produto);
    else indice.porVariante.set(produto.chave, produto);
  }

  // Ultima contagem de cada item.
  const ultimaContagem = new Map<ChaveProduto, ContagemEstoque>();
  for (const contagem of contagens) {
    const atual = ultimaContagem.get(contagem.chave);
    if (!atual || contagem.dataContagem > atual.dataContagem) {
      ultimaContagem.set(contagem.chave, contagem);
    }
  }

  const consumoNoPeriodo = unidadesConsumidas(opcoes.pedidosDoPeriodo, indice);
  const nomes = mapearNomes(produtos, opcoes.pedidosDoPeriodo, indice);

  // Uma varredura do historico por DATA DE CONTAGEM distinta, nao por item.
  // Varias contagens costumam ser feitas no mesmo dia; sem este cache, cada
  // item refazia a varredura inteira dos 45 mil pedidos.
  const consumoDesde = new Map<string, Map<ChaveProduto, number>>();
  for (const contagem of ultimaContagem.values()) {
    if (consumoDesde.has(contagem.dataContagem)) continue;
    consumoDesde.set(
      contagem.dataContagem,
      unidadesConsumidas(opcoes.pedidosHistorico, indice, contagem.dataContagem),
    );
  }

  // Kits nao tem saldo proprio: quem tem estoque sao os componentes.
  const chavesDeKit = new Set(
    produtos.filter((p) => p.ehKit && p.componentes.length > 0).map((p) => p.chave),
  );

  const chaves = new Set<ChaveProduto>([
    ...nomes.keys(),
    ...ultimaContagem.keys(),
    ...consumoNoPeriodo.keys(),
  ]);

  const saldos: SaldoEstoque[] = [];

  for (const chave of chaves) {
    if (chavesDeKit.has(chave)) continue;

    const contagem = ultimaContagem.get(chave) ?? null;
    const vendidoNoPeriodo = consumoNoPeriodo.get(chave) ?? 0;

    const vendidoDesdeContagem = contagem
      ? (consumoDesde.get(contagem.dataContagem)?.get(chave) ?? 0)
      : 0;

    const saldoAtual = contagem ? contagem.quantidade - vendidoDesdeContagem : null;

    const porDia = razaoSegura(vendidoNoPeriodo, opcoes.diasDoPeriodo);
    const diasDeCobertura =
      saldoAtual === null || porDia <= 0 ? null : saldoAtual / porDia;

    const info = nomes.get(chave);

    saldos.push({
      chave,
      nome: contagem?.nome ?? info?.nome ?? chave,
      sku: info?.sku ?? null,
      quantidadeContada: contagem?.quantidade ?? null,
      dataContagem: contagem?.dataContagem ?? null,
      vendidoDesdeContagem,
      saldoAtual,
      vendidoNoPeriodo,
      diasDeCobertura,
      situacao: classificar(saldoAtual, diasDeCobertura),
    });
  }

  // Mais urgente primeiro: quem tem menos dias de cobertura lidera.
  const ordem: Record<SaldoEstoque["situacao"], number> = {
    negativo: 0,
    critico: 1,
    baixo: 2,
    sem_contagem: 3,
    saudavel: 4,
  };

  return saldos.sort((a, b) => {
    const diferenca = ordem[a.situacao] - ordem[b.situacao];
    if (diferenca !== 0) return diferenca;
    return b.vendidoNoPeriodo - a.vendidoNoPeriodo;
  });
}

export interface ResumoEstoque {
  itens: number;
  semContagem: number;
  negativos: number;
  criticos: number;
  baixos: number;
  saudaveis: number;
}

export function resumirEstoque(saldos: SaldoEstoque[]): ResumoEstoque {
  return {
    itens: saldos.length,
    semContagem: saldos.filter((s) => s.situacao === "sem_contagem").length,
    negativos: saldos.filter((s) => s.situacao === "negativo").length,
    criticos: saldos.filter((s) => s.situacao === "critico").length,
    baixos: saldos.filter((s) => s.situacao === "baixo").length,
    saudaveis: saldos.filter((s) => s.situacao === "saudavel").length,
  };
}
