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
 * O arquivo tem ~16 KB; reler e barato perto de servir dado errado.
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
import {
  custosIniciais,
  influencersIniciais,
  novoId,
  type RepositorioCadastros,
} from "@/data/costRepository";

const PASTA = path.join(process.cwd(), ".demo-data");
const ARQUIVO = path.join(PASTA, "cadastros.json");

interface Estado {
  custos: CustoProduto[];
  influencers: Influencer[];
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

function estadoInicial(): Estado {
  return { custos: custosIniciais(), influencers: influencersIniciais() };
}

async function carregar(): Promise<Estado> {
  if (memoriaGlobal.semDisco) {
    memoriaGlobal.estado ??= estadoInicial();
    return memoriaGlobal.estado;
  }

  try {
    const conteudo = await fs.readFile(ARQUIVO, "utf8");
    const lido = JSON.parse(conteudo) as Partial<Estado>;
    return {
      custos: Array.isArray(lido.custos) ? lido.custos : custosIniciais(),
      influencers: Array.isArray(lido.influencers)
        ? lido.influencers
        : influencersIniciais(),
    };
  } catch {
    // Arquivo ainda nao existe (primeiro boot) ou esta corrompido: recomeca do
    // estado inicial e o grava. Nao e erro.
    const inicial = estadoInicial();
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

export class RepositorioDemonstracao implements RepositorioCadastros {
  readonly tipo = "demo" as const;

  async listarCustos(): Promise<CustoProduto[]> {
    const estado = await carregar();
    return estado.custos.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
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

  async listarInfluencers(): Promise<Influencer[]> {
    const estado = await carregar();
    return estado.influencers.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
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
}

/** Descarta o estado gravado e volta aos cadastros iniciais. */
export async function reiniciarDemonstracao(): Promise<void> {
  const inicial = estadoInicial();
  memoriaGlobal.estado = inicial;
  await gravar(inicial);
}
