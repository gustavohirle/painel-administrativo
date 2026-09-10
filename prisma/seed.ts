/**
 * Popula o Postgres com os cadastros iniciais.
 *
 * So faz sentido no modo `live`. Serve para o primeiro boot com banco real ter
 * conteudo em vez de tela vazia. Rodar com: npm run db:seed
 *
 * E idempotente: rodar duas vezes nao duplica nada.
 */

import { PrismaClient } from "@prisma/client";

import { custosIniciais, influencersIniciais } from "@/data/costRepository";

const prisma = new PrismaClient();

async function main() {
  const custos = custosIniciais();
  const influencers = influencersIniciais();

  console.log(
    `Semeando ${custos.length} fichas de custo e ${influencers.length} contratos...`,
  );

  for (const custo of custos) {
    const existente = await prisma.custoProduto.findFirst({
      where: { produtoId: custo.produtoId, varianteId: custo.varianteId },
    });

    const dados = {
      produtoId: custo.produtoId,
      varianteId: custo.varianteId,
      sku: custo.sku,
      nome: custo.nome,
      custoMateriaPrima: custo.custoMateriaPrima,
      custoEmbalagem: custo.custoEmbalagem,
      custoMaoDeObra: custo.custoMaoDeObra,
      custoIndireto: custo.custoIndireto,
    };

    if (existente) {
      await prisma.custoProduto.update({ where: { id: existente.id }, data: dados });
    } else {
      await prisma.custoProduto.create({ data: dados });
    }
  }

  for (const influencer of influencers) {
    const existente = await prisma.influencer.findFirst({
      where: { nome: influencer.nome, marca: influencer.marca },
    });

    const dados = {
      nome: influencer.nome,
      marca: influencer.marca,
      percentual: influencer.percentual,
      baseComissao: influencer.baseComissao,
      ativo: influencer.ativo,
      observacao: influencer.observacao,
    };

    if (existente) {
      await prisma.influencer.update({ where: { id: existente.id }, data: dados });
    } else {
      await prisma.influencer.create({ data: dados });
    }
  }

  console.log("Pronto.");
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
