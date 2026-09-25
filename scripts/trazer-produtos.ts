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
import { pedidosDoTikTok } from "@/data/tiktokSource";
import { RepositorioPostgres } from "@/data/prismaCostRepository";
import { CUSTO_PROVISORIO, fichasProvisorias, produtosParaCadastrar } from "@/lib/costing";

async function main() {
  const gravar = process.argv.includes("--gravar");

  const repositorio = new RepositorioPostgres();

  // Da COPIA em disco, e nao da API: o cadastro se monta com o que ja foi
  // buscado, e uma busca aqui duplicaria a do timer.
  // Nuvemshop + marketplaces ja sincronizados: o cadastro de produto e um so,
  // e o produto vendido no TikTok precisa de dono, imposto e custo igual.
  const [{ pedidos: daNuvemshop }, doTikTok] = await Promise.all([lerCache(), pedidosDoTikTok()]);
  const pedidos = [...daNuvemshop, ...doTikTok];
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

  // A mesma regra do botao da aba Produtos -- mora em `fichasProvisorias`.
  const lista = fichasProvisorias(pedidos, novos, await repositorio.listarCustos());
  for (const ficha of lista) await repositorio.salvarCusto(ficha);
  const fichas = lista.length;
  const semPreco = novos.length - fichas;

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
