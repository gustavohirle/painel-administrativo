/**
 * Gerador de PDF, escrito a mao.
 *
 * Por que nao uma biblioteca: o painel inteiro precisa funcionar offline e sem
 * CDN (secao 2 do CLAUDE.md), e um PDF de uma pagina com texto, linhas e um
 * traco de assinatura cabe em duzentas linhas. E a mesma escolha dos graficos,
 * que sao SVG escrito a mao em vez de uma biblioteca de charts.
 *
 * O que ESTE gerador faz, e so isto:
 *
 *   - texto em Helvetica e Helvetica-Bold, nos dois pesos, com medicao real de
 *     largura (para alinhar numero a direita e centralizar titulo);
 *   - linhas, retangulos e polilinhas -- a assinatura desenhada e uma
 *     polilinha por traco;
 *   - varias paginas.
 *
 * O que ele NAO faz: fonte embutida, imagem, tabela, unicode fora do
 * WinAnsi. Se algum dia precisar de qualquer uma dessas, e hora de pesar uma
 * dependencia de verdade -- nao de esticar este arquivo.
 *
 * DECISAO: as coordenadas desta API sao medidas do TOPO da pagina para baixo,
 * ao contrario do PDF, cujo eixo Y sobe a partir do canto inferior esquerdo. A
 * conversao acontece num lugar so, em `fluxoDaPagina`. Escrever layout de
 * documento de baixo para cima e uma fonte inesgotavel de erro de um ponto.
 */

import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Papel
// ---------------------------------------------------------------------------

/** Dimensoes em pontos tipograficos (1pt = 1/72"). A4 = 210 x 297mm. */
export const A4_RETRATO = { largura: 595.28, altura: 841.89 } as const;

export interface TamanhoPagina {
  largura: number;
  altura: number;
}

// ---------------------------------------------------------------------------
// Primitivas de desenho
// ---------------------------------------------------------------------------

/** 0 = preto, 1 = branco. Tom de cinza basta: o documento e para imprimir. */
export type Cinza = number;

export type Alinhamento = "esquerda" | "direita" | "centro";

export interface TextoPdf {
  tipo: "texto";
  x: number;
  /** Distancia do TOPO da pagina ate a linha de base do texto. */
  y: number;
  texto: string;
  tamanho: number;
  negrito?: boolean;
  cor?: Cinza;
  /** `x` passa a ser a borda direita ou o centro, conforme o valor. */
  alinhamento?: Alinhamento;
}

export interface LinhaPdf {
  tipo: "linha";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  espessura?: number;
  cor?: Cinza;
}

export interface RetanguloPdf {
  tipo: "retangulo";
  x: number;
  /** Borda superior. */
  y: number;
  largura: number;
  altura: number;
  preenchimento?: Cinza;
  contorno?: Cinza;
  espessura?: number;
}

export interface TracoPdf {
  tipo: "traco";
  /** Pontos ja em coordenadas da pagina: [x0, y0, x1, y1, ...]. */
  pontos: number[];
  espessura?: number;
  cor?: Cinza;
}

export type Desenho = TextoPdf | LinhaPdf | RetanguloPdf | TracoPdf;

// ---------------------------------------------------------------------------
// Medicao de texto
// ---------------------------------------------------------------------------

/*
 * Larguras oficiais das AFM da Helvetica, em milesimos de em, para os codigos
 * 32 a 126. Sao 95 valores em cada tabela.
 *
 * Medir de verdade importa: sem isto, "2.400 un" alinhado a direita nao fica
 * embaixo de "Quantidade", e o traco da linha de assinatura nasce com um
 * comprimento que nao tem relacao com o nome escrito em cima dele.
 */
const LARGURAS_NORMAL: number[] = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, // 32-47
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, /*                            */ // 48-57
  278, 278, 584, 584, 584, 556, 1015, /*                                          */ // 58-64
  667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, /*             */ // 65-77
  722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, /*             */ // 78-90
  278, 278, 278, 469, 556, 333, /*                                                */ // 91-96
  556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, /*             */ // 97-109
  556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, /*             */ // 110-122
  334, 260, 334, 584, /*                                                          */ // 123-126
];

const LARGURAS_NEGRITO: number[] = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, // 32-47
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, /*                            */ // 48-57
  333, 333, 584, 584, 584, 611, 975, /*                                           */ // 58-64
  722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, /*             */ // 65-77
  722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, /*             */ // 78-90
  333, 278, 333, 584, 556, 333, /*                                                */ // 91-96
  556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, /*             */ // 97-109
  611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, /*             */ // 110-122
  389, 280, 389, 584, /*                                                          */ // 123-126
];

