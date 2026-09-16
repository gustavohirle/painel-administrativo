import "server-only";

import { cookies } from "next/headers";

import { COOKIE_MES, escolherMes } from "@/lib/mesDaTela";

/** O mes que a pagina mostra: URL, depois o escolhido no seletor, depois o mais recente. */
export async function mesDaTela(meses: string[], doEndereco: string | undefined): Promise<string> {
  const jar = await cookies();
  return escolherMes(meses, doEndereco, jar.get(COOKIE_MES)?.value);
}
