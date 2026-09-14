/**
 * Acentua as MENSAGENS das Server Actions.
 *
 * Elas escaparam das regras anteriores porque nao sao texto de JSX nem
 * atributo: sao o segundo argumento do Zod (`.min(3, "Escreva o nome")`) e o
 * corpo de `{ ok: false, mensagem: "..." }`. Aparecem na tela quando o
 * formulario recusa alguma coisa -- sao das poucas frases que o cliente le
 * exatamente no momento em que esta irritado.
 *
 * Criterio para nao pegar codigo por engano: a string precisa ter espaco,
 * comecar com letra e nao conter parentese nem barra. Isso descarta caminho de
 * import, chave de formulario, valor de enum e rota.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(`file:///${process.cwd().replace(/\\/g, "/")}/package.json`);
const ts = require("typescript");
const MAPA = JSON.parse(readFileSync(new URL("./acentuar-palavras.json", import.meta.url), "utf8"));

function casar(o, a) {
  if (o === o.toUpperCase() && o !== o.toLowerCase()) return a.toUpperCase();
  if (o[0] === o[0].toUpperCase()) return a[0].toUpperCase() + a.slice(1);
  return a;
}

const PALAVRA = /[A-Za-zÀ-ſ]+/g;

const acentuar = (t) =>
  t.replace(PALAVRA, (p) => (MAPA[p.toLowerCase()] ? casar(p, MAPA[p.toLowerCase()]) : p));

function ehMensagem(valor) {
  if (!valor.includes(" ")) return false;
  if (!/^[A-Za-zÀ-ſ]/.test(valor)) return false;
  if (valor.includes("(") || valor.includes("/")) return false;
  return valor.split(" ").length >= 2;
}

let total = 0;

for (const arquivo of process.argv.slice(2)) {
  const texto = readFileSync(arquivo, "utf8");
  const sf = ts.createSourceFile(arquivo, texto, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const trechos = [];

  function visitar(node) {
    if (ts.isStringLiteral(node)) {
      const conteudo = texto.slice(node.getStart(sf) + 1, node.getEnd() - 1);
      if (ehMensagem(conteudo) && acentuar(conteudo) !== conteudo) {
        trechos.push([node.getStart(sf) + 1, node.getEnd() - 1]);
      }
    }
    ts.forEachChild(node, visitar);
  }

  visitar(sf);
  if (trechos.length === 0) continue;

  trechos.sort((a, b) => b[0] - a[0]);
  let saida = texto;
  for (const [i, f] of trechos) {
    saida = saida.slice(0, i) + acentuar(saida.slice(i, f)) + saida.slice(f);
  }

  writeFileSync(arquivo, saida, "utf8");
  console.log(`  ${trechos.length} mensagem(ns)  ${arquivo.replace(/\\/g, "/")}`);
  total += trechos.length;
}

console.log(`\n${total} mensagem(ns) acentuada(s)`);