/**
 * Letra base de uma acentuada, por decomposicao Unicode.
 *
 * Serve para duas coisas ao mesmo tempo: na Helvetica a largura da acentuada e
 * exatamente a da letra base, e o texto que sobrar fora do WinAnsi cai aqui
 * antes de virar "?".
 *
 * Aqui havia uma tabela escrita a mao, com as cinquenta e tantas acentuadas
 * listadas uma a uma. Ela saiu por dois motivos: obrigava este arquivo a
 * conter dezenas de caracteres acentuados, contra a regra do projeto, e cobria
 * so o que alguem lembrou de digitar. O NFD separa a letra do sinal e resolve
 * todas -- inclusive o cedilha, que decomposto e um "c" mais um sinal.
 */
function letraBase(caractere: string): string {
  return caractere.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function larguraDoCaractere(caractere: string, negrito: boolean): number {
  // `|| caractere` cobre o sinal combinante solto, que decompoe para vazio.
  const base = letraBase(caractere) || caractere;
  const codigo = base.charCodeAt(0);
  const tabela = negrito ? LARGURAS_NEGRITO : LARGURAS_NORMAL;
  // Fora da faixa medida, cobra o mesmo que um "n" -- e o que ele vai virar.
  return tabela[codigo - 32] ?? (negrito ? 611 : 556);
}

/** Largura de um texto, em pontos, no tamanho pedido. */
export function larguraTexto(texto: string, tamanho: number, negrito = false): number {
  let milesimos = 0;
  for (const caractere of texto) milesimos += larguraDoCaractere(caractere, negrito);
  return (milesimos * tamanho) / 1000;
}

/**
 * Corta o texto no limite de largura, terminando em reticencias.
 *
 * Existe porque nome de produto nao tem tamanho maximo e a coluna tem. Sem
 * isto o nome invade a coluna de quantidade e as duas viram uma so.
 */
export function truncarTexto(
  texto: string,
  larguraMaxima: number,
  tamanho: number,
  negrito = false,
): string {
  if (larguraTexto(texto, tamanho, negrito) <= larguraMaxima) return texto;

  const reticencias = "...";
  const sobra = larguraMaxima - larguraTexto(reticencias, tamanho, negrito);
  let acumulado = 0;
  let corte = "";

  for (const caractere of texto) {
    const largura = (larguraDoCaractere(caractere, negrito) * tamanho) / 1000;
    if (acumulado + largura > sobra) break;
    acumulado += largura;
    corte += caractere;
  }

  return corte.trimEnd() + reticencias;
}

/** Quebra o texto em linhas que cabem na largura. Quebra por palavra. */
export function quebrarTexto(
  texto: string,
  larguraMaxima: number,
  tamanho: number,
  negrito = false,
): string[] {
  const linhas: string[] = [];
  let atual = "";

  for (const palavra of texto.split(/\s+/).filter(Boolean)) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (larguraTexto(tentativa, tamanho, negrito) <= larguraMaxima) {
      atual = tentativa;
      continue;
    }
    if (atual) linhas.push(atual);
    // Palavra sozinha maior que a linha: corta, senao ela estoura a margem.
    atual = larguraTexto(palavra, tamanho, negrito) > larguraMaxima
      ? truncarTexto(palavra, larguraMaxima, tamanho, negrito)
      : palavra;
  }

  if (atual) linhas.push(atual);
  return linhas;
}

// ---------------------------------------------------------------------------
// Codificacao
// ---------------------------------------------------------------------------

/**
 * Texto -> bytes WinAnsiEncoding.
 *
 * As fontes base do PDF nao carregam unicode. WinAnsi cobre o portugues
 * inteiro (as acentuadas vivem em 0xC0-0xFF, iguais ao latin-1), e o resto vira
 * a letra sem acento ou "?" -- explicito, em vez de um caractere invisivel que
 * desloca o texto.
 */
