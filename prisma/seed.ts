/**
 * Prepara o Postgres do modo `live` para o primeiro uso.
 *
 * Rodar com: npm run db:seed:live   (le o .env.live)
 *
 * O que entra, e o que NAO entra:
 *
 * - ENTRAM os pontos de partida que valem para qualquer empresa: o catalogo de
 *   tributos (secao 5.10), as aliquotas internas dos 27 estados (5.10.1) e as
 *   taxas de meio de pagamento (5.13.1). Todos nascem "nao confirmados", como
 *   na demonstracao, e sao editaveis nas telas.
 * - ENTRAM os dois usuarios, com a senha tirada de SENHA_DONO e SENHA_ESTOQUE.
 *   As senhas da demonstracao estao publicadas no CLAUDE.md e no GitHub; com
 *   dado real, usa-las entregaria o financeiro a quem as leu.
 * - NAO ENTRAM influencers, produtos, fichas de custo, contagens de estoque,
 *   ordens nem despesas. Os da demonstracao sao inventados, com marcas que
 *   nao existem: contratos apontando para "Aurora Cosmeticos" nao casariam com
 *   pedido nenhum (armadilha 9) e o painel mostraria custo e estoque de
 *   produtos ficticios ao lado de vendas reais. Esses cadastros sao feitos
 *   nas telas, com os nomes das lojas de verdade.
 *
 * E idempotente: rodar de novo nao duplica nada e nao troca a senha de quem
 * ja existe (o dono pode ter trocado a dele).
 */

import { RepositorioPostgres } from "@/data/prismaCostRepository";
import {
  CREDENCIAIS_DEMO,
  aliquotasEstaduaisIniciais,
  impostosIniciais,
  taxasPlataformaIniciais,
} from "@/data/seeds";
import { criarHashSenha } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { PerfilUsuario } from "@/types/usuario";

const SENHAS_PUBLICADAS = new Set(CREDENCIAIS_DEMO.map((c) => c.senha));

function senhaDoAmbiente(variavel: string): string {
  const senha = process.env[variavel] ?? "";
  if (senha.length < 12) {
    throw new Error(`${variavel} precisa ter pelo menos 12 caracteres (está no .env.live).`);
  }
  if (SENHAS_PUBLICADAS.has(senha)) {
    throw new Error(`${variavel} é uma senha da demonstração, que é pública. Escolha outra.`);
  }
  return senha;
}

async function main() {
  const repositorio = new RepositorioPostgres();

  // --- Tributos ------------------------------------------------------------
  const existentes = await repositorio.listarImpostos();
  let novosImpostos = 0;
  for (const imposto of impostosIniciais()) {
    // Tributo que ja existe fica como esta: o contador pode ter ajustado.
    if (existentes.some((i) => i.sigla === imposto.sigla)) continue;
    const { id: _id, atualizadoEm: _em, ...entrada } = imposto;
    await repositorio.salvarImposto(entrada);
    novosImpostos += 1;
  }
  console.log(`tributos: ${novosImpostos} novos, ${existentes.length} já existiam`);

  // --- Aliquotas estaduais (DIFAL) -----------------------------------------
  const aliquotasExistentes = await repositorio.listarAliquotasEstaduais();
  let novasAliquotas = 0;
  for (const aliquota of aliquotasEstaduaisIniciais()) {
    if (aliquotasExistentes.some((a) => a.uf === aliquota.uf)) continue;
    const { atualizadoEm: _em, ...entrada } = aliquota;
    await repositorio.salvarAliquotaEstadual(entrada);
    novasAliquotas += 1;
  }
  console.log(`alíquotas estaduais: ${novasAliquotas} novas`);

  // --- Taxas de meio de pagamento ------------------------------------------
  const taxasExistentes = await repositorio.listarTaxasPlataforma();
  let novasTaxas = 0;
  for (const taxa of taxasPlataformaIniciais()) {
    if (taxasExistentes.some((t) => t.metodo === taxa.metodo)) continue;
    const { atualizadoEm: _em, ...entrada } = taxa;
    await repositorio.salvarTaxaPlataforma(entrada);
    novasTaxas += 1;
  }
  console.log(`taxas de pagamento: ${novasTaxas} novas`);

  // --- Usuarios ------------------------------------------------------------
  const agora = new Date().toISOString();
  const usuarios: Array<{ id: string; nome: string; usuario: string; perfil: PerfilUsuario; variavel: string }> = [
    { id: "usuario-dono", nome: "Dono", usuario: "dono", perfil: "dono", variavel: "SENHA_DONO" },
    { id: "usuario-estoque", nome: "Estoque", usuario: "estoque", perfil: "estoque", variavel: "SENHA_ESTOQUE" },
  ];
  for (const { variavel, ...dados } of usuarios) {
    if (await repositorio.buscarUsuarioPorLogin(dados.usuario)) {
      console.log(`usuário ${dados.usuario}: já existe, senha mantida`);
      continue;
    }
    await repositorio.salvarUsuario({
      ...dados,
      ...(await criarHashSenha(senhaDoAmbiente(variavel))),
      ativo: true,
      criadoEm: agora,
      atualizadoEm: agora,
    });
    console.log(`usuário ${dados.usuario}: criado`);
  }

  console.log("\nPronto. Contratos, produtos e custos são cadastrados nas telas.");
}

main()
  .catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
