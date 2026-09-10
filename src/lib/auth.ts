/**
 * Senha e sessao.
 *
 * Sem dependencia nova: `node:crypto` ja tem scrypt e HMAC. Nao ha motivo para
 * trazer bcrypt ou uma biblioteca de JWT para o que sao trinta linhas.
 *
 * Duas coisas que NAO podem ser relaxadas aqui:
 *
 * 1. Senha nunca e guardada em texto. scrypt com sal por usuario, e a
 *    comparacao usa `timingSafeEqual` -- comparar hash com `===` vaza, pelo
 *    tempo de resposta, quantos bytes iniciais estavam certos.
 * 2. O cookie de sessao e ASSINADO. Sem assinatura, qualquer pessoa editaria
 *    o proprio cookie trocando o perfil para "dono" e veria o financeiro.
 */

import {
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

import type { PerfilUsuario } from "@/types/usuario";

const scrypt = promisify(scryptCallback) as (
  senha: string,
  sal: string,
  tamanho: number,
) => Promise<Buffer>;

const TAMANHO_HASH = 64;

// ---------------------------------------------------------------------------
// Senha
// ---------------------------------------------------------------------------

export interface SenhaGuardada {
  senhaHash: string;
  senhaSal: string;
}

export async function criarHashSenha(senha: string): Promise<SenhaGuardada> {
  const senhaSal = randomBytes(16).toString("hex");
  const derivado = await scrypt(senha, senhaSal, TAMANHO_HASH);
  return { senhaHash: derivado.toString("hex"), senhaSal };
}

/** Formato exato do hash gravado: hexadecimal, com o tamanho do scrypt. */
const HASH_VALIDO = new RegExp(`^[0-9a-f]{${TAMANHO_HASH * 2}}$`, "i");

/** Comparacao em tempo constante. Devolve `false` para qualquer entrada torta. */
export async function verificarSenha(
  senha: string,
  guardada: SenhaGuardada,
): Promise<boolean> {
  if (!senha || !guardada.senhaHash || !guardada.senhaSal) return false;

  // O formato do hash e conferido ANTES de comparar, e isso nao e paranoia:
  // `Buffer.from("qualquer-coisa", "hex")` devolve um buffer VAZIO em vez de
  // falhar, e `timingSafeEqual` de dois buffers vazios devolve TRUE. Sem esta
  // guarda, um registro de senha corrompido aceitaria qualquer senha.
  if (!HASH_VALIDO.test(guardada.senhaHash)) return false;

  try {
    const esperado = Buffer.from(guardada.senhaHash, "hex");
    if (esperado.length !== TAMANHO_HASH) return false;

    const obtido = await scrypt(senha, guardada.senhaSal, TAMANHO_HASH);
    if (esperado.length !== obtido.length) return false;
    return timingSafeEqual(esperado, obtido);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Sessao
// ---------------------------------------------------------------------------

export const NOME_COOKIE_SESSAO = "painel_sessao";

/** Duracao da sessao. Uma jornada de trabalho, sem obrigar login no meio. */
export const DURACAO_SESSAO_SEGUNDOS = 60 * 60 * 12;

/**
 * Segredo de assinatura.
 *
 * Em producao vem do ambiente. Sem ele, o modo demonstracao usa um segredo
 * fixo -- aceitavel porque nao ha nada real por tras, e um `.env` a mais seria
 * mais um passo entre clonar o projeto e ver a tela funcionando.
 */
function segredo(): string {
  return (
    process.env.SESSAO_SECRET ??
    "segredo-de-demonstracao-nao-usar-em-producao-troque-no-env"
  );
}

export interface Sessao {
  usuarioId: string;
  perfil: PerfilUsuario;
  /** Epoch em segundos. */
  expiraEm: number;
}

function base64url(dado: Buffer | string): string {
  return Buffer.from(dado)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function assinar(corpo: string): string {
  return base64url(createHmac("sha256", segredo()).update(corpo).digest());
}

export function criarTokenSessao(
  usuarioId: string,
  perfil: PerfilUsuario,
  agora = Date.now(),
): string {
  const sessao: Sessao = {
    usuarioId,
    perfil,
    expiraEm: Math.floor(agora / 1000) + DURACAO_SESSAO_SEGUNDOS,
  };
  const corpo = base64url(JSON.stringify(sessao));
  return `${corpo}.${assinar(corpo)}`;
}

/**
 * Le e valida o token. Devolve `null` para assinatura invalida, formato
 * estranho ou sessao vencida -- quem chama so precisa saber se ha alguem
 * autenticado, nao o motivo da recusa.
 */
export function lerTokenSessao(
  token: string | undefined | null,
  agora = Date.now(),
): Sessao | null {
  if (!token) return null;

  const [corpo, assinatura] = token.split(".");
  if (!corpo || !assinatura) return null;

  const esperada = assinar(corpo);
  const a = Buffer.from(assinatura);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const sessao = JSON.parse(
      Buffer.from(corpo.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(),
    ) as Sessao;

    if (typeof sessao.usuarioId !== "string") return null;
    if (sessao.perfil !== "dono" && sessao.perfil !== "estoque") return null;
    if (typeof sessao.expiraEm !== "number") return null;
    if (sessao.expiraEm * 1000 <= agora) return null;

    return sessao;
  } catch {
    return null;
  }
}