export function paraWinAnsi(texto: string): string {
  let saida = "";

  for (const caractere of texto) {
    const codigo = caractere.codePointAt(0) ?? 63;

    if (codigo >= 32 && codigo <= 126) {
      saida += caractere;
      continue;
    }
    // 0xA0-0xFF sao identicos em WinAnsi e latin-1.
    if (codigo >= 0xa0 && codigo <= 0xff) {
      saida += caractere;
      continue;
    }

    // Pontuacao tipografica que o Word e o celular inserem sozinhos.
    const especial = PONTUACAO_WINANSI[caractere];
    if (especial !== undefined) {
      saida += especial;
      continue;
    }

    /*
     * Fora do WinAnsi, a letra base ainda diz alguma coisa -- mas SO se ela
     * mesma couber em WinAnsi.
     *
     * Nem todo caractere decompoe: o "d" cortado (U+0111) tem o traco embutido
     * no glifo, nao como sinal combinante, entao a decomposicao devolve ele
     * proprio. Sem esta conferencia ele seguia adiante e virava o byte 0x11
     * dentro do fluxo do PDF -- um caractere de controle no meio do texto.
     */
    const base = letraBase(caractere);
    const codigoBase = base.codePointAt(0) ?? 0;
    const cabeEmWinAnsi =
      base.length > 0 &&
      ((codigoBase >= 32 && codigoBase <= 126) || (codigoBase >= 0xa0 && codigoBase <= 0xff));

    saida += cabeEmWinAnsi ? base : "?";
  }

  return saida;
}

const PONTUACAO_WINANSI: Record<string, string> = {
  "‘": "'", "’": "'", "“": '"', "”": '"',
  "–": "-", "—": "-", "…": "...", " ": " ",
  "\t": " ", "\n": " ", "\r": "",
};

/** Escapa o que quebra uma string literal de PDF: parenteses e barra. */
function escaparString(texto: string): string {
  return texto.replace(/[\\()]/g, (c) => `\\${c}`);
}

/** Numero para o fluxo. Tres casas bastam para papel e evitam 1e-7. */
function n(valor: number): string {
  return Number.isFinite(valor) ? valor.toFixed(3).replace(/\.?0+$/, "") || "0" : "0";
}

// ---------------------------------------------------------------------------
// Fluxo de conteudo
// ---------------------------------------------------------------------------

function fluxoDaPagina(desenhos: Desenho[], pagina: TamanhoPagina): string {
  // Y do PDF sobe a partir da base. A API desce a partir do topo.
  const paraPdf = (y: number) => pagina.altura - y;
  const partes: string[] = [];

  for (const d of desenhos) {
    switch (d.tipo) {
      case "texto": {
        if (d.texto === "") break;
        const conteudo = paraWinAnsi(d.texto);
        const largura = larguraTexto(d.texto, d.tamanho, d.negrito ?? false);
        const x =
          d.alinhamento === "direita"
            ? d.x - largura
            : d.alinhamento === "centro"
              ? d.x - largura / 2
              : d.x;

        partes.push(
          `BT /${d.negrito ? "F2" : "F1"} ${n(d.tamanho)} Tf ${n(d.cor ?? 0)} g ` +
            `${n(x)} ${n(paraPdf(d.y))} Td (${escaparString(conteudo)}) Tj ET`,
        );
        break;
      }

      case "linha": {
        partes.push(
          `${n(d.espessura ?? 0.6)} w ${n(d.cor ?? 0.7)} G ` +
            `${n(d.x1)} ${n(paraPdf(d.y1))} m ${n(d.x2)} ${n(paraPdf(d.y2))} l S`,
        );
        break;
      }

      case "retangulo": {
        // No PDF o retangulo nasce do canto inferior esquerdo.
        const base = `${n(d.x)} ${n(paraPdf(d.y + d.altura))} ${n(d.largura)} ${n(d.altura)} re`;

        if (d.preenchimento !== undefined && d.contorno !== undefined) {
          partes.push(`${n(d.preenchimento)} g ${n(d.contorno)} G ${n(d.espessura ?? 0.6)} w ${base} B`);
        } else if (d.preenchimento !== undefined) {
          partes.push(`${n(d.preenchimento)} g ${base} f`);
        } else {
          partes.push(`${n(d.contorno ?? 0.7)} G ${n(d.espessura ?? 0.6)} w ${base} S`);
        }
        break;
      }

      case "traco": {
        // Menos de dois pontos nao e traco -- e um clique sem arrasto.
        if (d.pontos.length < 4) break;

        // `1 J 1 j` = ponta e junta arredondadas. Sem isso a assinatura sai
        // com cantos quadrados e sinais de caneta esferografica em cada curva.
        let caminho =
          `${n(d.espessura ?? 1.4)} w ${n(d.cor ?? 0.1)} G 1 J 1 j ` +
          `${n(d.pontos[0] ?? 0)} ${n(paraPdf(d.pontos[1] ?? 0))} m`;

        for (let i = 2; i + 1 < d.pontos.length; i += 2) {
          caminho += ` ${n(d.pontos[i] ?? 0)} ${n(paraPdf(d.pontos[i + 1] ?? 0))} l`;
        }

        partes.push(`${caminho} S`);
        break;
      }
    }
  }

  return partes.join("\n");
}

// ---------------------------------------------------------------------------
// Montagem do arquivo
// ---------------------------------------------------------------------------

