/**
 * Regera o PDF de ordens concluidas cujo conteudo deixou de bater com o hash.
 *
 * Documento assinado NAO deve mudar -- essa e a regra da secao 5.15. Este
 * script existe para o unico caso em que ela cede: a base de demonstracao,
 * quando o texto dos produtos e corrigido. Um PDF que discorda da tela e pior
 * do que um documento regerado, e ali nao ha nada real sendo provado.
 *
 * Com `--forcar`, regera mesmo quando o hash bate: serve quando o que mudou
 * foram os ROTULOS do documento ("Data de lancamento", "Pagina 1 de 1"), que
 * nao entram no hash do conteudo -- ele cobre os dados, nao a diagramacao.
 *
 * Nao use isto em dados reais.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

import { gerarDocumento, hashDoConteudo } from "@/lib/ordens";
import type { OrdemFabricacao } from "@/types/ordemFabricacao";

const ARQUIVO = path.join(process.cwd(), ".demo-data", "cadastros.json");

async function principal() {
  const estado = JSON.parse(await fs.readFile(ARQUIVO, "utf8")) as {
    ordens?: OrdemFabricacao[];
  };

  let regeradas = 0;

  for (const ordem of estado.ordens ?? []) {
    if (ordem.situacao !== "concluida" || !ordem.documento) continue;
      const forcar = process.argv.includes("--forcar");
    if (!forcar && ordem.documento.hashConteudo === hashDoConteudo(ordem)) continue;

    ordem.documento = gerarDocumento(ordem, {
      demonstracao: true,
      geradoEm: new Date(ordem.fechadoEm ?? ordem.criadoEm),
    });
    regeradas += 1;
    console.log(`${ordem.numero}: PDF regerado (${ordem.documento.bytes} bytes)`);
  }

  if (regeradas > 0) await fs.writeFile(ARQUIVO, JSON.stringify(estado), "utf8");
  console.log(`${regeradas} documento(s) regerado(s)`);
}

void principal();
