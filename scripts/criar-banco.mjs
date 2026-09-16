/**
 * Cria no Postgres local o usuario e o banco que o `.env.live` espera.
 *
 *   npm run db:criar:live
 *
 * Le o DATABASE_URL do `.env.live` (usuario, senha, porta e nome do banco ja
 * estao la) e pede a senha do superusuario `postgres` -- a que foi definida na
 * instalacao do Postgres. Essa senha nao e gravada em lugar nenhum.
 *
 * Pode rodar de novo: se o usuario ja existe, so acerta a senha dele para a do
 * `.env.live`; se o banco ja existe, nao mexe.
 *
 * Usa o `psql` da instalacao do Windows (C:\Program Files\PostgreSQL\<versao>).
 * Com mais de uma versao instalada, escolhe a mais nova -- que e a da porta
 * 5432 nesta maquina. Outro caminho: variavel PSQL.
 */

import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL não está no .env.live.");
  process.exit(1);
}

const alvo = new URL(url);
const usuario = decodeURIComponent(alvo.username);
const senha = decodeURIComponent(alvo.password);
const banco = alvo.pathname.replace(/^\//, "");
const host = alvo.hostname;
const porta = alvo.port || "5432";

// Os nomes entram no SQL; so aceita o que nao precisa de escape.
for (const [nome, valor] of [["usuário", usuario], ["banco", banco]]) {
  if (!/^[a-z_][a-z0-9_]*$/.test(valor)) {
    console.error(`Nome de ${nome} inválido no DATABASE_URL: "${valor}". Use letras minúsculas, números e _.`);
    process.exit(1);
  }
}
if (!/^[A-Za-z0-9]{12,}$/.test(senha)) {
  console.error("A senha do DATABASE_URL precisa ter 12 ou mais letras e números (sem símbolos).");
  process.exit(1);
}

function acharPsql() {
  if (process.env.PSQL) return process.env.PSQL;
  const raiz = "C:\\Program Files\\PostgreSQL";
  if (!existsSync(raiz)) return "psql";
  const versoes = readdirSync(raiz)
    .filter((v) => existsSync(join(raiz, v, "bin", "psql.exe")))
    .sort((a, b) => Number(b) - Number(a));
  return versoes.length ? join(raiz, versoes[0], "bin", "psql.exe") : "psql";
}

/** Le a senha sem mostrar o que e digitado. */
function perguntarSenha(pergunta) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (texto) => {
      if (texto.includes(pergunta)) rl.output.write(texto);
    };
    rl.question(pergunta, (resposta) => {
      rl.close();
      process.stdout.write("\n");
      resolve(resposta);
    });
  });
}

const sql = `
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${usuario}') THEN
    CREATE ROLE ${usuario} LOGIN PASSWORD '${senha}';
  ELSE
    ALTER ROLE ${usuario} WITH LOGIN PASSWORD '${senha}';
  END IF;
END
$$;
SELECT 'CREATE DATABASE ${banco} OWNER ${usuario}'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${banco}')\\gexec
`;

const psql = acharPsql();
console.log(`Postgres em ${host}:${porta}, usando ${psql}`);
console.log(`Vai criar o usuário "${usuario}" e o banco "${banco}".\n`);

const senhaAdmin = process.env.PGPASSWORD ?? (await perguntarSenha("Senha do usuário postgres: "));

const filho = spawn(
  psql,
  ["-h", host, "-p", porta, "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-f", "-"],
  { env: { ...process.env, PGPASSWORD: senhaAdmin }, stdio: ["pipe", "inherit", "inherit"] },
);
filho.stdin.end(sql);
filho.on("close", (codigo) => {
  if (codigo === 0) {
    console.log(`Pronto. Próximo passo: npm run db:push:live`);
  } else {
    console.error("\nNão deu certo. Se a mensagem acima fala de senha, confira a senha do postgres.");
    process.exitCode = 1;
  }
});
