/**
 * Traz para o cadastro os produtos VENDIDOS que ainda nao estao nele.
 *
 *     npm run produtos:trazer              # so mostra o que entraria
 *     npm run produtos:trazer -- --gravar
 *
 * E o mesmo `produtosParaCadastrar` do botao "Trazer da Nuvemshop" da aba
 * Produtos (5.11), pela linha de comando. Existe porque a janela passou de 3
 * para 13 meses em 23/09/2026: o cadastro foi montado com o que vendia em
 * julho-setembro, e os meses de 2025 trazem itens que ninguem cadastrou.
 *
 * Sem o catalogo da API: aqui o nome e o SKU saem das VENDAS. Quem quiser o
 * nome atual da loja e o aviso de item despublicado usa o botao da tela, que
 * chama `listarCatalogo`.
 *
 * Junto com o produto entra uma FICHA DE CUSTO PROVISORIA de 35% do preco
 * medio pago, a mesma regra das 133 fichas de 17/09/2026 (secao 13) -- pedido
 * do dono, para o painel ter base ate os custos reais chegarem. O valor inteiro
 * vai em materia-prima e os outros tres componentes ficam em zero: e por ai que
 * se acham depois as fichas que ainda sao chute.
 */

/*
 * Importa o repositorio e o cache DIRETO, sem passar por `data/index.ts`: ele
 * carrega `server-only`, que existe justamente para estourar fora de um Server
 * Component -- e um script de linha de comando nao e um. Mesmo caminho do
 * `prisma/seed.ts` e do `scripts/nuvemshop.ts`.
 */
import { lerCache } from "@/data/cachePedidos";
import { RepositorioPostgres } from "@/data/prismaCostRepository";
import { produtosParaCadastrar } from "@/lib/costing";
import { pedidosRecebidos } from "@/lib/metrics";
import { chaveProduto } from "@/types/produto";
import { paraNumero } from "@/types/nuvemshop";

/** Fracao do preco de venda que vira custo provisorio (secao 13). */
const CUSTO_PROVISORIO = 0.35;

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function main() {
  const gravar = process.argv.includes("--gravar");

  const repositorio = new RepositorioPostgres();

  // Da COPIA em disco, e nao da API: o cadastro se monta com o que ja foi
  // buscado, e uma busca aqui duplicaria a do timer.
  const { pedidos } = await lerCache();
  const [produtos, impostos, influencers] = await Promise.all([
    repositorio.listarProdutos(),
    repositorio.listarImpostos(),
    repositorio.listarInfluencers(),
  ]);

  console.log(`\n${pedidos.length} pedidos na cópia, ${produtos.length} produtos no cadastro.`);

  const novos = produtosParaCadastrar(pedidos, produtos, impostos, influencers);

  if (novos.length === 0) {
    console.log("\nNenhum produto novo: o cadastro já cobre tudo que foi vendido.\n");
    return;
  }

  const porMarca = new Map<string, number>();
  for (const p of novos) {
    const marca = p.marca ?? "(sem loja)";
    porMarca.set(marca, (porMarca.get(marca) ?? 0) + 1);
  }

  console.log(`\n${novos.length} produto(s) vendido(s) fora do cadastro:\n`);
  for (const [marca, quantos] of [...porMarca].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(quantos).padStart(4)}  ${marca}`);
  }

  const kits = novos.filter((p) => p.ehKit).length;
  const semDono = novos.filter((p) => p.influencerId === null).length;
  console.log(`\n  ${kits} reconhecido(s) como kit (pelo nome), a montar depois`);
  if (semDono > 0) {
    console.log(`  ${semDono} SEM DONO: a loja deles não tem influencer ativo`);
  }

  console.log(
    `\n  Cada um entra com ficha PROVISÓRIA de ${CUSTO_PROVISORIO * 100}% do preço médio pago.`,
  );
  console.log(`\n  20 primeiros:`);
  for (const p of novos.slice(0, 20)) {
    console.log(
      `    ${String(p.nome).slice(0, 52).padEnd(52)} ${p.ehKit ? "kit" : "   "}  ${p.marca ?? "-"}`,
    );
  }

  if (!gravar) {
    console.log(`\nNada foi gravado. Para aplicar:\n  npm run produtos:trazer -- --gravar\n`);
    return;
  }

  /*
   * Um por vez, e nao em paralelo: o repositorio de demonstracao rele o
   * arquivo a cada chamada (armadilha 2), e em paralelo as gravacoes se
   * sobrescreveriam. No Postgres nao faria diferenca, mas a mesma funcao serve
   * aos dois.
   */
  let gravados = 0;
  for (const entrada of novos) {
    await repositorio.salvarProduto(entrada);
    gravados++;
  }
  console.log(`\n${gravados} produto(s) cadastrado(s).`);

  /*
   * O preco medio PAGO de cada variante, e nao o de tabela: e o que entrou de
   * verdade. So pedidos recebidos entram, pela mesma razao do CMV (5.7) --
   * boleto nunca pago nao chegou a ser produzido.
   */
  const soma = new Map<string, { valor: number; unidades: number }>();
  for (const pedido of pedidosRecebidos(pedidos)) {
    for (const item of pedido.products) {
      const chave = chaveProduto(item.product_id, item.variant_id);
      const quantidade = Number(item.quantity ?? 0);
      if (quantidade <= 0) continue;
      const atual = soma.get(chave) ?? { valor: 0, unidades: 0 };
      atual.valor += paraNumero(item.price) * quantidade;
      atual.unidades += quantidade;
      soma.set(chave, atual);
    }
  }

  const custosExistentes = await repositorio.listarCustos();
  const jaTemFicha = new Set(
    custosExistentes.map((c) => chaveProduto(c.produtoId, c.varianteId ?? 0)),
  );

  let fichas = 0;
  let semPreco = 0;

  for (const entrada of novos) {
    const chave = chaveProduto(entrada.produtoId, entrada.varianteId);
    if (jaTemFicha.has(chave)) continue;

    const vendas = soma.get(chave);
    /*
     * Sem preco nao ha o que estimar. Sao os brindes a R$ 0 e os itens que so
     * sairam dentro de kit: inventar um custo para eles seria pior que a
     * lacuna, porque a lacuna a tela declara e o numero inventado, nao.
     */
    if (!vendas || vendas.unidades === 0 || vendas.valor <= 0) {
      semPreco++;
      continue;
    }

    const precoMedio = vendas.valor / vendas.unidades;
    await repositorio.salvarCusto({
      produtoId: entrada.produtoId,
      varianteId: entrada.varianteId,
      sku: entrada.sku,
      nome: entrada.nome,
      // Tudo em materia-prima: e por ai que se acha o que ainda e chute.
      custoMateriaPrima: Math.round(precoMedio * CUSTO_PROVISORIO * 100) / 100,
      custoEmbalagem: 0,
      custoMaoDeObra: 0,
      custoIndireto: 0,
    });
    fichas++;
  }

  console.log(
    `${fichas} ficha(s) de custo provisória(s) a ${CUSTO_PROVISORIO * 100}% do preço médio pago.`,
  );
  if (semPreco > 0) {
    console.log(
      `${semPreco} ficaram SEM ficha por não terem preço (brinde a R$ 0 ou item que só sai em kit).`,
    );
  }
  console.log(
    "\nOs valores são PROVISÓRIOS: 35% do preço de venda, com tudo em\n" +
      "matéria-prima e os outros três componentes em zero. É por aí que se\n" +
      "acham na aba Custos para trocar pelos reais.\n",
  );
}

main().catch((erro: unknown) => {
  console.error(erro);
  process.exitCode = 1;
});
