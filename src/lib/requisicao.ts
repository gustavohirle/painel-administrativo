import "server-only";

import { headers } from "next/headers";

export interface OrigemDaRequisicao {
  ip: string | null;
  agente: string | null;
}

/**
 * De onde veio a requisicao, para carimbar uma assinatura.
 *
 * ATENCAO ao que isto E e ao que NAO E. `x-forwarded-for` e um cabecalho, e
 * quem chama a URL escolhe o que mandar nele; so vale alguma coisa quando ha
 * um proxy confiavel na frente reescrevendo o valor. Portanto isto e dado de
 * CIRCUNSTANCIA, do mesmo naipe do horario -- ajuda a reconstituir o que
 * aconteceu, nao prova quem assinou.
 *
 * Esta escrito assim no documento tambem ("Origem", nao "Assinado por"), para
 * ninguem ler o numero como identidade.
 */
export async function origemDaRequisicao(): Promise<OrigemDaRequisicao> {
  const cabecalhos = await headers();

  const encaminhado = cabecalhos.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = encaminhado || cabecalhos.get("x-real-ip") || null;

  return {
    ip: ip && ip.length <= 64 ? ip : null,
    agente: cabecalhos.get("user-agent")?.slice(0, 300) ?? null,
  };
}
