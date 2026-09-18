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
  DespesaInfluencer,
  EntradaCustoProduto,
  EntradaDespesaInfluencer,
  EntradaInfluencer,
  Influencer,
} from "@/types/dominio";
import type {
  AliquotaEstado,
  EntradaAliquotaEstado,
  EntradaImposto,
  Imposto,
} from "@/types/fiscal";
import type {
  EntradaOrdem,
  OrdemFabricacao,
} from "@/types/ordemFabricacao";
import type {
  EntradaTaxaPlataforma,
  TaxaPlataforma,
} from "@/types/plataforma";
import type {
  ContagemEstoque,
  EntradaContagemEstoque,
  EntradaProduto,
  Produto,
} from "@/types/produto";
import type { EntradaFechamentoMes, FechamentoMes } from "@/types/fechamento";
import type { Usuario } from "@/types/usuario";
import { novoId, type RepositorioCadastros } from "@/data/repositorio";
import { proximoNumero } from "@/lib/ordens";
import {
  aliquotasEstaduaisIniciais,
  despesasInfluencerIniciais,
  ordensIniciais,
  taxasPlataformaIniciais,
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
  despesasInfluencer: DespesaInfluencer[];
  impostos: Imposto[];
  aliquotasEstaduais: AliquotaEstado[];
  taxasPlataforma: TaxaPlataforma[];
  produtos: Produto[];
  contagens: ContagemEstoque[];
  ordens: OrdemFabricacao[];
  usuarios: Usuario[];
  fechamentos: FechamentoMes[];
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
    aliquotasEstaduais: aliquotasEstaduaisIniciais(),
    taxasPlataforma: taxasPlataformaIniciais(),
    produtos,
    contagens: contagensIniciais(produtos),
    ordens: ordensIniciais(produtos),
    despesasInfluencer: despesasInfluencerIniciais(),
    usuarios: await usuariosIniciais(),
    fechamentos: [],
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
  /*
   * O estado inicial so e montado se alguma chave FALTAR -- e no maximo uma
   * vez por leitura.
   *
   * A versao anterior o montava sempre, antes de olhar o arquivo. Como esta
   * funcao roda em TODA leitura (ver o topo do arquivo), cada chamada ao
   * repositorio recalculava contagens de estoque sobre 45 mil pedidos e o
   * scrypt das senhas: ~52 ms por chamada, e uma pagina faz umas nove. Eram
   * ~225 ms de espera em cada troca de aba para produzir um objeto que era
   * jogado fora, porque o arquivo ja tinha todas as chaves.
   */
  let inicialPendente: Promise<Estado> | null = null;
  const inicial = () => (inicialPendente ??= estadoInicial());

  const temLista = <T,>(valor: T[] | undefined): valor is T[] => Array.isArray(valor);
  const temItens = <T,>(valor: T[] | undefined): valor is T[] =>
    Array.isArray(valor) && valor.length > 0;

  const impostos = temLista(lido.impostos) ? lido.impostos : (await inicial()).impostos;
  const influencers = temItens(lido.influencers)
    ? lido.influencers
    : (await inicial()).influencers;
  const produtos = temLista(lido.produtos)
    ? lido.produtos
    : produtosIniciais(impostos, influencers);

  return {
    custos: temLista(lido.custos) ? lido.custos : (await inicial()).custos,
    influencers,
    impostos,
    aliquotasEstaduais: temItens(lido.aliquotasEstaduais)
      ? lido.aliquotasEstaduais
      : (await inicial()).aliquotasEstaduais,
    taxasPlataforma: temItens(lido.taxasPlataforma)
      ? lido.taxasPlataforma
      : (await inicial()).taxasPlataforma,
    produtos,
    contagens: temLista(lido.contagens) ? lido.contagens : contagensIniciais(produtos),
    // Sem `length > 0` aqui: uma base em que todas as ordens foram apagadas
    // de proposito nao pode ressuscita-las a cada leitura.
    ordens: temLista(lido.ordens) ? lido.ordens : (await inicial()).ordens,
    despesasInfluencer: temLista(lido.despesasInfluencer)
      ? lido.despesasInfluencer
      : (await inicial()).despesasInfluencer,
    usuarios: temItens(lido.usuarios) ? lido.usuarios : (await inicial()).usuarios,
    // Nasce vazio: o fechamento e sempre digitado.
    fechamentos: temLista(lido.fechamentos) ? lido.fechamentos : [],
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
    // As despesas vao junto: sem o influencer elas nao aparecem em tela
    // nenhuma, e continuariam descontando do lucro sem ninguem ver de onde.
    estado.despesasInfluencer = (estado.despesasInfluencer ?? []).filter(
      (d) => d.influencerId !== id,
    );
    await gravar(estado);
  }

  // --- Despesas de influencer ---------------------------------------------

  async listarDespesasInfluencer(): Promise<DespesaInfluencer[]> {
    const estado = await carregar();
    // Mais recente primeiro; no mesmo dia, a ultima alterada em cima.
    return [...(estado.despesasInfluencer ?? [])].sort(
      (a, b) => b.data.localeCompare(a.data) || b.atualizadoEm.localeCompare(a.atualizadoEm),
    );
  }

  async salvarDespesaInfluencer(
    entrada: EntradaDespesaInfluencer,
    id?: string,
  ): Promise<DespesaInfluencer> {
    const estado = await carregar();
    estado.despesasInfluencer ??= [];

    const indice = id ? estado.despesasInfluencer.findIndex((d) => d.id === id) : -1;
    if (id && indice < 0) throw new Error("Despesa não encontrada.");

    const registro: DespesaInfluencer = {
      ...entrada,
      id: indice >= 0 ? estado.despesasInfluencer[indice]!.id : novoId("despesa"),
      atualizadoEm: new Date().toISOString(),
    };

    if (indice >= 0) estado.despesasInfluencer[indice] = registro;
    else estado.despesasInfluencer.push(registro);

    await gravar(estado);
    return registro;
  }

  async removerDespesaInfluencer(id: string): Promise<void> {
    const estado = await carregar();
    estado.despesasInfluencer = (estado.despesasInfluencer ?? []).filter((d) => d.id !== id);
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

  // --- Fechamento do mes -------------------------------------------------

  async listarFechamentos(): Promise<FechamentoMes[]> {
    const estado = await carregar();
    return [...estado.fechamentos].sort((a, b) => a.mes.localeCompare(b.mes));
  }

  async salvarFechamento(entrada: EntradaFechamentoMes): Promise<FechamentoMes> {
    const estado = await carregar();
    const registro: FechamentoMes = { ...entrada, atualizadoEm: new Date().toISOString() };
    const indice = estado.fechamentos.findIndex((f) => f.mes === entrada.mes);
    if (indice >= 0) estado.fechamentos[indice] = registro;
    else estado.fechamentos.push(registro);
    await gravar(estado);
    return registro;
  }

  // --- DIFAL --------------------------------------------------------------

  async listarAliquotasEstaduais(): Promise<AliquotaEstado[]> {
    const estado = await carregar();
    return estado.aliquotasEstaduais.sort((a, b) => a.uf.localeCompare(b.uf));
  }

  async salvarAliquotaEstadual(
    entrada: EntradaAliquotaEstado,
  ): Promise<AliquotaEstado> {
    const estado = await carregar();
    const uf = entrada.uf.toUpperCase();
    const indice = estado.aliquotasEstaduais.findIndex((a) => a.uf === uf);

    const registro: AliquotaEstado = {
      ...entrada,
      uf,
      atualizadoEm: new Date().toISOString(),
    };

    if (indice >= 0) estado.aliquotasEstaduais[indice] = registro;
    else estado.aliquotasEstaduais.push(registro);

    await gravar(estado);
    return registro;
  }

  // --- Taxas de plataforma ------------------------------------------------

  async listarTaxasPlataforma(): Promise<TaxaPlataforma[]> {
    const estado = await carregar();
    /*
     * Base antiga nao tem o campo: um `.demo-data` gravado antes desta versao
     * traria `undefined` e a tela quebraria no `.map`. Semeia sob demanda.
     */
    if (!estado.taxasPlataforma?.length) {
      estado.taxasPlataforma = taxasPlataformaIniciais();
      await gravar(estado);
    }
    return estado.taxasPlataforma;
  }

  async salvarTaxaPlataforma(
    entrada: EntradaTaxaPlataforma,
  ): Promise<TaxaPlataforma> {
    const estado = await carregar();
    const lista = estado.taxasPlataforma ?? taxasPlataformaIniciais();
    const indice = lista.findIndex((t) => t.metodo === entrada.metodo);

    const registro: TaxaPlataforma = {
      ...entrada,
      atualizadoEm: new Date().toISOString(),
    };

    if (indice >= 0) lista[indice] = registro;
    else lista.push(registro);

    estado.taxasPlataforma = lista;
    await gravar(estado);
    return registro;
  }

  // --- Produtos e kits ----------------------------------------------------

  async listarProdutos(): Promise<Produto[]> {
    // Cadastro gravado antes de o produto guardar a loja vem sem o campo.
    return (await carregar()).produtos
      .map((p) => ({ ...p, marca: p.marca ?? null }))
      .sort(porNome);
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

  // --- Ordens de fabricacao -----------------------------------------------

  async listarOrdens(): Promise<OrdemFabricacao[]> {
    const estado = await carregar();
    // Base gravada antes desta versao nao tem o campo. Mesma protecao das
    // taxas de plataforma -- so que aqui nao ha o que semear: comeca vazia.
    const ordens = estado.ordens ?? [];
    // Mais recente primeiro: a lista se le de cima para baixo.
    return [...ordens].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  }

  async buscarOrdemPorId(id: string): Promise<OrdemFabricacao | null> {
    const estado = await carregar();
    return (estado.ordens ?? []).find((o) => o.id === id) ?? null;
  }

  async criarOrdem(entrada: EntradaOrdem): Promise<OrdemFabricacao> {
    const estado = await carregar();
    estado.ordens ??= [];

    const registro: OrdemFabricacao = {
      id: novoId("ordem"),
      numero: proximoNumero(estado.ordens),
      itens: entrada.itens,
      dataLancamento: entrada.dataLancamento,
      observacao: entrada.observacao,
      situacao: "andamento",
      etapaAtual: "conferencia",
      /*
       * A abertura ja nasce como o PRIMEIRO PASSO, assinado.
       *
       * Nao existe ordem sem a assinatura de quem pediu: e ela que transforma
       * "preciso de 500 unidades" em um documento.
       */
      passos: [
        {
          etapa: "abertura",
          usuarioId: entrada.abertaPor,
          assinatura: entrada.assinatura,
          observacao: null,
        },
      ],
      abertaPor: entrada.abertaPor,
      motivoCancelamento: null,
      criadoEm: new Date().toISOString(),
      fechadoEm: null,
      documento: null,
    };

    estado.ordens.push(registro);
    await gravar(estado);
    return registro;
  }

  async removerOrdem(id: string): Promise<void> {
    const estado = await carregar();
    estado.ordens = (estado.ordens ?? []).filter((o) => o.id !== id);
    await gravar(estado);
  }

  async gravarOrdem(ordem: OrdemFabricacao): Promise<OrdemFabricacao> {
    const estado = await carregar();
    estado.ordens ??= [];

    const indice = estado.ordens.findIndex((o) => o.id === ordem.id);
    if (indice < 0) throw new Error("Ordem nao encontrada.");

    estado.ordens[indice] = ordem;
    await gravar(estado);
    return ordem;
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
