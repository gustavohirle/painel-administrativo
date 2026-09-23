/**
 * Leva variaveis do `.env.live` LOCAL para o `.env.live` do servidor.
 *
 *     npm run env:enviar              # so mostra o que mudaria
 *     npm run env:enviar -- --confirmar
 *
 * Existe porque quem preenche as chaves nao acessa o servidor: as chaves da
 * Nuvemshop foram coladas no arquivo local e levadas na mao, e as dos
 * marketplaces seguem o mesmo caminho.
 *
 * ELE NAO COPIA O ARQUIVO. Copiar por cima quebraria a producao de tres
 * maneiras de uma vez -- o `DATABASE_URL` local aponta para o Postgres da
 * maquina de quem edita, o `SESSAO_SECRET` diferente derruba todas as sessoes
 * abertas, e as senhas semeadas nao sao as mesmas. Por isso ele MESCLA:
 * escreve as variaveis que voce mandou e deixa todo o resto do servidor como
 * estava. Variavel que existe no servidor e nao existe aqui nunca e removida.
 *
 * Nada de segredo aparece na tela: valor sensivel sai mascarado, aqui e no
 * resumo do que mudou.
 */

import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import os from "node:os";

/*
 * NUNCA sobem. Sao as variaveis que dizem respeito a MAQUINA, e nao a
 * integracao: cada ambiente tem as suas, e igualar as duas pontas e justamente
 * o estrago que este script existe para evitar.
 */
const NUNCA_ENVIAR = new Set([
  "DATABASE_URL",
  "SESSAO_SECRET",
  "SENHA_DONO",
  "SENHA_ESTOQUE",
  "NUVEMSHOP_CACHE_DIR",
  "PAINEL_DIST_DIR",
  "PERMITIR_HTTP_SEM_TLS",
  "NUVEMSHOP_ATUALIZAR_MINUTOS",
]);

/** Nomes cujo VALOR nunca aparece na tela. */
const ehSensivel = (nome) =>
  /(TOKEN|SEGREDO|SECRET|SENHA|KEY|CHAVE|PASSWORD|REFRESH)/.test(nome);

const mascarar = (valor) => {
  const limpo = String(valor ?? "").trim();
  if (limpo === "") return "(vazio)";
  if (limpo.length <= 4) return "****";
  return `${"*".repeat(8)}${limpo.slice(-4)}`;
};

const mostrar = (nome, valor) => (ehSensivel(nome) ? mascarar(valor) : valor || "(vazio)");

/** Lê um arquivo de ambiente para um Map, preservando a ordem. */
function lerEnv(texto) {
  const mapa = new Map();
  for (const linha of texto.split(/\r?\n/)) {
    const achado = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(linha);
    if (!achado) continue;
    let valor = achado[2].trim();
    // Aspas ao redor sao do arquivo, nao do valor.
    if (
      (valor.startsWith('"') && valor.endsWith('"') && valor.length > 1) ||
      (valor.startsWith("'") && valor.endsWith("'") && valor.length > 1)
    ) {
      valor = valor.slice(1, -1);
    }
    mapa.set(achado[1], valor);
  }
  return mapa;
}

function lerServidor() {
  const texto = readFileSync(".env.servidor", "utf8");
  const env = lerEnv(texto);
  const ssh = env.get("PAINEL_SSH");
  const chave = env.get("PAINEL_CHAVE");
  if (!ssh || !chave) {
    throw new Error("PAINEL_SSH e PAINEL_CHAVE precisam estar no .env.servidor.");
  }
  return { ssh, chave: chave.replace(/^~/, os.homedir()) };
}

const noServidor = ({ ssh, chave }, comando) =>
  execFileSync("ssh", ["-i", chave, "-o", "BatchMode=yes", ssh, comando], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });

