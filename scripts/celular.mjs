/**
 * Auditoria de celular: abre cada rota numa largura de telefone e mede o que
 * quebra sem aparecer no HTML.
 *
 *   node scripts/celular.mjs [--largura 390] [--rota /relatorios]
 *
 * Existe porque as tres armadilhas da secao 2.1 do CLAUDE.md sao invisiveis
 * em leitura de codigo e em teste unitario:
 *
 * 1. Transbordo horizontal -- elemento que passa da borda da tela.
 * 2. Texto de SVG que chega pequeno demais depois da escala do viewBox.
 *    Fonte 14 num viewBox de 1200 espremido em 294px vira 3,2px. O numero
 *    que importa e o TAMANHO NA TELA, nao o `fontSize` escrito no JSX.
 * 3. Tabela que rola de lado sem ancorar a primeira coluna -- rola, mas quem
 *    arrasta ate a coluna certa ja nao sabe de que linha e aquele numero.
 * 4. Formulario de edicao que nasce com a largura da TABELA, nao da tela. Este
 *    so aparece depois de um clique -- foi assim que passou batido na primeira
 *    versao desta auditoria, que media a pagina parada.
 *
 * Roda com `--env-file-if-exists=.env` pelo mesmo motivo que `fumaca.mjs`: a
 * assinatura do cookie precisa bater com a do servidor.
 *
 * Precisa do Chrome instalado e do `npm run dev` no ar. Nao instala nada:
 * fala o protocolo do proprio Chrome por WebSocket, que o Node ja tem.
 */

import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

// Abaixo disso o texto de grafico nao se le num telefone. Ver secao 2.1.
const FONTE_MINIMA_NA_TELA = 9;

const argumento = (nome, padrao) => {
  const i = process.argv.indexOf(`--${nome}`);
  return i !== -1 ? process.argv[i + 1] : padrao;
};

const LARGURA = Number(argumento("largura", "390"));
const PORTA_CDP = 9223;
const base = `http://localhost:${argumento("porta", "3000")}`;

// ---------------------------------------------------------------------------
// Sessao (mesma logica de scripts/fumaca.mjs -- ver o comentario de la)
// ---------------------------------------------------------------------------

const b64 = (x) =>
  Buffer.from(x).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function token() {
  const segredo =
    process.env.SESSAO_SECRET ??
    "segredo-de-demonstracao-nao-usar-em-producao-troque-no-env";
  const corpo = b64(
    JSON.stringify({
      usuarioId: "usuario-dono",
      perfil: "dono",
      expiraEm: Math.floor(Date.now() / 1000) + 3600,
    }),
  );
  return `${corpo}.${b64(createHmac("sha256", segredo).update(corpo).digest())}`;
}

// ---------------------------------------------------------------------------

function acharChrome() {
  const candidatos = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);

  return candidatos.find((c) => existsSync(c)) ?? null;
}

function rotasDoProjeto() {
  const dir = join(RAIZ, "src", "app");
  const rotas = existsSync(join(dir, "page.tsx")) ? ["/"] : [];
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    if (!item.isDirectory() || item.name === "entrar") continue;
    if (existsSync(join(dir, item.name, "page.tsx"))) rotas.push(`/${item.name}`);
  }
  return rotas.sort();
}

// ---------------------------------------------------------------------------

const chrome = acharChrome();
if (!chrome) {
  console.error("Chrome nao encontrado. Aponte CHROME_PATH para o executavel.");
  process.exit(1);
}

try {
  await fetch(base);
} catch {
  console.error(`Nada respondendo em ${base}. Rode 'npm run dev' antes.`);
  process.exit(1);
}

const perfil = mkdtempSync(join(tmpdir(), "painel-celular-"));
const processo = spawn(
  chrome,
  [
    "--headless=new",
    `--remote-debugging-port=${PORTA_CDP}`,
    `--user-data-dir=${perfil}`,
    "--no-first-run",
    "--hide-scrollbars",
    "about:blank",
  ],
  { stdio: "ignore" },
);

