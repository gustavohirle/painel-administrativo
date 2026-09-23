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
 */

import { obterFonteDePedidos, obterRepositorioCadastros } from "../src/data";
import { produtosParaCadastrar } from "../src/lib/costing";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function main() {
  const gravar = process.argv.includes("--gravar");

  const fonte = obterFonteDePedidos();
  const repositorio = await obterRepositorioCadastros();

  const [pedidos, produtos, impostos, influencers] = await Promise.all([
    fonte.listarPedidos(),
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
  console.log(
    "Eles entram SEM ficha de custo: saem do aviso de 'sem cadastro fiscal' e\n" +
      "passam para o de 'produto sem custo', na aba Custos. É lá que se completa.\n",
  );
}

main().catch((erro: unknown) => {
  console.error(erro);
  process.exitCode = 1;
});
