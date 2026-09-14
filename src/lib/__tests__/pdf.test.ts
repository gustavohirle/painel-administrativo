import { describe, expect, it } from "vitest";

import {
  A4_RETRATO,
  larguraTexto,
  montarPdf,
  paraWinAnsi,
  quebrarTexto,
  sha256,
  truncarTexto,
  type Desenho,
} from "@/lib/pdf";

/**
 * Confere a tabela xref byte a byte.
 *
 * E o teste que importa neste arquivo. Um PDF com deslocamento errado abre em
 * alguns leitores e nao em outros -- o pior jeito de falhar, porque passa na
 * maquina de quem escreveu e quebra na de quem recebeu. A armadilha concreta:
 * escrever o arquivo em utf-8 faria cada acento ocupar dois bytes e deslocaria
 * todos os objetos depois dele.
 */
function conferirTabelaXref(pdf: Buffer): { objetos: number; apontamCerto: boolean } {
  const texto = pdf.toString("latin1");

  const inicioDeclarado = Number(
    texto.slice(texto.lastIndexOf("startxref")).split("\n")[1]?.trim(),
  );
  expect(texto.slice(inicioDeclarado, inicioDeclarado + 4)).toBe("xref");

  const cabecalho = texto.slice(inicioDeclarado).split("\n")[1] ?? "";
  const total = Number(cabecalho.split(" ")[1]);

  /*
   * As linhas da secao sao: "xref", "0 N", a entrada do objeto LIVRE, e so
   * entao os objetos de verdade -- por isso o corte comeca em 3. Comecar em 2
   * compara a entrada livre com o objeto 1 e acusa erro onde nao ha.
   */
  const entradas = texto
    .slice(inicioDeclarado)
    .split("\n")
    .slice(3, 3 + total - 1);

  const apontamCerto = entradas.every((entrada, indice) => {
    const deslocamento = Number(entrada.slice(0, 10));
    return texto.startsWith(`${indice + 1} 0 obj`, deslocamento);
  });

  return { objetos: total - 1, apontamCerto };
}

/** Todo `/Length` tem que bater com o tamanho real do fluxo que ele anuncia. */
function conferirTamanhoDosFluxos(pdf: Buffer): boolean {
  const texto = pdf.toString("latin1");
  const padrao = /<< \/Length (\d+) >>\nstream\n/g;

  let achado: RegExpExecArray | null;
  while ((achado = padrao.exec(texto)) !== null) {
    const declarado = Number(achado[1]);
    const inicio = achado.index + achado[0].length;
    if (texto.slice(inicio + declarado, inicio + declarado + 10) !== "\nendstream") {
      return false;
    }
  }
  return true;
}

const META = { titulo: "Teste", autor: "Painel", criadoEm: new Date("2026-09-12T12:00:00Z") };

const UMA_PAGINA: Desenho[] = [
  { tipo: "texto", x: 48, y: 60, texto: "ORDEM DE FABRICACAO", tamanho: 17, negrito: true },
  { tipo: "linha", x1: 48, y1: 72, x2: 547, y2: 72 },
  { tipo: "retangulo", x: 48, y: 100, largura: 200, altura: 66, contorno: 0.7 },
  { tipo: "traco", pontos: [50, 120, 80, 140, 110, 118, 140, 150], espessura: 1.3 },
];

describe("larguraTexto", () => {
  it("texto vazio nao ocupa espaco", () => {
    expect(larguraTexto("", 10)).toBe(0);
  });

  it("usa as larguras reais da Helvetica, nao uma media", () => {
    // Em Helvetica o "i" tem 222 milesimos e o "m" tem 833. Uma aproximacao
    // por largura media daria o mesmo valor para os dois -- e e justamente
    // isso que desalinha numero em coluna a direita.
    expect(larguraTexto("i", 10)).toBeCloseTo(2.22, 4);
    expect(larguraTexto("m", 10)).toBeCloseTo(8.33, 4);
  });

  it("negrito e mais largo que o normal na mesma palavra", () => {
    expect(larguraTexto("Fabricacao", 10, true)).toBeGreaterThan(
      larguraTexto("Fabricacao", 10, false),
    );
  });

  it("acentuada mede o mesmo que a letra base", () => {
    // Na Helvetica isso e exato, e e o que permite medir texto em portugues
    // sem carregar a tabela de larguras dos 96 codigos acentuados.
    expect(larguraTexto("Jose", 10)).toBeCloseTo(larguraTexto("Jos\u00e9", 10), 6);
  });

  it("escala linear com o tamanho da fonte", () => {
    expect(larguraTexto("Marina Alves", 20)).toBeCloseTo(
      larguraTexto("Marina Alves", 10) * 2,
      6,
    );
  });
});

describe("truncarTexto", () => {
  it("nao mexe no que ja cabe", () => {
    expect(truncarTexto("Serum", 200, 10)).toBe("Serum");
  });

  it("corta e devolve algo que cabe de verdade", () => {
    const nome = "Serum Facial Vitamina C 30ml Edicao Limitada de Primavera";
    const cortado = truncarTexto(nome, 100, 10);

    expect(cortado.endsWith("...")).toBe(true);
    expect(larguraTexto(cortado, 10)).toBeLessThanOrEqual(100);
  });
});

