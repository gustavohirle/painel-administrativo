/**
 * Repositorio de cadastros sobre Postgres (Prisma).
 *
 * Usado quando FONTE_DADOS=live. As colunas de dinheiro sao `Decimal` no
 * banco -- correto para valor monetario -- e viram `number` aqui na borda,
 * seguindo a mesma regra dos valores da API: converta uma vez, na entrada.
 *
 * ESTADO: escrito e tipado, porem NAO EXERCITADO contra um banco real -- o
 * projeto roda em modo demonstracao. Antes de confiar nele em producao, rode
 * `npm run db:push && npm run db:seed` e confira uma tela de cada cadastro.
 */

import type { Prisma } from "@prisma/client";

import type {
  BaseComissao,
  CustoProduto,
  EntradaCustoProduto,
  EntradaInfluencer,
  Influencer,
} from "@/types/dominio";
import type {
  AnexoSimples,
  BaseIncidencia,
  EntradaImposto,
  EsferaImposto,
  Imposto,
  RegimeTributario,
} from "@/types/fiscal";
import type {
  ComponenteKit,
  ContagemEstoque,
  EntradaContagemEstoque,
  EntradaProduto,
  OrigemProduto,
  Produto,
} from "@/types/produto";
import type { PerfilUsuario, Usuario } from "@/types/usuario";
import type { RepositorioCadastros } from "@/data/repositorio";
import { prisma } from "@/lib/prisma";

/** Prisma devolve `Decimal` (decimal.js). Converte na borda. */
function decimalParaNumero(valor: Prisma.Decimal | number | null): number {
  if (valor === null) return 0;
  return typeof valor === "number" ? valor : Number(valor.toString());
}

// ---------------------------------------------------------------------------
// Mapeadores
// ---------------------------------------------------------------------------

type Linha<T extends { findFirst: (...args: never[]) => unknown }> = NonNullable<
  Awaited<ReturnType<T["findFirst"]>>
>;