/** Espera o Chrome atender, em vez de dormir um tempo fixo e torcer. */
async function esperarChrome() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORTA_CDP}/json/list`);
      if (r.ok) return await r.json();
    } catch {
      /* ainda subindo */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Chrome nao abriu a porta de depuracao.");
}

const alvos = await esperarChrome();
const ws = new WebSocket(alvos.find((a) => a.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));

let id = 0;
const pendentes = new Map();
let carregou = false;
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.method === "Page.loadEventFired") carregou = true;
  if (pendentes.has(m.id)) {
    const { ok, ko } = pendentes.get(m.id);
    pendentes.delete(m.id);
    m.error ? ko(new Error(m.error.message)) : ok(m.result);
  }
};
const cdp = (method, params = {}) =>
  new Promise((ok, ko) => {
    const n = ++id;
    pendentes.set(n, { ok, ko });
    ws.send(JSON.stringify({ id: n, method, params }));
  });

await cdp("Page.enable");
await cdp("Network.enable");
await cdp("Network.setCookie", {
  name: "painel_sessao",
  value: token(),
  domain: "localhost",
  path: "/",
});

const MEDIDA = `JSON.stringify({
  viewport: innerWidth,
  scroll: document.documentElement.scrollWidth,
  altura: document.documentElement.scrollHeight,

  // Transbordo: elemento passando da borda SEM estar num container de rolagem
  // horizontal proprio (tabela larga dentro de .overflow-x-auto e aceitavel).
  culpados: [...document.querySelectorAll('body *')]
    .filter(el => el.getBoundingClientRect().right > innerWidth + 1)
    .filter(el => !el.closest('.overflow-x-auto'))
    .slice(0, 6)
    .map(el => el.tagName.toLowerCase() + '.' + String(el.className || '').slice(0, 50)),

  // Tamanho REAL do texto de SVG depois da escala do viewBox.
  fontes: [...document.querySelectorAll('svg')].flatMap(svg => {
    const vb = svg.viewBox.baseVal.width;
    if (!vb) return [];
    const escala = svg.getBoundingClientRect().width / vb;
    return [...svg.querySelectorAll('text')]
      .map(t => +((+t.getAttribute('font-size') || 16) * escala).toFixed(1));
  }).filter(px => px > 0),

  // Tabela que rola de lado tem que ancorar a primeira coluna.
  //
  // O 'querySelector(table)' nao e detalhe: nem todo container de rolagem
  // horizontal e tabela. A faixa de abas do cabecalho tambem rola, e sem este
  // filtro ela era acusada de 'tabela rolando sem coluna ancorada' em TODAS as
  // rotas -- um alarme falso que so aparece quando alguem adiciona o primeiro
  // rolador que nao e tabela.
  tabelasSoltas: [...document.querySelectorAll('.overflow-x-auto')]
    .filter(cx => cx.querySelector('table'))
    .filter(cx => cx.scrollWidth > cx.clientWidth + 1)
    .filter(cx => {
      const primeira = cx.querySelector('tbody tr :is(th,td):first-child');
      return !primeira || getComputedStyle(primeira).position !== 'sticky';
    }).length
})`;

/**
 * Abre o formulario de edicao da primeira linha e mede se ele cabe.
 *
 * Precisa ser um clique de verdade: o formulario nao existe no HTML inicial.
 * "Editar" nas telas de cadastro, "Editar contrato" na tela de um influencer,
 * "Contar" no estoque, "Montar" nos kits.
 */
const ABRIR_EDICAO = `new Promise((resolve) => {
  const gatilho = [...document.querySelectorAll('button')]
    .find(b => /^(editar|editar contrato|contar|montar)$/i.test((b.textContent || '').trim()));
  if (!gatilho) return resolve(JSON.stringify({ semFormulario: true }));

  gatilho.click();
  setTimeout(() => {
    const caixa = document.querySelector('.linha-de-edicao');
    if (!caixa) {
      return resolve(JSON.stringify({
        erro: 'o formulario abriu fora de uma .linha-de-edicao -- sem ela ele herda a largura da tabela',
      }));
    }
    const r = caixa.getBoundingClientRect();
    resolve(JSON.stringify({
      largura: Math.round(r.width),
      cabe: r.width <= innerWidth + 1,
    }));
  }, 900);
})`;

const falhas = [];
console.log(`Auditoria de celular em ${LARGURA}px\n`);

const rotas = argumento("rota", null) ? [argumento("rota", null)] : rotasDoProjeto();

for (const rota of rotas) {
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: LARGURA,
    height: 900,
    deviceScaleFactor: 2,
    mobile: true,
  });

  carregou = false;
  await cdp("Page.navigate", { url: base + rota });
  for (let i = 0; i < 60 && !carregou; i++) await new Promise((r) => setTimeout(r, 250));
  await new Promise((r) => setTimeout(r, 1200)); // hidratacao do React

  const m = JSON.parse(
    (await cdp("Runtime.evaluate", { expression: MEDIDA, returnByValue: true })).result.value,
  );

  const edicao = JSON.parse(
    (
      await cdp("Runtime.evaluate", {
        expression: ABRIR_EDICAO,
        returnByValue: true,
        awaitPromise: true,
      })
    ).result.value,
  );

  const menorFonte = m.fontes.length ? Math.min(...m.fontes) : null;
  const problemas = [];

  if (edicao.erro) problemas.push(edicao.erro);
  if (edicao.largura && !edicao.cabe) {
    problemas.push(`formulario de edicao com ${edicao.largura}px numa tela de ${m.viewport}px`);
  }
  if (m.culpados.length) problemas.push(`transborda: ${m.culpados[0]}`);
  if (menorFonte !== null && menorFonte < FONTE_MINIMA_NA_TELA) {
    problemas.push(`texto de grafico a ${menorFonte}px`);
  }
  if (m.tabelasSoltas > 0) {
    problemas.push(`${m.tabelasSoltas} tabela(s) rolam sem coluna ancorada`);
  }

  const resumo = [
    `${m.altura}px de altura`,
    menorFonte !== null ? `menor fonte ${menorFonte}px` : "sem grafico",
    edicao.semFormulario ? "sem formulario" : `edicao ${edicao.largura}px`,
  ].join(", ");

  if (problemas.length) {
    console.log(`  x  ${rota.padEnd(12)} ${problemas.join("; ")}`);
    falhas.push(`${rota}: ${problemas.join("; ")}`);
  } else {
    console.log(`  ok ${rota.padEnd(12)} ${resumo}`);
  }
}

ws.close();
processo.kill();

if (falhas.length) {
  console.error(`\n${falhas.length} rota(s) com problema no celular:`);
  for (const f of falhas) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\nNenhuma rota transborda, nenhum grafico ilegivel, nenhum formulario maior que a tela.");