export interface MetaPdf {
  titulo: string;
  autor: string;
  assunto?: string;
  /** Data de criacao. Recebida de fora para o PDF ser reproduzivel no teste. */
  criadoEm?: Date;
  tamanho?: TamanhoPagina;
}

/** `D:20260912142200Z`, o formato de data do PDF. */
function dataPdf(quando: Date): string {
  const dois = (v: number) => String(v).padStart(2, "0");
  return (
    `D:${quando.getUTCFullYear()}${dois(quando.getUTCMonth() + 1)}${dois(quando.getUTCDate())}` +
    `${dois(quando.getUTCHours())}${dois(quando.getUTCMinutes())}${dois(quando.getUTCSeconds())}Z`
  );
}

/**
 * Monta o arquivo PDF a partir das paginas desenhadas.
 *
 * Funcao PURA: as mesmas paginas e a mesma data produzem exatamente os mesmos
 * bytes. E o que permite o teste conferir o hash em vez de "abriu sem erro".
 */
export function montarPdf(paginas: Desenho[][], meta: MetaPdf): Buffer {
  const tamanho = meta.tamanho ?? A4_RETRATO;
  const folhas = paginas.length > 0 ? paginas : [[]];

  /*
   * Numeracao dos objetos, fixa:
   *   1 catalogo | 2 arvore de paginas | 3 Helvetica | 4 Helvetica-Bold
   *   5 metadados | 6+ duas entradas por pagina (a pagina e o fluxo dela)
   */
  const idDaPagina = (indice: number) => 6 + indice * 2;
  const idDoFluxo = (indice: number) => 7 + indice * 2;

  const objetos: string[] = [];

  objetos.push("<< /Type /Catalog /Pages 2 0 R >>");
  objetos.push(
    `<< /Type /Pages /Count ${folhas.length} ` +
      `/Kids [${folhas.map((_, i) => `${idDaPagina(i)} 0 R`).join(" ")}] >>`,
  );
  objetos.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  objetos.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  objetos.push(
    "<< " +
      `/Title (${escaparString(paraWinAnsi(meta.titulo))}) ` +
      `/Author (${escaparString(paraWinAnsi(meta.autor))}) ` +
      `/Subject (${escaparString(paraWinAnsi(meta.assunto ?? ""))}) ` +
      "/Producer (Painel Administrativo) " +
      "/Creator (Painel Administrativo) " +
      `/CreationDate (${dataPdf(meta.criadoEm ?? new Date())}) >>`,
  );

  for (const [indice, desenhos] of folhas.entries()) {
    objetos.push(
      "<< /Type /Page /Parent 2 0 R " +
        `/MediaBox [0 0 ${n(tamanho.largura)} ${n(tamanho.altura)}] ` +
        "/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> " +
        `/Contents ${idDoFluxo(indice)} 0 R >>`,
    );

    const fluxo = fluxoDaPagina(desenhos, tamanho);
    // O tamanho e em BYTES. Tudo aqui e latin-1, entao um caractere = um byte.
    objetos.push(`<< /Length ${Buffer.byteLength(fluxo, "latin1")} >>\nstream\n${fluxo}\nendstream`);
  }

  /*
   * Os quatro bytes acima de 127 na segunda linha sao convencao: e assim que
   * um leitor sabe que o arquivo e binario e nao deve passar por conversao de
   * fim de linha.
   */
  const cabecalho = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";

  let corpo = "";
  const deslocamentos: number[] = [];

  for (const [indice, conteudo] of objetos.entries()) {
    deslocamentos.push(cabecalho.length + corpo.length);
    corpo += `${indice + 1} 0 obj\n${conteudo}\nendobj\n`;
  }

  const inicioDaTabela = cabecalho.length + corpo.length;

  let tabela = `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const deslocamento of deslocamentos) {
    tabela += `${String(deslocamento).padStart(10, "0")} 00000 n \n`;
  }

  const rodape =
    `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R /Info 5 0 R >>\n` +
    `startxref\n${inicioDaTabela}\n%%EOF\n`;

  // latin-1 do inicio ao fim: e o que faz `.length` valer como deslocamento em
  // bytes na tabela xref. Com utf-8 os acentos ocupariam dois bytes e todos os
  // deslocamentos ficariam errados -- o PDF abre em alguns leitores e nao em
  // outros, que e o pior modo de falhar.
  return Buffer.from(cabecalho + corpo + tabela + rodape, "latin1");
}

/** SHA-256 em hexadecimal. Usado para carimbar o documento gerado. */
export function sha256(dado: Buffer | string): string {
  return createHash("sha256").update(dado).digest("hex");
}