function mapearCusto(linha: Linha<typeof prisma.custoProduto>): CustoProduto {
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

function mapearInfluencer(linha: Linha<typeof prisma.influencer>): Influencer {
  return {
    id: linha.id,
    nome: linha.nome,
    marca: linha.marca,
    percentual: decimalParaNumero(linha.percentual),
    baseComissao: linha.baseComissao as BaseComissao,
    regime: linha.regime as RegimeTributario,
    anexoSimples: linha.anexoSimples as AnexoSimples,
    uf: linha.uf,
    rbt12Manual:
      linha.rbt12Manual === null ? null : decimalParaNumero(linha.rbt12Manual),
    ativo: linha.ativo,
    observacao: linha.observacao,
    atualizadoEm: linha.atualizadoEm.toISOString(),
  };
}

function mapearImposto(linha: Linha<typeof prisma.imposto>): Imposto {
  return {
    id: linha.id,
    nome: linha.nome,
    sigla: linha.sigla,
    esfera: linha.esfera as EsferaImposto,
    baseIncidencia: linha.baseIncidencia as BaseIncidencia,
    aliquota: decimalParaNumero(linha.aliquota),
    regimes: linha.regimes as RegimeTributario[],
    percentualPresuncao:
      linha.percentualPresuncao === null
        ? null
        : decimalParaNumero(linha.percentualPresuncao),
    deducaoMensal:
      linha.deducaoMensal === null ? null : decimalParaNumero(linha.deducaoMensal),
    dentroDoDAS: linha.dentroDoDAS,
    aplicacaoPorProduto: linha.aplicacaoPorProduto,
    ativo: linha.ativo,
    confirmadoPeloContador: linha.confirmadoPeloContador,
    observacao: linha.observacao,
    atualizadoEm: linha.atualizadoEm.toISOString(),
  };
}

function mapearProduto(linha: Linha<typeof prisma.produto>): Produto {
  return {
    id: linha.id,
    chave: linha.chave,
    produtoId: linha.produtoId,
    varianteId: linha.varianteId,
    nome: linha.nome,
    sku: linha.sku,
    ncm: linha.ncm,
    origem: linha.origem as OrigemProduto,
    influencerId: linha.influencerId,
    impostosIds: linha.impostosIds,
    ehKit: linha.ehKit,
    // `componentes` e Json no banco: valida a forma em vez de confiar no cast.
    componentes: Array.isArray(linha.componentes)
      ? (linha.componentes as unknown as ComponenteKit[])
      : [],
    ativo: linha.ativo,
    observacao: linha.observacao,
    atualizadoEm: linha.atualizadoEm.toISOString(),
  };
}

function mapearContagem(linha: Linha<typeof prisma.contagemEstoque>): ContagemEstoque {
  return {
    id: linha.id,
    chave: linha.chave,
    nome: linha.nome,
    quantidade: linha.quantidade,
    dataContagem: linha.dataContagem.toISOString(),
    responsavel: linha.responsavel,
    observacao: linha.observacao,
    registradoEm: linha.registradoEm.toISOString(),
  };
}

function mapearUsuario(linha: Linha<typeof prisma.usuario>): Usuario {
  return {
    id: linha.id,
    nome: linha.nome,
    usuario: linha.usuario,
    perfil: linha.perfil as PerfilUsuario,
    ativo: linha.ativo,
    senhaHash: linha.senhaHash,
    senhaSal: linha.senhaSal,
    criadoEm: linha.criadoEm.toISOString(),
    atualizadoEm: linha.atualizadoEm.toISOString(),
  };
}

// ---------------------------------------------------------------------------

export class RepositorioPostgres implements RepositorioCadastros {
  readonly tipo = "postgres" as const;

  // --- Custo de fabricacao ------------------------------------------------

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
      return mapearCusto(
        await prisma.custoProduto.update({ where: { id }, data: dados }),
      );
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

  // --- Comissoes ----------------------------------------------------------

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
      regime: entrada.regime,
      anexoSimples: entrada.anexoSimples,
      uf: entrada.uf,
      rbt12Manual: entrada.rbt12Manual,
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

  // --- Impostos -----------------------------------------------------------

  async listarImpostos(): Promise<Imposto[]> {
    const linhas = await prisma.imposto.findMany({ orderBy: { nome: "asc" } });
    return linhas.map(mapearImposto);
  }

  async salvarImposto(entrada: EntradaImposto, id?: string): Promise<Imposto> {
    const dados = {
      nome: entrada.nome,
      sigla: entrada.sigla,
      esfera: entrada.esfera,
      baseIncidencia: entrada.baseIncidencia,
      aliquota: entrada.aliquota,
      regimes: entrada.regimes,
      percentualPresuncao: entrada.percentualPresuncao,
      deducaoMensal: entrada.deducaoMensal,
      dentroDoDAS: entrada.dentroDoDAS,
      aplicacaoPorProduto: entrada.aplicacaoPorProduto,
      ativo: entrada.ativo,
      confirmadoPeloContador: entrada.confirmadoPeloContador,
      observacao: entrada.observacao,
    };

    if (id) {
      return mapearImposto(await prisma.imposto.update({ where: { id }, data: dados }));
    }

    return mapearImposto(await prisma.imposto.create({ data: dados }));
  }

  async removerImposto(id: string): Promise<void> {
    // Tira a referencia dos produtos junto: id orfao em `impostosIds` viraria
    // um vinculo invisivel que ninguem consegue desmarcar pela tela.
    const vinculados = await prisma.produto.findMany({
      where: { impostosIds: { has: id } },
      select: { id: true, impostosIds: true },
    });

    await prisma.$transaction([
      ...vinculados.map((p) =>
        prisma.produto.update({
          where: { id: p.id },
          data: { impostosIds: p.impostosIds.filter((i) => i !== id) },
        }),
      ),
      prisma.imposto.delete({ where: { id } }),
    ]);
  }

  // --- Produtos e kits ----------------------------------------------------

  async listarProdutos(): Promise<Produto[]> {
    const linhas = await prisma.produto.findMany({ orderBy: { nome: "asc" } });
    return linhas.map(mapearProduto);
  }

  async salvarProduto(entrada: EntradaProduto, id?: string): Promise<Produto> {
    const dados = {
      chave: entrada.chave,
      produtoId: entrada.produtoId,
      varianteId: entrada.varianteId,
      nome: entrada.nome,
      sku: entrada.sku,
      ncm: entrada.ncm,
      origem: entrada.origem,
      influencerId: entrada.influencerId,
      impostosIds: entrada.impostosIds,
      ehKit: entrada.ehKit,
      componentes: entrada.componentes as unknown as Prisma.InputJsonValue,
      ativo: entrada.ativo,
      observacao: entrada.observacao,
    };

    if (id) {
      return mapearProduto(await prisma.produto.update({ where: { id }, data: dados }));
    }

    // `chave` e unica no schema: upsert evita duas fichas para o mesmo item.
    return mapearProduto(
      await prisma.produto.upsert({
        where: { chave: entrada.chave },
        create: dados,
        update: dados,
      }),
    );
  }

  async removerProduto(id: string): Promise<void> {
    await prisma.produto.delete({ where: { id } });
  }

  // --- Estoque ------------------------------------------------------------

  async listarContagens(): Promise<ContagemEstoque[]> {
    const linhas = await prisma.contagemEstoque.findMany({
      orderBy: { dataContagem: "desc" },
    });
    return linhas.map(mapearContagem);
  }

  async salvarContagem(entrada: EntradaContagemEstoque): Promise<ContagemEstoque> {
    // Contagem e historico: cada registro fica. O saldo usa sempre a mais
    // recente de cada item, entao recontar nao sobrescreve o passado.
    return mapearContagem(
      await prisma.contagemEstoque.create({
        data: {
          chave: entrada.chave,
          nome: entrada.nome,
          quantidade: entrada.quantidade,
          dataContagem: new Date(entrada.dataContagem),
          responsavel: entrada.responsavel,
          observacao: entrada.observacao,
        },
      }),
    );
  }

  async removerContagem(id: string): Promise<void> {
    await prisma.contagemEstoque.delete({ where: { id } });
  }

  // --- Usuarios -----------------------------------------------------------

  async listarUsuarios(): Promise<Usuario[]> {
    const linhas = await prisma.usuario.findMany({ orderBy: { nome: "asc" } });
    return linhas.map(mapearUsuario);
  }

  async buscarUsuarioPorId(id: string): Promise<Usuario | null> {
    const linha = await prisma.usuario.findUnique({ where: { id } });
    return linha ? mapearUsuario(linha) : null;
  }

  async buscarUsuarioPorLogin(usuario: string): Promise<Usuario | null> {
    const linha = await prisma.usuario.findUnique({
      where: { usuario: usuario.trim().toLowerCase() },
    });
    return linha ? mapearUsuario(linha) : null;
  }

  async salvarUsuario(usuario: Usuario): Promise<Usuario> {
    const dados = {
      nome: usuario.nome,
      usuario: usuario.usuario,
      perfil: usuario.perfil,
      ativo: usuario.ativo,
      senhaHash: usuario.senhaHash,
      senhaSal: usuario.senhaSal,
    };

    return mapearUsuario(
      await prisma.usuario.upsert({
        where: { id: usuario.id },
        create: { id: usuario.id, ...dados },
        update: dados,
      }),
    );
  }

  async removerUsuario(id: string): Promise<void> {
    await prisma.usuario.delete({ where: { id } });
  }
}
