/**
 * Onde ficam os tokens dos marketplaces, que GIRAM.
 *
 * Por que existe: nos tres canais o token de acesso dura horas e o de
 * renovacao e trocado a cada uso. Isso quer dizer que a credencial que vale
 * agora nao e a que alguem colou no `.env.live` uma vez -- e a que a ultima
 * renovacao devolveu. Um arquivo de ambiente nao serve para isso: ele e lido
 * na subida e ninguem o reescreve.
 *
 * E nao e so teimosia de arquitetura. Em producao o servico roda com
 * `ProtectSystem=strict` e `.live-data` e o UNICO caminho gravavel (secao 14),
 * entao tentar gravar o token ao lado do `.env.live` falharia -- o que, de
 * novo, e melhor que conseguir.
 *
 * O mesmo problema ja estava anotado para o Bling (secao 9): "refresh de 30
 * dias que gira a cada uso -- ou seja, o token precisa de lugar gravavel, nao
 * do .env".
 *
 * O `.env.live` continua valendo para o PRIMEIRO token de cada conta, e para
 * destravar uma conta cujo token guardado venceu: `tokenDaConta` prefere o
 * gravado e cai no do ambiente quando nao ha nenhum.
 *
 * ATENCAO: este arquivo guarda credencial de verdade. Ele nasce em modo 600 e
 * `.live-data/` esta no `.gitignore`, como o cache de pedidos.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

import { chaveDaConta, type CanalMarketplace, type ContaDeCanal } from "@/types/canais";

const VERSAO = 1;

/** Modo 600: dono le e escreve, mais ninguem. */
const SO_O_DONO = 0o600;

export interface TokenDaConta {
  /** Token de acesso do momento. */
  token: string;
  /** Token de renovacao. Nos tres canais ele e TROCADO a cada uso. */
  refresh: string | null;
  /** Quando o token de acesso expira (ISO). `null` se o canal nao informa. */
  expiraEm: string | null;
  /** Quando esta entrada foi gravada (ISO). */
  atualizadoEm: string;
}

interface ArquivoDeTokens {
  versao: number;
  /** Chave: `canal:lojaId` (ver `chaveDaConta`). */
  contas: Record<string, TokenDaConta>;
}

const pasta = () =>
  process.env.NUVEMSHOP_CACHE_DIR || path.join(process.cwd(), ".live-data");

const arquivo = () => path.join(pasta(), "tokens-canais.json");

const vazio = (): ArquivoDeTokens => ({ versao: VERSAO, contas: {} });

async function ler(): Promise<ArquivoDeTokens> {
  try {
    const lido = JSON.parse(await fs.readFile(arquivo(), "utf8")) as ArquivoDeTokens;
    // Formato de outra versao: recomeca. Autorizar de novo e mais seguro que
    // adivinhar o que uma versao antiga queria dizer.
    if (lido.versao !== VERSAO || typeof lido.contas !== "object" || lido.contas === null) {
      return vazio();
    }
    return lido;
  } catch {
    return vazio();
  }
}

/**
 * O token que vale agora para uma conta.
 *
 * Prefere o GRAVADO, e cai no do `.env.live` quando nao ha nenhum -- que e o
 * caso da primeira autorizacao. Trocar a ordem faria o token do ambiente,
 * congelado na subida, sobrescrever o que a ultima renovacao devolveu.
 */
export async function tokenDaConta(conta: ContaDeCanal): Promise<TokenDaConta | null> {
  const guardado = (await ler()).contas[chaveDaConta(conta.canal, conta.lojaId)];
  if (guardado) return guardado;

  if (!conta.tokenInicial) return null;
  return {
    token: conta.tokenInicial,
    refresh: conta.refreshInicial,
    expiraEm: null,
    atualizadoEm: new Date().toISOString(),
  };
}

/**
 * Grava o token de uma conta, preservando o das outras.
 *
 * Le e reescreve o arquivo inteiro a cada chamada, de proposito: sao poucas
 * contas e o arquivo tem alguns KB. Guardar uma copia em memoria economizaria
 * nada e traria o problema da armadilha 2 -- o Next carrega os modulos em mais
 * de um grafo, e cada um ficaria com a sua versao do token.
 */
export async function gravarToken(
  canal: CanalMarketplace,
  lojaId: string,
  novo: Omit<TokenDaConta, "atualizadoEm">,
): Promise<void> {
  const atual = await ler();
  atual.contas[chaveDaConta(canal, lojaId)] = {
    ...novo,
    atualizadoEm: new Date().toISOString(),
  };

  await fs.mkdir(pasta(), { recursive: true });
  // Grava ao lado e renomeia, como o cache: quem le no meio da gravacao nunca
  // ve meio arquivo. O modo vai no `open` para o arquivo nunca existir, nem
  // por um instante, legivel por outro usuario.
  const temporario = `${arquivo()}.${process.pid}.tmp`;
  await fs.writeFile(temporario, JSON.stringify(atual, null, 2), {
    encoding: "utf8",
    mode: SO_O_DONO,
  });
  await fs.rename(temporario, arquivo());
  await fs.chmod(arquivo(), SO_O_DONO);
}

/** Esquece o token de uma conta. Para quando a autorizacao e revogada. */
export async function esquecerToken(canal: CanalMarketplace, lojaId: string): Promise<void> {
  const atual = await ler();
  delete atual.contas[chaveDaConta(canal, lojaId)];
  await fs.mkdir(pasta(), { recursive: true });
  await fs.writeFile(arquivo(), JSON.stringify(atual, null, 2), {
    encoding: "utf8",
    mode: SO_O_DONO,
  });
}

/**
 * Quais contas ja tem token guardado. Para a tela de conferencia dizer o que
 * falta autorizar, sem mostrar credencial nenhuma.
 */
export async function contasComToken(): Promise<string[]> {
  return Object.keys((await ler()).contas);
}
