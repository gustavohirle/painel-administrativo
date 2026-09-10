/**
 * Repositorio de cadastros sobre Postgres (Prisma).
 *
 * Usado quando FONTE_DADOS=live. As colunas de dinheiro sao `Decimal` no
 * banco -- correto para valor monetario -- e viram `number` aqui na borda,
 * seguindo a mesma regra dos valores da API: converta uma vez, na entrada.
 */

import type { Prisma } from "@prisma/client";

import type {
  CustoProduto,
  EntradaCustoProduto,
  EntradaInfluencer,
  Influencer,
} from "@/types/dominio";
import type { BaseComissao } from "@/types/dominio";
import type { RepositorioCadastros } from "@/data/costRepository";
import { prisma } from "@/lib/prisma";

/** Prisma devolve `Decimal` (decimal.js). Converte na borda. */
function decimalParaNumero(valor: Prisma.Decimal | number | null): number {
  if (valor === null) return 0;
  return typeof valor === "number" ? valor : Number(valor.toString());
}

type LinhaCusto = Awaited<ReturnType<typeof prisma.custoProduto.findFirst>>;
type LinhaInfluencer = Awaited<ReturnType<typeof prisma.influencer.findFirst>>;

function mapearCusto(linha: NonNullable<LinhaCusto>): CustoProduto {
  return {
    id: linha.id,
    produtoId: linha.produtoId,
    varianteId: linha.varianteId,
    sku: linha.sku,
    nome: linha.nome,
    custoMateriaPrima: decimalParaNumero(linha.custoMateriaPrima),
    custoEmbalagem: decimalParaNumero(linha.custoEmbalagem),
    custoMaoDeObra: decimalParaNumero(linha.custoMaoDeObra),
    custoIndireto: decimalParaNumero(linha.custoIndireto),
    atualizadoEm: linha.atualizadoEm.toISOString(),
  };
}

function mapearInfluencer(linha: NonNullable<LinhaInfluencer>): Influencer {
  return {
    id: linha.id,
    nome: linha.nome,
    marca: linha.marca,
    percentual: decimalParaNumero(linha.percentual),
    baseComissao: linha.baseComissao as BaseComissao,
    ativo: linha.ativo,
    observacao: linha.observacao,
    atualizadoEm: linha.atualizadoEm.toISOString(),
  };
}

export class RepositorioPostgres implements RepositorioCadastros {
  readonly tipo = "postgres" as const;

  async listarCustos(): Promise<CustoProduto[]> {
    const linhas = await prisma.custoProduto.findMany({ orderBy: { nome: "asc" } });
    return linhas.map(mapearCusto);
  }

  async salvarCusto(
    entrada: EntradaCustoProduto,
    id?: string,
  ): Promise<CustoProduto> {
    const dados = {
      produtoId: entrada.produtoId,
      varianteId: entrada.varianteId,
      sku: entrada.sku,
      nome: entrada.nome,
      custoMateriaPrima: entrada.custoMateriaPrima,
      custoEmbalagem: entrada.custoEmbalagem,
      custoMaoDeObra: entrada.custoMaoDeObra,
      custoIndireto: entrada.custoIndireto,
    };

    if (id) {
      return mapearCusto(await prisma.custoProduto.update({ where: { id }, data: dados }));
    }

    // Uma ficha por produto/variante. O @@unique do schema nao cobre o caso
    // varianteId = NULL (no Postgres NULLs sao distintos num indice unico),
    // entao a checagem tem que acontecer aqui.
    const existente = await prisma.custoProduto.findFirst({
      where: { produtoId: entrada.produtoId, varianteId: entrada.varianteId },
    });

    if (existente) {
      return mapearCusto(
        await prisma.custoProduto.update({ where: { id: existente.id }, data: dados }),
      );
    }

    return mapearCusto(await prisma.custoProduto.create({ data: dados }));
  }

  async removerCusto(id: string): Promise<void> {
    await prisma.custoProduto.delete({ where: { id } });
  }

  async listarInfluencers(): Promise<Influencer[]> {
    const linhas = await prisma.influencer.findMany({ orderBy: { nome: "asc" } });
    return linhas.map(mapearInfluencer);
  }

  async salvarInfluencer(
    entrada: EntradaInfluencer,
    id?: string,
  ): Promise<Influencer> {
    const dados = {
      nome: entrada.nome,
      marca: entrada.marca,
      percentual: entrada.percentual,
      baseComissao: entrada.baseComissao,
      ativo: entrada.ativo,
      observacao: entrada.observacao,
    };

    if (id) {
      return mapearInfluencer(
        await prisma.influencer.update({ where: { id }, data: dados }),
      );
    }

    return mapearInfluencer(await prisma.influencer.create({ data: dados }));
  }

  async removerInfluencer(id: string): Promise<void> {
    await prisma.influencer.delete({ where: { id } });
  }
}
