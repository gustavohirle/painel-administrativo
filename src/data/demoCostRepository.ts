/**
 * Repositorio de cadastros para o modo demonstracao.
 *
 * Grava num arquivo JSON local (`.demo-data/cadastros.json`). Motivo: durante
 * a reuniao o dono vai querer cadastrar um custo ou mudar um percentual e ver
 * o painel reagir -- e o valor precisa sobreviver a um F5. Nada de banco,
 * nada de internet.
 *
 * DECISAO: le o arquivo em TODA chamada, sem cache em memoria.
 *
 * A primeira versao guardava o estado num modulo. Nao funcionou: o Next carrega
 * as Server Actions num grafo de modulos separado do que renderiza a pagina,
 * entao cada lado ficava com a sua propria copia. O custo era gravado no disco
 * pela action e a pagina continuava mostrando o estado antigo, para sempre.
 * O arquivo tem poucas centenas de KB; reler e barato perto de servir dado errado.
 *
 * A copia em memoria sobrevive so como plano B para ambiente sem disco de
 * escrita (deploy read-only): a demonstracao continua de pe, sem persistir
 * entre reinicios.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

import type {
  CustoProduto,
  EntradaCustoProduto,
  EntradaInfluencer,
  Influencer,
} from "@/types/dominio";
import type { ConfiguracaoFiscal, EntradaImposto, Imposto } from "@/types/fiscal";
import type {
  ContagemEstoque,
  EntradaContagemEstoque,
  EntradaProduto,
  Produto,
} from "@/types/produto";
import type { Usuario } from "@/types/usuario";
import { novoId, type RepositorioCadastros } from "@/data/repositorio";
import {
  configuracaoFiscalInicial,
  contagensIniciais,
  custosIniciais,
  impostosIniciais,
  influencersIniciais,
  produtosIniciais,
  usuariosIniciais,
} from "@/data/seeds";

const PASTA = path.join(process.cwd(), ".demo-data");
const ARQUIVO = path.join(PASTA, "cadastros.json");

interface Estado {
  custos: CustoProduto[];
  influencers: Influencer[];
  impostos: Imposto[];
  configuracaoFiscal: ConfiguracaoFiscal;
  produtos: Produto[];
  contagens: ContagemEstoque[];
  usuarios: Usuario[];
}

/**
 * Plano B compartilhado entre grafos de modulo.
 *
 * Mora no `globalThis` justamente porque uma variavel de modulo nao e unica --
 * foi essa suposicao que causou o bug descrito no topo do arquivo.
 */
const global = globalThis as unknown as {
  __demoCadastros?: { estado: Estado | null; semDisco: boolean };
};

global.__demoCadastros ??= { estado: null, semDisco: false };
const memoriaGlobal = global.__demoCadastros;

async function estadoInicial(): Promise<Estado> {
  const impostos = impostosIniciais();
  // Ordem importa: o produto herda os impostos do REGIME do seu influencer,
  // entao os influencers precisam existir antes dos produtos.
  const influencers = influencersIniciais();
  const produtos = produtosIniciais(impostos, influencers);

  return {
    custos: custosIniciais(),
    influencers,
    impostos,
    configuracaoFiscal: configuracaoFiscalInicial(),
    produtos,
    contagens: contagensIniciais(produtos),
    usuarios: await usuariosIniciais(),
  };
}

/**
 * Preenche o que faltar no arquivo lido.
 *
 * Um `.demo-data` gravado por uma versao anterior nao tem as chaves novas.
 * Sem este merge, atualizar o projeto derrubaria a tela com "cannot read
 * property of undefined" em vez de simplesmente semear o que falta.
 */
async function completar(lido: Partial<Estado>): Promise<Estado> {
  const inicial = await estadoInicial();

  const impostos = Array.isArray(lido.impostos) ? lido.impostos : inicial.impostos;
  const influencers =
    Array.isArray(lido.influencers) && lido.influencers.length > 0
      ? lido.influencers
      : inicial.influencers;
  const produtos = Array.isArray(lido.produtos)
    ? lido.produtos
    : produtosIniciais(impostos, influencers);

  return {
    custos: Array.isArray(lido.custos) ? lido.custos : inicial.custos,
    influencers,
    impostos,
    configuracaoFiscal: lido.configuracaoFiscal ?? inicial.configuracaoFiscal,
    produtos,
    contagens: Array.isArray(lido.contagens)
      ? lido.contagens
      : contagensIniciais(produtos),
    usuarios:
      Array.isArray(lido.usuarios) && lido.usuarios.length > 0
        ? lido.usuarios
        : inicial.usuarios,
  };
}

