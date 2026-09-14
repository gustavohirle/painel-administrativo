/**
 * Acentua o texto de interface usando o PARSER do TypeScript.
 *
 * A tentativa anterior usava expressao regular sobre ">...<" e corrompeu 36
 * arquivos: o ">" de uma arrow function abria um falso trecho de texto e as
 * chaves saiam do lugar. Regex nao distingue texto de codigo em JSX.
 *
 * Aqui quem diz o que e texto e o proprio compilador. So sao alteradas:
 *   - nos JsxText (o texto solto entre tags);
 *   - strings de atributos de exibicao (placeholder, title, alt, aria-label...);
 *   - strings em propriedades de exibicao (rotulo, titulo, descricao, apoio...);
 *   - todos os valores de constantes ROTULO_*, EXPLICACAO_*, DESCRICAO_*.
 *
 * Nunca sao tocados identificadores, chaves de objeto, caminhos de import,
 * className, nem valores gravados no banco.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

// Resolve a partir do PROJETO, nao da pasta do script: o `typescript` esta no
// node_modules do painel, e o script mora fora dele.
const require = createRequire(`file:///${process.cwd().replace(/\\/g, "/")}/package.json`);
const ts = require("typescript");

const MAPA = JSON.parse(readFileSync(new URL("./acentuar-palavras.json", import.meta.url), "utf8"));

const ATRIBUTOS_DE_EXIBICAO = new Set([
  "placeholder", "title", "alt", "aria-label", "rotulo", "titulo",
  "descricao", "apoio", "label", "legend", "summary",
]);

const PROPRIEDADES_DE_EXIBICAO = new Set([
  "rotulo", "titulo", "descricao", "apoio", "mensagem", "label", "texto",
]);

const PREFIXOS_DE_ROTULO = ["ROTULO_", "EXPLICACAO_", "DESCRICAO_", "TITULO_", "AVISO_"];

function casar(original, acentuada) {
  if (original === original.toUpperCase() && original !== original.toLowerCase()) {
    return acentuada.toUpperCase();
  }
  if (original[0] === original[0].toUpperCase()) {
    return acentuada[0].toUpperCase() + acentuada.slice(1);
  }
  return acentuada;
}

const PALAVRA = /[A-Za-zÀ-ſ]+/g;

function acentuar(texto) {
  return texto.replace(PALAVRA, (p) => {
    const alvo = MAPA[p.toLowerCase()];
    return alvo ? casar(p, alvo) : p;
  });
}

/** Sobe pela arvore procurando uma constante ROTULO_* / EXPLICACAO_* etc. */
function dentroDeMapaDeRotulos(node) {
  for (let n = node.parent; n; n = n.parent) {
    if (ts.isVariableDeclaration(n) && n.name && ts.isIdentifier(n.name)) {
      return PREFIXOS_DE_ROTULO.some((p) => n.name.text.startsWith(p));
    }
  }
  return false;
}

/**
 * A string esta sendo renderizada dentro de {chaves} no meio do JSX?
 *
 * Para de subir ao encontrar um atributo: `className={cond ? "a" : "b"}` tem
 * JsxExpression na arvore, mas o conteudo e classe de CSS, nao texto.
 */
function dentroDeExpressaoJsx(node) {
  for (let n = node.parent; n; n = n.parent) {
    if (ts.isJsxAttribute(n)) return false;
    if (ts.isJsxExpression(n)) {
      const dono = n.parent;
      return dono && (ts.isJsxElement(dono) || ts.isJsxFragment(dono));
    }
    // Nao atravessa fronteira de funcao: uma string dentro de um callback
    // pode ser qualquer coisa.
    if (ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)) return false;
  }
  return false;
}

function trechosParaAcentuar(arquivo, texto) {
  const sf = ts.createSourceFile(arquivo, texto, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const trechos = [];

  function visitar(node) {
    // 1. Texto solto entre tags. Sempre seguro.
    if (node.kind === ts.SyntaxKind.JsxText) {
      trechos.push([node.pos, node.end]);
    }

    if (ts.isStringLiteral(node)) {
      const pai = node.parent;
      const inicio = node.getStart(sf) + 1;
      const fim = node.getEnd() - 1;

      // 2. Atributo de JSX que so existe para exibir.
      if (pai && ts.isJsxAttribute(pai) && ATRIBUTOS_DE_EXIBICAO.has(pai.name.getText(sf))) {
        trechos.push([inicio, fim]);
      }

      // 3. Propriedade de objeto cujo NOME e de exibicao (o valor, nao a chave).
      if (
        pai &&
        ts.isPropertyAssignment(pai) &&
        pai.initializer === node &&
        PROPRIEDADES_DE_EXIBICAO.has(pai.name.getText(sf))
      ) {
        trechos.push([inicio, fim]);
      }

      // 4. Qualquer valor dentro de um mapa de rotulos.
      if (
        pai &&
        ts.isPropertyAssignment(pai) &&
        pai.initializer === node &&
        dentroDeMapaDeRotulos(node)
      ) {
        trechos.push([inicio, fim]);
      }

      /*
       * 5. String dentro de uma expressao de JSX -- o caso do ternario:
       *      {aberto ? "Fechar" : "Nova ordem de fabricacao"}
       *
       * Nao e texto solto nem atributo, entao escapou das regras acima e o
       * botao ficou sem acento na tela. Se a string esta sendo renderizada
       * dentro de chaves no meio do JSX, ela e texto para o leitor.
       */
      if (dentroDeExpressaoJsx(node)) {
        trechos.push([inicio, fim]);
      }
    }

    ts.forEachChild(node, visitar);
  }

  visitar(sf);
  return trechos;
}

export function processar(arquivo) {
  const texto = readFileSync(arquivo, "utf8");
  const trechos = trechosParaAcentuar(arquivo, texto);

  // De tras para frente: assim os deslocamentos anteriores continuam validos.
  trechos.sort((a, b) => b[0] - a[0]);

  let saida = texto;
  let mudancas = 0;

  for (const [inicio, fim] of trechos) {
    const original = saida.slice(inicio, fim);
    const novo = acentuar(original);
    if (novo !== original) {
      saida = saida.slice(0, inicio) + novo + saida.slice(fim);
      mudancas += 1;
    }
  }

  if (mudancas > 0) writeFileSync(arquivo, saida, "utf8");
  return mudancas;
}

if (process.argv[2]) {
  const arquivos = process.argv.slice(2);
  let total = 0;
  for (const a of arquivos) {
    const n = processar(a);
    if (n) {
      console.log(`  ${n.toString().padStart(3)} trecho(s)  ${a.replace(/\\/g, "/")}`);
      total += n;
    }
  }
  console.log(`\n${total} trecho(s) de texto acentuados`);
}