function main() {
  const args = process.argv.slice(2);
  const confirmar = args.includes("--confirmar");
  const prefixo = (() => {
    const i = args.indexOf("--prefixo");
    return i >= 0 ? args[i + 1] : null;
  })();

  const local = lerEnv(readFileSync(".env.live", "utf8"));
  const servidor = lerServidor();
  const remoto = lerEnv(noServidor(servidor, "cat /opt/painel/app/.env.live"));

  const aEnviar = [...local.entries()].filter(([nome]) => {
    if (NUNCA_ENVIAR.has(nome)) return false;
    return prefixo ? nome.startsWith(prefixo) : true;
  });

  const novas = [];
  const mudadas = [];
  for (const [nome, valor] of aEnviar) {
    if (!remoto.has(nome)) {
      // Variavel vazia que o servidor nao tem nao e novidade: e bloco de
      // modelo esperando a chave.
      if (valor.trim() !== "") novas.push(nome);
    } else if (remoto.get(nome) !== valor) {
      mudadas.push(nome);
    }
  }

  const soNoServidor = [...remoto.keys()].filter((n) => !local.has(n) && !NUNCA_ENVIAR.has(n));

  console.log(`\nServidor: ${servidor.ssh}`);
  console.log(`Arquivo local: ${aEnviar.length} variavel(is) elegivel(is).\n`);

  if (novas.length === 0 && mudadas.length === 0) {
    console.log("Nada a enviar: o servidor ja esta igual.\n");
    return;
  }

  if (novas.length) {
    console.log(`  NOVAS (${novas.length}):`);
    for (const n of novas) console.log(`    + ${n} = ${mostrar(n, local.get(n))}`);
  }
  if (mudadas.length) {
    console.log(`\n  ALTERADAS (${mudadas.length}):`);
    for (const n of mudadas) {
      console.log(`    ~ ${n}`);
      console.log(`        servidor: ${mostrar(n, remoto.get(n))}`);
      console.log(`        local:    ${mostrar(n, local.get(n))}`);
    }
  }
  if (soNoServidor.length) {
    console.log(`\n  So no servidor, MANTIDAS como estao (${soNoServidor.length}):`);
    console.log(`    ${soNoServidor.join(", ")}`);
  }
  console.log(`\n  Nunca enviadas: ${[...NUNCA_ENVIAR].join(", ")}`);

  if (!confirmar) {
    console.log("\nNada foi alterado. Para aplicar:\n  npm run env:enviar -- --confirmar\n");
    return;
  }

  /*
   * O arquivo novo e montado AQUI e mandado inteiro, em base64: assim nenhum
   * valor passa pela linha de comando do ssh (onde apareceria na lista de
   * processos do servidor) nem precisa de escape.
   */
  const final = new Map(remoto);
  for (const [nome, valor] of aEnviar) {
    if (valor.trim() === "" && !remoto.has(nome)) continue;
    final.set(nome, valor);
  }

  const texto =
    "# Gerado por `npm run env:enviar`. Editar aqui e valido; o proximo envio\n" +
    "# mescla, nunca sobrescreve o que so existe aqui.\n" +
    [...final.entries()]
      .map(([nome, valor]) => (/[\s"'#]/.test(valor) ? `${nome}="${valor}"` : `${nome}=${valor}`))
      .join("\n") +
    "\n";

  const temporario = path.join(os.tmpdir(), `env-live-${process.pid}.b64`);
  writeFileSync(temporario, Buffer.from(texto, "utf8").toString("base64"), "utf8");

  try {
    execFileSync(
      "ssh",
      [
        "-i",
        servidor.chave,
        "-o",
        "BatchMode=yes",
        servidor.ssh,
        // Guarda o anterior antes de trocar, e mantem o modo 600 e o dono.
        "cp -a /opt/painel/app/.env.live /opt/painel/app/.env.live.anterior && " +
          "cat > /tmp/env.b64 && base64 -d /tmp/env.b64 > /opt/painel/app/.env.live && " +
          "rm -f /tmp/env.b64 && chown painel:painel /opt/painel/app/.env.live && " +
          "chmod 600 /opt/painel/app/.env.live && systemctl restart painel && sleep 4 && " +
          'curl -s -o /dev/null -w "painel %{http_code}\\n" http://127.0.0.1:3001/entrar',
      ],
      { input: readFileSync(temporario, "utf8"), encoding: "utf8", stdio: ["pipe", "inherit", "inherit"] },
    );
  } finally {
    unlinkSync(temporario);
  }

  console.log("\nEnviado. O anterior ficou em /opt/painel/app/.env.live.anterior\n");
}

try {
  main();
} catch (erro) {
  console.error(`\n  ${erro instanceof Error ? erro.message : String(erro)}\n`);
  process.exitCode = 1;
}
