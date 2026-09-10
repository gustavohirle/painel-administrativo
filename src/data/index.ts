/**
 * Fabrica das fontes de dados. E o unico lugar do projeto que decide entre
 * demonstracao e producao -- nenhuma pagina ou componente faz esse `if`.
 */

import "server-only";

import { fonteDados } from "@/lib/config";
import { FonteDemonstracao } from "@/data/mockSource";
import { FonteNuvemshop } from "@/data/apiSource";
import { RepositorioDemonstracao } from "@/data/demoCostRepository";
import type { FonteDePedidos } from "@/data/source";
import type { RepositorioCadastros } from "@/data/repositorio";

export function obterFonteDePedidos(): FonteDePedidos {
  return fonteDados() === "live" ? new FonteNuvemshop() : new FonteDemonstracao();
}

/**
 * O repositorio Postgres e carregado por import dinamico de proposito.
 *
 * `@prisma/client` so existe depois de `prisma generate`. Em modo
 * demonstracao o projeto tem que subir sem banco nenhum configurado, entao
 * este modulo nunca pode ser avaliado nesse caminho.
 */
export async function obterRepositorioCadastros(): Promise<RepositorioCadastros> {
  if (fonteDados() !== "live") return new RepositorioDemonstracao();

  const { RepositorioPostgres } = await import("@/data/prismaCostRepository");
  return new RepositorioPostgres();
}