async function carregar(): Promise<Estado> {
  if (memoriaGlobal.semDisco) {
    memoriaGlobal.estado ??= await estadoInicial();
    return memoriaGlobal.estado;
  }

  try {
    const conteudo = await fs.readFile(ARQUIVO, "utf8");
    return await completar(JSON.parse(conteudo) as Partial<Estado>);
  } catch {
    // Arquivo ainda nao existe (primeiro boot) ou esta corrompido: recomeca do
    // estado inicial e o grava. Nao e erro.
    const inicial = await estadoInicial();
    await gravar(inicial);
    return inicial;
  }
}

async function gravar(estado: Estado): Promise<void> {
  try {
    await fs.mkdir(PASTA, { recursive: true });
    await fs.writeFile(ARQUIVO, JSON.stringify(estado, null, 2), "utf8");
  } catch {
    // Sem disco de escrita: segue em memoria. A tela nao pode quebrar por isso.
    memoriaGlobal.semDisco = true;
    memoriaGlobal.estado = estado;
  }
}

const porNome = (a: { nome: string }, b: { nome: string }) =>
  a.nome.localeCompare(b.nome, "pt-BR");

export class RepositorioDemonstracao implements RepositorioCadastros {
  readonly tipo = "demo" as const;

  // --- Custo de fabricacao ------------------------------------------------

  async listarCustos(): Promise<CustoProduto[]> {
    return (await carregar()).custos.sort(porNome);
  }

  async salvarCusto(
    entrada: EntradaCustoProduto,
    id?: string,
  ): Promise<CustoProduto> {
    const estado = await carregar();

    // Sem id explicito, procura ficha existente para o mesmo produto/variante:
    // cadastrar o mesmo item duas vezes dobraria o CMV silenciosamente.
    const indice = id
      ? estado.custos.findIndex((c) => c.id === id)
      : estado.custos.findIndex(
          (c) =>
            c.produtoId === entrada.produtoId && c.varianteId === entrada.varianteId,
        );

    const ficha: CustoProduto = {
      ...entrada,
      id: indice >= 0 ? estado.custos[indice]!.id : (id ?? novoId("custo")),
      atualizadoEm: new Date().toISOString(),
    };

    if (indice >= 0) estado.custos[indice] = ficha;
    else estado.custos.push(ficha);

    await gravar(estado);
    return ficha;
  }

  async removerCusto(id: string): Promise<void> {
    const estado = await carregar();
    estado.custos = estado.custos.filter((c) => c.id !== id);
    await gravar(estado);
  }

  // --- Comissoes ----------------------------------------------------------

  async listarInfluencers(): Promise<Influencer[]> {
    return (await carregar()).influencers.sort(porNome);
  }

  async salvarInfluencer(
    entrada: EntradaInfluencer,
    id?: string,
  ): Promise<Influencer> {
    const estado = await carregar();
    const indice = id ? estado.influencers.findIndex((i) => i.id === id) : -1;

    const registro: Influencer = {
      ...entrada,
      id: indice >= 0 ? estado.influencers[indice]!.id : (id ?? novoId("influencer")),
      atualizadoEm: new Date().toISOString(),
    };

    if (indice >= 0) estado.influencers[indice] = registro;
    else estado.influencers.push(registro);

    await gravar(estado);
    return registro;
  }

  async removerInfluencer(id: string): Promise<void> {
    const estado = await carregar();
    estado.influencers = estado.influencers.filter((i) => i.id !== id);
    await gravar(estado);
  }

  // --- Impostos -----------------------------------------------------------

  async listarImpostos(): Promise<Imposto[]> {
    return (await carregar()).impostos.sort(porNome);
  }

  async salvarImposto(entrada: EntradaImposto, id?: string): Promise<Imposto> {
    const estado = await carregar();
    const indice = id ? estado.impostos.findIndex((i) => i.id === id) : -1;

    const registro: Imposto = {
      ...entrada,
      id: indice >= 0 ? estado.impostos[indice]!.id : (id ?? novoId("imposto")),
      atualizadoEm: new Date().toISOString(),
    };

    if (indice >= 0) estado.impostos[indice] = registro;
    else estado.impostos.push(registro);

    await gravar(estado);
    return registro;
  }

