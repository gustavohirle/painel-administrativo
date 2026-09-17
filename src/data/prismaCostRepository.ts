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

import { Prisma } from "@prisma/client";

import type {
  BaseComissao,
  CustoProduto,
  DespesaInfluencer,
  EntradaCustoProduto,
  EntradaDespesaInfluencer,
  EntradaInfluencer,
  Influencer,
} from "@/types/dominio";
import { CATEGORIAS_DESPESA } from "@/types/dominio";
import type {
  AliquotaEstado,
  AnexoSimples,
  BaseIncidencia,
  EntradaAliquotaEstado,
  EntradaImposto,
  EsferaImposto,
  Imposto,
  RegimeTributario,
} from "@/types/fiscal";
import type {
  AssinaturaOrdem,
  EntradaOrdem,
  ItemOrdem,
  OrdemFabricacao,
  SituacaoOrdem,
} from "@/types/ordemFabricacao";
import type {
  EntradaTaxaPlataforma,
  TaxaPlataforma,
} from "@/types/plataforma";
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
import { novoToken, proximoNumero } from "@/lib/ordens";
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
    marca: linha.marca,
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
    // Despesa de influencer removido sairia do lucro sem aparecer em tela.
    await prisma.despesaInfluencer.deleteMany({ where: { influencerId: id } });
    await prisma.influencer.delete({ where: { id } });
  }

  // --- Despesas de influencer ---------------------------------------------

  async listarDespesasInfluencer(): Promise<DespesaInfluencer[]> {
    const linhas = await prisma.despesaInfluencer.findMany({
      orderBy: [{ data: "desc" }, { atualizadoEm: "desc" }],
    });
    return linhas.map(mapearDespesa);
  }

  async salvarDespesaInfluencer(
    entrada: EntradaDespesaInfluencer,
    id?: string,
  ): Promise<DespesaInfluencer> {
    const dados = {
      influencerId: entrada.influencerId,
      data: new Date(`${entrada.data}T00:00:00Z`),
      categoria: entrada.categoria,
      descricao: entrada.descricao,
      valor: entrada.valor,
    };

    const linha = id
      ? await prisma.despesaInfluencer.update({ where: { id }, data: dados })
      : await prisma.despesaInfluencer.create({ data: dados });

    return mapearDespesa(linha);
  }

  async removerDespesaInfluencer(id: string): Promise<void> {
    await prisma.despesaInfluencer.delete({ where: { id } });
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

  // --- DIFAL --------------------------------------------------------------

  async listarAliquotasEstaduais(): Promise<AliquotaEstado[]> {
    const linhas = await prisma.aliquotaEstado.findMany({ orderBy: { uf: "asc" } });
    return linhas.map((linha) => ({
      uf: linha.uf,
      nome: linha.nome,
      aliquotaInterna: decimalParaNumero(linha.aliquotaInterna),
      ativo: linha.ativo,
      confirmadoPeloContador: linha.confirmadoPeloContador,
      observacao: linha.observacao,
      atualizadoEm: linha.atualizadoEm.toISOString(),
    }));
  }

  // --- Taxas de plataforma ------------------------------------------------

  async listarTaxasPlataforma(): Promise<TaxaPlataforma[]> {
    const linhas = await prisma.taxaPlataforma.findMany({
      orderBy: { metodo: "asc" },
    });

    return linhas.map((linha) => ({
      metodo: linha.metodo,
      percentual: decimalParaNumero(linha.percentual),
      valorFixo: decimalParaNumero(linha.valorFixo),
      base: linha.base === "recebido" ? "recebido" : "bruto",
      ativa: linha.ativa,
      confirmadaNaFatura: linha.confirmadaNaFatura,
      observacao: linha.observacao,
      atualizadoEm: linha.atualizadoEm.toISOString(),
    }));
  }

  async salvarTaxaPlataforma(
    entrada: EntradaTaxaPlataforma,
  ): Promise<TaxaPlataforma> {
    const dados = {
      percentual: entrada.percentual,
      valorFixo: entrada.valorFixo,
      base: entrada.base,
      ativa: entrada.ativa,
      confirmadaNaFatura: entrada.confirmadaNaFatura,
      observacao: entrada.observacao,
    };

    // O metodo e a chave primaria: upsert garante um registro por meio.
    const linha = await prisma.taxaPlataforma.upsert({
      where: { metodo: entrada.metodo },
      create: { metodo: entrada.metodo, ...dados },
      update: dados,
    });

    return {
      metodo: linha.metodo,
      percentual: decimalParaNumero(linha.percentual),
      valorFixo: decimalParaNumero(linha.valorFixo),
      base: linha.base === "recebido" ? "recebido" : "bruto",
      ativa: linha.ativa,
      confirmadaNaFatura: linha.confirmadaNaFatura,
      observacao: linha.observacao,
      atualizadoEm: linha.atualizadoEm.toISOString(),
    };
  }

  async salvarAliquotaEstadual(
    entrada: EntradaAliquotaEstado,
  ): Promise<AliquotaEstado> {
    const dados = {
      nome: entrada.nome,
      aliquotaInterna: entrada.aliquotaInterna,
      ativo: entrada.ativo,
      confirmadoPeloContador: entrada.confirmadoPeloContador,
      observacao: entrada.observacao,
    };

    // A UF e a chave primaria: upsert garante um registro por estado.
    const linha = await prisma.aliquotaEstado.upsert({
      where: { uf: entrada.uf.toUpperCase() },
      create: { uf: entrada.uf.toUpperCase(), ...dados },
      update: dados,
    });

    return {
      uf: linha.uf,
      nome: linha.nome,
      aliquotaInterna: decimalParaNumero(linha.aliquotaInterna),
      ativo: linha.ativo,
      confirmadoPeloContador: linha.confirmadoPeloContador,
      observacao: linha.observacao,
      atualizadoEm: linha.atualizadoEm.toISOString(),
    };
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
      marca: entrada.marca,
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

  // --- Ordens de fabricacao -----------------------------------------------

  async listarOrdens(): Promise<OrdemFabricacao[]> {
    const linhas = await prisma.ordemFabricacao.findMany({
      orderBy: { criadoEm: "desc" },
      /*
       * O PDF fica DE FORA da listagem, de proposito.
       *
       * Sao alguns KB por ordem, e a lista nao mostra nenhum deles -- ela so
       * diz se o documento existe. Trazer os bytes de cem ordens para
       * desenhar cem botoes de download seria carregar megabytes para nada.
       * Quem baixa passa por `buscarOrdemPorId`, que traz um so.
       */
      omit: { documento: true },
    });

    return linhas.map((linha) => mapearOrdem(linha, null));
  }

  async buscarOrdemPorId(id: string): Promise<OrdemFabricacao | null> {
    const linha = await prisma.ordemFabricacao.findUnique({ where: { id } });
    return linha ? mapearOrdem(linha, linha.documento) : null;
  }

  async buscarOrdemPorToken(token: string): Promise<OrdemFabricacao | null> {
    if (!token) return null;
    /*
     * Busca pelo indice unico do token, nao varrendo a tabela.
     *
     * Aqui nao ha comparacao em tempo constante como no repositorio de
     * demonstracao, e nem daria: quem compara e o indice do Postgres. O que
     * protege e o tamanho do segredo -- 256 bits nao se adivinham por
     * tentativa, com ou sem canal lateral de tempo.
     */
    const linha = await prisma.ordemFabricacao.findUnique({ where: { token } });
    return linha ? mapearOrdem(linha, linha.documento) : null;
  }

  async criarOrdem(entrada: EntradaOrdem): Promise<OrdemFabricacao> {
    const doAno = await prisma.ordemFabricacao.findMany({
      where: { numero: { startsWith: `OF-${new Date().getFullYear()}-` } },
      select: { numero: true },
    });

    const linha = await prisma.ordemFabricacao.create({
      data: {
        numero: proximoNumero(
          doAno.map((o) => ({ numero: o.numero }) as OrdemFabricacao),
        ),
        itens: entrada.itens as unknown as Prisma.InputJsonValue,
        dataLancamento: new Date(`${entrada.dataLancamento}T00:00:00Z`),
        observacao: entrada.observacao,
        situacao: "aguardando",
        solicitante: entrada.solicitante as unknown as Prisma.InputJsonValue,
        token: novoToken(),
      },
    });

    return mapearOrdem(linha, null);
  }

  async gravarOrdem(ordem: OrdemFabricacao): Promise<OrdemFabricacao> {
    const documento = ordem.documento
      ? Buffer.from(ordem.documento.base64, "base64")
      : null;

    const linha = await prisma.ordemFabricacao.update({
      where: { id: ordem.id },
      data: {
        situacao: ordem.situacao,
        // `DbNull` grava NULL de verdade na coluna Json; `null` puro seria o
        // valor JSON `null`, que e outra coisa e faria `aprovador` deixar de
        // ser "sem aprovador" para virar "aprovador nulo".
        aprovador: (ordem.aprovador as unknown as Prisma.InputJsonValue) ?? Prisma.DbNull,
        motivoRecusa: ordem.motivoRecusa,
        fechadoEm: ordem.fechadoEm ? new Date(ordem.fechadoEm) : null,
        documento,
        documentoSha: ordem.documento?.sha256 ?? null,
        hashConteudo: ordem.documento?.hashConteudo ?? null,
        documentoEm: ordem.documento ? new Date(ordem.documento.geradoEm) : null,
      },
    });

    return mapearOrdem(linha, documento);
  }
}

/**
 * Linha do banco -> ordem.
 *
 * O PDF entra por fora (`bytes`) porque a listagem o omite: mapear a partir da
 * linha faria a lista devolver `documento: null` como se o arquivo nao
 * existisse, quando ele existe e so nao foi buscado. Dai `temDocumento` vir de
 * `documentoSha`, que a listagem sempre traz.
 */
function mapearOrdem(
  linha: {
    id: string;
    numero: string;
    itens: Prisma.JsonValue;
    dataLancamento: Date;
    observacao: string | null;
    situacao: string;
    token: string;
    solicitante: Prisma.JsonValue;
    aprovador: Prisma.JsonValue | null;
    motivoRecusa: string | null;
    documentoSha: string | null;
    hashConteudo: string | null;
    documentoEm: Date | null;
    criadoEm: Date;
    fechadoEm: Date | null;
  },
  // Prisma devolve `Bytes` como Uint8Array, nao Buffer.
  bytes: Uint8Array | null,
): OrdemFabricacao {
  const situacoes: SituacaoOrdem[] = ["aguardando", "aprovada", "recusada", "cancelada"];

  return {
    id: linha.id,
    numero: linha.numero,
    itens: (linha.itens ?? []) as unknown as ItemOrdem[],
    dataLancamento: linha.dataLancamento.toISOString().slice(0, 10),
    observacao: linha.observacao,
    situacao: situacoes.find((s) => s === linha.situacao) ?? "aguardando",
    solicitante: linha.solicitante as unknown as AssinaturaOrdem,
    aprovador: (linha.aprovador as unknown as AssinaturaOrdem | null) ?? null,
    motivoRecusa: linha.motivoRecusa,
    token: linha.token,
    criadoEm: linha.criadoEm.toISOString(),
    fechadoEm: linha.fechadoEm?.toISOString() ?? null,
    documento: linha.documentoSha
      ? {
          base64: bytes ? Buffer.from(bytes).toString("base64") : "",
          sha256: linha.documentoSha,
          hashConteudo: linha.hashConteudo ?? "",
          geradoEm: (linha.documentoEm ?? linha.criadoEm).toISOString(),
          bytes: bytes?.length ?? 0,
        }
      : null,
  };
}

/** Linha do banco -> despesa. A data volta a ser texto "aaaa-mm-dd". */
function mapearDespesa(linha: {
  id: string;
  influencerId: string | null;
  data: Date;
  categoria: string;
  descricao: string;
  valor: Prisma.Decimal;
  atualizadoEm: Date;
}): DespesaInfluencer {
  return {
    id: linha.id,
    influencerId: linha.influencerId,
    data: linha.data.toISOString().slice(0, 10),
    categoria: CATEGORIAS_DESPESA.find((c) => c === linha.categoria) ?? "outros",
    descricao: linha.descricao,
    valor: decimalParaNumero(linha.valor),
    atualizadoEm: linha.atualizadoEm.toISOString(),
  };
}