describe("quebrarTexto", () => {
  it("nenhuma linha passa da largura pedida", () => {
    const texto =
      "Lancamento da campanha de primavera. O influencer grava no dia 20 e precisa do produto na mao antes disso.";

    for (const linha of quebrarTexto(texto, 180, 10)) {
      expect(larguraTexto(linha, 10)).toBeLessThanOrEqual(180);
    }
  });

  it("palavra sozinha maior que a linha e cortada, nao estoura a margem", () => {
    const [linha] = quebrarTexto("A".repeat(200), 90, 10);
    expect(larguraTexto(linha ?? "", 10)).toBeLessThanOrEqual(90);
  });
});

describe("paraWinAnsi", () => {
  it("mantem o portugues inteiro", () => {
    expect(paraWinAnsi("Jos\u00e9 Ant\u00f4nio Gon\u00e7alves")).toBe(
      "Jos\u00e9 Ant\u00f4nio Gon\u00e7alves",
    );
  });

  it("troca a pontuacao tipografica que o celular insere sozinho", () => {
    expect(paraWinAnsi("\u201curgente\u201d \u2014 hoje")).toBe('"urgente" - hoje');
  });

  it("o que nao existe em WinAnsi cai na letra base", () => {
    /*
     * Ganho da decomposicao Unicode: o "s" com caron nao existe em WinAnsi,
     * mas decompoe para "s" + sinal, entao sobra o "s". A tabela escrita a mao
     * que havia aqui antes nao listava esse caractere e devolvia "?" --
     * apagava a letra em vez de aproxima-la.
     */
    expect(paraWinAnsi("\u0161")).toBe("s");
    expect(paraWinAnsi("\u0111")).toBe("?"); // "d" cortado: nao decompoe

    // Emoji nao tem letra base nenhuma.
    expect(paraWinAnsi("caf\u00e9 \u{1F600}")).toBe("caf\u00e9 ?");
  });
});

describe("montarPdf", () => {
  it("gera um arquivo com cabecalho e fim de arquivo", () => {
    const pdf = montarPdf([UMA_PAGINA], META);

    expect(pdf.subarray(0, 8).toString("latin1")).toBe("%PDF-1.4");
    expect(pdf.subarray(-6).toString("latin1")).toBe("%%EOF\n");
  });

  it("a tabela xref aponta para os objetos certos", () => {
    const { objetos, apontamCerto } = conferirTabelaXref(montarPdf([UMA_PAGINA], META));

    // 5 fixos (catalogo, paginas, duas fontes, metadados) + 2 por pagina.
    expect(objetos).toBe(7);
    expect(apontamCerto).toBe(true);
  });

  it("a xref continua certa com acento no texto", () => {
    // O caso que quebraria em utf-8: cada acento ocuparia dois bytes e todos
    // os deslocamentos depois dele ficariam adiantados.
    const comAcento: Desenho[] = [
      {
        tipo: "texto",
        x: 48,
        y: 60,
        texto: "Jos\u00e9 Ant\u00f4nio Gon\u00e7alves de Assun\u00e7\u00e3o",
        tamanho: 12,
      },
    ];

    expect(conferirTabelaXref(montarPdf([comAcento], META)).apontamCerto).toBe(true);
  });

  it("cada /Length bate com o fluxo que ele anuncia", () => {
    expect(conferirTamanhoDosFluxos(montarPdf([UMA_PAGINA, UMA_PAGINA], META))).toBe(true);
  });

  it("uma pagina a mais vira dois objetos a mais", () => {
    const uma = conferirTabelaXref(montarPdf([UMA_PAGINA], META)).objetos;
    const duas = conferirTabelaXref(montarPdf([UMA_PAGINA, UMA_PAGINA], META)).objetos;

    expect(duas - uma).toBe(2);
    expect(montarPdf([UMA_PAGINA, UMA_PAGINA], META).toString("latin1")).toContain(
      "/Count 2",
    );
  });

  it("parentese no texto nao quebra a string do PDF", () => {
    // `(` e `)` delimitam string em PDF. Sem escapar, um nome de produto com
    // parentese fecha a string no meio e o resto do fluxo vira lixo.
    const pdf = montarPdf(
      [[{ tipo: "texto", x: 48, y: 60, texto: "Kit Barba (2 pecas) \\ novo", tamanho: 10 }]],
      META,
    );

    expect(pdf.toString("latin1")).toContain("(Kit Barba \\(2 pecas\\) \\\\ novo)");
    expect(conferirTabelaXref(pdf).apontamCerto).toBe(true);
  });

  it("mesma entrada, mesmos bytes", () => {
    // E o que permite testar o hash do documento em vez de so 'nao explodiu'.
    expect(sha256(montarPdf([UMA_PAGINA], META))).toBe(
      sha256(montarPdf([UMA_PAGINA], META)),
    );
  });

  it("o tamanho da folha e A4 em pe", () => {
    expect(montarPdf([UMA_PAGINA], META).toString("latin1")).toContain(
      `/MediaBox [0 0 ${A4_RETRATO.largura} ${A4_RETRATO.altura}]`,
    );
  });

  it("traco com menos de dois pontos nao vira caminho", () => {
    // Um toque sem arrasto: nao ha o que desenhar, e um `m` sozinho seguido de
    // `S` deixa o caminho aberto no fluxo.
    const pdf = montarPdf([[{ tipo: "traco", pontos: [10, 10] }]], META);
    expect(pdf.toString("latin1")).not.toContain(" m ");
  });

  it("sem pagina nenhuma ainda produz um PDF valido", () => {
    const pdf = montarPdf([], META);
    expect(conferirTabelaXref(pdf).apontamCerto).toBe(true);
    expect(pdf.toString("latin1")).toContain("/Count 1");
  });
});