  async removerImposto(id: string): Promise<void> {
    const estado = await carregar();
    estado.impostos = estado.impostos.filter((i) => i.id !== id);
    // Tira a referencia dos produtos tambem: id orfao em `impostosIds` viraria
    // um vinculo invisivel que ninguem consegue desmarcar pela tela.
    estado.produtos = estado.produtos.map((p) => ({
      ...p,
      impostosIds: p.impostosIds.filter((i) => i !== id),
    }));
    await gravar(estado);
  }

  async obterConfiguracaoFiscal(): Promise<ConfiguracaoFiscal> {
    return (await carregar()).configuracaoFiscal;
  }

  async salvarConfiguracaoFiscal(
    config: Omit<ConfiguracaoFiscal, "atualizadoEm">,
  ): Promise<ConfiguracaoFiscal> {
    const estado = await carregar();
    estado.configuracaoFiscal = { ...config, atualizadoEm: new Date().toISOString() };
    await gravar(estado);
    return estado.configuracaoFiscal;
  }

  // --- Produtos e kits ----------------------------------------------------

  async listarProdutos(): Promise<Produto[]> {
    return (await carregar()).produtos.sort(porNome);
  }

  async salvarProduto(entrada: EntradaProduto, id?: string): Promise<Produto> {
    const estado = await carregar();

    const indice = id
      ? estado.produtos.findIndex((p) => p.id === id)
      : estado.produtos.findIndex((p) => p.chave === entrada.chave);

    const registro: Produto = {
      ...entrada,
      id: indice >= 0 ? estado.produtos[indice]!.id : (id ?? novoId("produto")),
      atualizadoEm: new Date().toISOString(),
    };

    if (indice >= 0) estado.produtos[indice] = registro;
    else estado.produtos.push(registro);

    await gravar(estado);
    return registro;
  }

  async removerProduto(id: string): Promise<void> {
    const estado = await carregar();
    estado.produtos = estado.produtos.filter((p) => p.id !== id);
    await gravar(estado);
  }

  // --- Estoque ------------------------------------------------------------

  async listarContagens(): Promise<ContagemEstoque[]> {
    const estado = await carregar();
    // Mais recente primeiro: o historico de contagens le de cima para baixo.
    return estado.contagens.sort((a, b) =>
      b.dataContagem.localeCompare(a.dataContagem),
    );
  }

  async salvarContagem(entrada: EntradaContagemEstoque): Promise<ContagemEstoque> {
    const estado = await carregar();

    // Contagem e historico: cada registro fica. O saldo usa sempre a mais
    // recente de cada item, entao recontar nao sobrescreve o passado.
    const registro: ContagemEstoque = {
      ...entrada,
      id: novoId("contagem"),
      registradoEm: new Date().toISOString(),
    };

    estado.contagens.push(registro);
    await gravar(estado);
    return registro;
  }

  async removerContagem(id: string): Promise<void> {
    const estado = await carregar();
    estado.contagens = estado.contagens.filter((c) => c.id !== id);
    await gravar(estado);
  }

  // --- Usuarios -----------------------------------------------------------

  async listarUsuarios(): Promise<Usuario[]> {
    return (await carregar()).usuarios.sort(porNome);
  }

  async buscarUsuarioPorId(id: string): Promise<Usuario | null> {
    return (await carregar()).usuarios.find((u) => u.id === id) ?? null;
  }

  async buscarUsuarioPorLogin(usuario: string): Promise<Usuario | null> {
    const alvo = usuario.trim().toLowerCase();
    return (await carregar()).usuarios.find((u) => u.usuario === alvo) ?? null;
  }

  async salvarUsuario(usuario: Usuario): Promise<Usuario> {
    const estado = await carregar();
    const indice = estado.usuarios.findIndex((u) => u.id === usuario.id);

    if (indice >= 0) estado.usuarios[indice] = usuario;
    else estado.usuarios.push(usuario);

    await gravar(estado);
    return usuario;
  }

  async removerUsuario(id: string): Promise<void> {
    const estado = await carregar();
    estado.usuarios = estado.usuarios.filter((u) => u.id !== id);
    await gravar(estado);
  }
}

/** Descarta o estado gravado e volta aos cadastros iniciais. */
export async function reiniciarDemonstracao(): Promise<void> {
  const inicial = await estadoInicial();
  memoriaGlobal.estado = inicial;
  await gravar(inicial);
}
