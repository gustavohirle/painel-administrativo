/**
 * Sobe para o servidor o que ja esta no GitHub.
 *
 *   npm run deploy            # traz, compila e reinicia la
 *   npm run deploy -- --banco # idem, e ajusta o banco ao schema novo
 *   npm run deploy -- --voltar # volta o servidor para o build anterior
 *
 * O trabalho todo acontece no servidor (`/opt/painel/atualizar.sh`); aqui so
 * abrimos o SSH e repassamos a saida. O commit precisa estar no GitHub: o
 * servidor puxa de `origin/main`, nao deste computador.
 *
 * Endereco e chave ficam em `.env.servidor`, que NAO vai para o git -- o
 * repositorio e publico. Modelo em `.env.servidor.example`.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ARQUIVO = join(process.cwd(), ".env.servidor");

if (!existsSync(ARQUIVO)) {
  console.error(
    `Falta o arquivo .env.servidor com o endereco do servidor.\n` +
      `Copie o modelo e preencha:\n\n  cp .env.servidor.example .env.servidor\n`,
  );
  process.exit(1);
}

const config = Object.fromEntries(
  readFileSync(ARQUIVO, "utf8")
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter((linha) => linha && !linha.startsWith("#"))
    .map((linha) => {
      const igual = linha.indexOf("=");
      return [linha.slice(0, igual).trim(), linha.slice(igual + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const destino = config.PAINEL_SSH;
if (!destino) {
  console.error("PAINEL_SSH nao esta no .env.servidor (ex.: root@188.0.0.1).");
  process.exit(1);
}
const chave = (config.PAINEL_CHAVE || "~/.ssh/painel_battlehost").replace(/^~/, homedir());

const opcoes = process.argv.slice(2).filter((a) => ["--banco", "--voltar"].includes(a));
const sobrando = process.argv.slice(2).filter((a) => !opcoes.includes(a));
if (sobrando.length > 0) {
  console.error(`Nao conheco a opcao ${sobrando[0]}. Use --banco ou --voltar.`);
  process.exit(1);
}

console.log(`Servidor: ${destino}\n`);

const ssh = spawn(
  "ssh",
  ["-i", chave, "-o", "BatchMode=yes", "-o", "ConnectTimeout=15", destino, "bash", "/opt/painel/atualizar.sh", ...opcoes],
  { stdio: "inherit" },
);

ssh.on("close", (codigo) => {
  if (codigo === 2) {
    console.log(
      "\nO schema do banco mudou. Confira a diferenca e, quando decidir, rode:\n  npm run deploy -- --banco",
    );
  } else if (codigo !== 0) {
    console.log("\nNao deu certo. O painel continua no ar com a versao anterior.");
  }
  process.exit(codigo ?? 1);
});
