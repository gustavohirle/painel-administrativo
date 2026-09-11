/**
 * Popula o Postgres com os cadastros iniciais.
 *
 * So faz sentido no modo `live`. Serve para o primeiro boot com banco real ter
 * conteudo em vez de tela vazia. Rodar com: npm run db:seed
 *
 * E idempotente: rodar duas vezes nao duplica nada, porque passa pelo mesmo
 * repositorio que a aplicacao usa -- e ele resolve por chave, nao por insercao
 * cega. A excecao proposital sao as contagens de estoque, que sao historico:
 * so entram quando a tabela esta vazia.
 */

import { RepositorioPostgres } from "@/data/prismaCostRepository";
import {
  contagensIniciais,
  custosIniciais,
  impostosIniciais,
  influencersIniciais,
  produtosIniciais,
  usuariosIniciais,
} from "@/data/seeds";
import { prisma } from "@/lib/prisma";

async function main() {
  const repositorio = new RepositorioPostgres();

  // --- Impostos primeiro: os produtos referenciam os ids deles ------------
  const impostosDesejados = impostosIniciais();
  const impostosExistentes = await repositorio.listarImpostos();
  const impostosSalvos = [];

  for (const imposto of impostosDesejados) {
    const existente = impostosExistentes.find((i) => i.sigla === imposto.sigla);
    const { id: _ignorado, atualizadoEm: _tambem, ...entrada } = imposto;
    impostosSalvos.push(await repositorio.salvarImposto(entrada, existente?.id));
  }
  console.log(`impostos: ${impostosSalvos.length}`);

  // --- Influencers ---------------------------------------------------------
  // Antes dos produtos: o produto herda os impostos do regime do influencer.
  const influencers = influencersIniciais();
  const jaCadastrados = await repositorio.listarInfluencers();
  const influencersSalvos = [];
  for (const influencer of influencers) {
    const existente = jaCadastrados.find(
      (i) => i.nome === influencer.nome && i.marca === influencer.marca,
    );
    const { id: _id, atualizadoEm: _em, ...entrada } = influencer;
    influencersSalvos.push(
      await repositorio.salvarInfluencer(entrada, existente?.id),
    );
  }
  console.log(`contratos de comissao: ${influencersSalvos.length}`);

  // --- Produtos ------------------------------------------------------------
  const produtos = produtosIniciais(impostosSalvos, influencersSalvos);
  for (const produto of produtos) {
    const { id: _id, atualizadoEm: _em, ...entrada } = produto;
    await repositorio.salvarProduto(entrada);
  }
  console.log(`produtos: ${produtos.length}`);

  // --- Custos --------------------------------------------------------------
  const custos = custosIniciais();
  for (const custo of custos) {
    const { id: _id, atualizadoEm: _em, ...entrada } = custo;
    await repositorio.salvarCusto(entrada);
  }
  console.log(`fichas de custo: ${custos.length}`);

  // --- Usuarios ------------------------------------------------------------
  for (const usuario of await usuariosIniciais()) {
    const existente = await repositorio.buscarUsuarioPorLogin(usuario.usuario);
    // Nao sobrescreve a senha de um usuario que ja existe: o dono pode ja ter
    // trocado a dele, e resemear jogaria a senha de volta para a de teste.
    if (existente) continue;
    await repositorio.salvarUsuario(usuario);
  }
  console.log("usuarios: ok");

  // --- Estoque -------------------------------------------------------------
  const contagensExistentes = await repositorio.listarContagens();
  if (contagensExistentes.length === 0) {
    const contagens = contagensIniciais(await repositorio.listarProdutos());
    for (const contagem of contagens) {
      const { id: _id, registradoEm: _em, ...entrada } = contagem;
      await repositorio.salvarContagem(entrada);
    }
    console.log(`contagens de estoque: ${contagens.length}`);
  } else {
    console.log("contagens de estoque: ja havia historico, nada semeado");
  }

  console.log("\nPronto.");
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
