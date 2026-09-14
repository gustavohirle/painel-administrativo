/**
 * Teste de fumaca das rotas: sobe nada, so bate no `npm run dev` que ja esta
 * rodando e confere que cada pagina monta no servidor.
 *
 * Existe porque verificar isso na mao e caro. Toda rota do painel exige
 * sessao, e dirigir o formulario de login por `curl` nao funciona: o login e
 * uma Server Action, cujo protocolo (header `Next-Action`, id que muda a cada
 * build, argumentos serializados) nao e feito para ser falado a mao. A saida e
 * forjar o cookie -- o mesmo que o navegador receberia.
 *
 *   node scripts/fumaca.mjs [--porta 3000]
 *
 * Roda com `--env-file-if-exists=.env` (ver package.json) porque a assinatura
 * do cookie tem que ser a MESMA que o servidor usa. Sem isso, depois que
 * `SESSAO_SECRET` passou a existir, todas as rotas passariam a redirecionar
 * para /entrar e o script acusaria "sessao recusada" sem haver nada quebrado.
 *
 * Confere, para cada perfil:
 *   - pagina permitida responde 200 e sem tela de erro do Next;
 *   - pagina proibida redireciona para a rota inicial do perfil, nao 200
 *     (e a garantia de 5.13: a verificacao acontece no servidor).
 *
 * NAO substitui olhar a tela. Diz que a pagina montou, nao que o numero esta
 * certo nem que o layout coube em 1366x768.
 */

import { createHmac } from "node:crypto";
import { readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------
// Cookie de sessao
//
// Duplica `criarTokenSessao` de src/lib/auth.ts de proposito: este script e
// node puro, sem passar pelo TypeScript, para poder rodar sozinho e rapido.
// Se a assinatura la mudar, aqui todas as rotas passam a redirecionar para
// /entrar e o script acusa "sessao recusada" -- a divergencia aparece na hora,
// nao vira falso verde.
// ---------------------------------------------------------------------------

const NOME_COOKIE = "painel_sessao";
const SEGREDO_DEMO =
  "segredo-de-demonstracao-nao-usar-em-producao-troque-no-env";

const b64url = (dado) =>
  Buffer.from(dado).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function tokenSessao(usuarioId, perfil) {
  const segredo = process.env.SESSAO_SECRET ?? SEGREDO_DEMO;
  const corpo = b64url(
    JSON.stringify({ usuarioId, perfil, expiraEm: Math.floor(Date.now() / 1000) + 3600 }),
  );
  return `${corpo}.${b64url(createHmac("sha256", segredo).update(corpo).digest())}`;
}

// ---------------------------------------------------------------------------
// Rotas
//
// Descobertas em src/app para nao envelhecer sozinhas. A area exigida por cada
// uma espelha a chamada de `exigirArea` na propria pagina; rota nova sem
// entrada aqui vira aviso, e nao um verde silencioso.
// ---------------------------------------------------------------------------

const AREA_DA_ROTA = {
  "/": "financeiro",
  "/influencers": "financeiro",
  "/relatorios": "financeiro",
  "/simulador": "financeiro",
  "/impostos": "fiscal",
  "/difal": "fiscal",
  "/custos": "custos",
  "/produtos": "produtos",
  "/ordens": "produtos",
  "/estoque": "estoque",
};

// Espelha PERMISSOES de src/types/usuario.ts.
const PERMISSOES = {
  dono: ["financeiro", "custos", "produtos", "estoque", "fiscal", "usuarios"],
  estoque: ["custos", "produtos", "estoque"],
};

const ROTA_INICIAL = { dono: "/", estoque: "/estoque" };
const USUARIO_ID = { dono: "usuario-dono", estoque: "usuario-estoque" };

function rotasDoProjeto() {
  const base = join(RAIZ, "src", "app");
  const rotas = [];
  if (existsSync(join(base, "page.tsx"))) rotas.push("/");
  for (const item of readdirSync(base, { withFileTypes: true })) {
    if (!item.isDirectory() || item.name === "entrar") continue;
    if (existsSync(join(base, item.name, "page.tsx"))) rotas.push(`/${item.name}`);
  }
  return rotas.sort();
}

// ---------------------------------------------------------------------------

const porta = (() => {
  const i = process.argv.indexOf("--porta");
  return i !== -1 ? process.argv[i + 1] : "3000";
})();
const base = `http://localhost:${porta}`;

async function visitar(rota, perfil) {
  const resposta = await fetch(base + rota, {
    redirect: "manual",
    headers: { Cookie: `${NOME_COOKIE}=${tokenSessao(USUARIO_ID[perfil], perfil)}` },
  });
  const destino = resposta.headers.get("location");
  const corpo = resposta.status === 200 ? await resposta.text() : "";
  return {
    status: resposta.status,
    destino,
    // O Next responde 200 com esta marca quando a pagina estourou no servidor.
    estourou: corpo.includes("__next_error__"),
  };
}

const falhas = [];

console.log(`Teste de fumaca em ${base}\n`);

try {
  await fetch(base, { redirect: "manual" });
} catch {
  console.error(`Nada respondendo em ${base}. Rode 'npm run dev' antes.`);
  process.exit(1);
}

for (const perfil of Object.keys(PERMISSOES)) {
  console.log(`perfil ${perfil}`);

  for (const rota of rotasDoProjeto()) {
    const area = AREA_DA_ROTA[rota];
    if (!area) {
      console.log(`  ?  ${rota.padEnd(12)} rota nova -- acrescente em AREA_DA_ROTA`);
      falhas.push(`${rota}: sem area declarada em scripts/fumaca.mjs`);
      continue;
    }

    const permitida = PERMISSOES[perfil].includes(area);
    const { status, destino, estourou } = await visitar(rota, perfil);

    if (destino?.endsWith("/entrar")) {
      console.log(`  x  ${rota.padEnd(12)} sessao recusada -- assinatura divergiu de src/lib/auth.ts`);
      falhas.push(`${perfil} ${rota}: sessao recusada`);
    } else if (permitida && status === 200 && !estourou) {
      console.log(`  ok ${rota.padEnd(12)} 200`);
    } else if (permitida && estourou) {
      console.log(`  x  ${rota.padEnd(12)} 200 mas estourou no servidor (veja o log do dev)`);
      falhas.push(`${perfil} ${rota}: erro de render`);
    } else if (permitida) {
      console.log(`  x  ${rota.padEnd(12)} ${status}${destino ? ` -> ${destino}` : ""}`);
      falhas.push(`${perfil} ${rota}: esperado 200, veio ${status}`);
    } else if (status === 200) {
      console.log(`  x  ${rota.padEnd(12)} 200 -- ${perfil} NAO devia ver ${area}`);
      falhas.push(`${perfil} ${rota}: acesso indevido a area ${area}`);
    } else {
      console.log(`  ok ${rota.padEnd(12)} ${status} -> ${ROTA_INICIAL[perfil]} (bloqueado, correto)`);
    }
  }
  console.log("");
}

// ---------------------------------------------------------------------------
// Pagina publica de assinatura
//
// Nao entra no laco acima porque a regra dela e o OPOSTO da de todas as
// outras: ela tem que abrir SEM sessao. E a unica rota do painel assim, e a
// unica em que um redirecionamento para /entrar seria o defeito, nao a
// protecao -- o responsavel pela fabricacao nao tem conta.
//
// O token vem de `TOKEN_ORDEM_DEMO` em src/data/seeds.ts, semeado so em modo
// demonstracao justamente para esta conferencia ser possivel.
// ---------------------------------------------------------------------------

const TOKEN_DEMO = "demonstracao-aguardando-assinatura-do-gerente";

console.log("pagina publica de assinatura");

{
  const semSessao = await fetch(`${base}/assinar/${TOKEN_DEMO}`, { redirect: "manual" });
  const corpo = semSessao.status === 200 ? await semSessao.text() : "";

  if (semSessao.status !== 200) {
    console.log(`  x  /assinar/<token>  ${semSessao.status} -- devia abrir sem login`);
    falhas.push(`/assinar: esperado 200 sem sessao, veio ${semSessao.status}`);
  } else if (corpo.includes("Este link não vale mais")) {
    console.log("  x  /assinar/<token>  abriu, mas nao achou a ordem semeada");
    falhas.push("/assinar: ordem de demonstracao nao foi semeada");
  } else {
    console.log("  ok /assinar/<token>  200 sem login (correto)");
  }

  // Token errado nao pode abrir ordem nenhuma.
  const errado = await fetch(`${base}/assinar/${"z".repeat(45)}`, { redirect: "manual" });
  const corpoErrado = errado.status === 200 ? await errado.text() : "";

  if (errado.status === 200 && corpoErrado.includes("Este link não vale mais")) {
    console.log("  ok /assinar/<errado> recusado (correto)");
  } else {
    console.log(`  x  /assinar/<errado> ${errado.status} -- token invalido abriu alguma coisa`);
    falhas.push("/assinar: token invalido nao foi recusado");
  }

  // O PDF por token so existe depois da assinatura; nesta ordem, ainda nao.
  const pdf = await fetch(`${base}/assinar/${TOKEN_DEMO}/pdf`, { redirect: "manual" });
  if (pdf.status === 404) {
    console.log("  ok /assinar/<token>/pdf  404 antes de assinar (correto)");
  } else {
    console.log(`  x  /assinar/<token>/pdf  ${pdf.status} -- devia ser 404 sem documento`);
    falhas.push(`/assinar/pdf: esperado 404, veio ${pdf.status}`);
  }
}

console.log("");

if (falhas.length) {
  console.error(`${falhas.length} problema(s):`);
  for (const f of falhas) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("Todas as rotas montaram e o bloqueio por perfil respondeu.");
