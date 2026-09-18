import { describe, expect, it } from "vitest";

import {
  assinaturaTemTinta,
  desenharOrdem,
  gerarDocumento,
  hashDoConteudo,
  hashLegivel,
  normalizarBusca,
  normalizarTracos,
  proximoNumero,
  resumirOrdens,
} from "@/lib/ordens";
import {
  unidadesDaOrdem,
  type AssinaturaOrdem,
  type EtapaOrdem,
  type ItemOrdem,
  type OrdemFabricacao,
  type PassoDaOrdem,
} from "@/types/ordemFabricacao";

// ---------------------------------------------------------------------------
// Fabricas
// ---------------------------------------------------------------------------

function assinatura(nome: string, parcial: Partial<AssinaturaOrdem> = {}): AssinaturaOrdem {
  return {
    nome,
    tracos: [[0.1, 0.5, 0.4, 0.2, 0.7, 0.8, 0.9, 0.3]],
    assinadoEm: "2026-09-10T14:22:00.000-03:00",
    ip: "189.4.22.7",
    agente: "teste",
    ...parcial,
  };
}

function passo(etapa: EtapaOrdem, parcial: Partial<PassoDaOrdem> = {}): PassoDaOrdem {
  return {
    etapa,
    usuarioId: "u-1",
    assinatura: assinatura(etapa === "abertura" ? "Marina Alves" : "Carlos Mendes"),
    observacao: null,
    ...parcial,
  };
}

const ITENS: ItemOrdem[] = [
  { chave: "1:11", nome: "Sérum Vitamina C", sku: "SER-30", quantidade: 2400 },
  { chave: "2:22", nome: "Tônico Facial", sku: "TON-200", quantidade: 1200 },
];

function ordem(parcial: Partial<OrdemFabricacao> = {}): OrdemFabricacao {
  return {
    id: "ordem-1",
    numero: "OF-2026-0007",
    itens: ITENS,
    dataLancamento: "2026-10-12",
    observacao: "Campanha de primavera.",
    situacao: "andamento",
    etapaAtual: "conferencia",
    passos: [passo("abertura")],
    abertaPor: "u-dono",
    motivoCancelamento: null,
    criadoEm: "2026-09-10T14:22:00.000-03:00",
    fechadoEm: null,
    documento: null,
    ...parcial,
  };
}

/** Uma ordem que percorreu o processo inteiro. */
function ordemConcluida(): OrdemFabricacao {
  const quantidades = { "1:11": 2400, "2:22": 1150 };
  return ordem({
    situacao: "concluida",
    etapaAtual: null,
    fechadoEm: "2026-10-01T10:00:00.000-03:00",
    passos: [
      passo("abertura"),
      passo("conferencia", {
        conferencia: {
          respostas: {
            embalagem: true,
            tampa: true,
            tampaCorreta: true,
            caixa: true,
            materiaPrima: true,
          },
          cumpreAData: true,
          dataPossivel: null,
        },
      }),
      passo("fabricacao", {
        fabricacao: { dataFabricacao: "2026-09-28", quantidades },
      }),
      passo("contagem", { contagem: { dataContagem: "2026-09-29", quantidades } }),
      passo("envio", { envio: { dataEnvio: "2026-09-30", referencia: "NF 4471" } }),
      passo("recebimento", {
        recebimento: { dataRecebimento: "2026-10-01", quantidades },
      }),
    ],
  });
}

const OPCOES = { demonstracao: false, geradoEm: new Date("2026-09-10T18:00:00.000Z") };

/** Todo o texto desenhado, para procurar sem abrir o PDF. */
const textos = (paginas: ReturnType<typeof desenharOrdem>) =>
  paginas.flat().flatMap((d) => (d.tipo === "texto" ? [d.texto] : []));

// ---------------------------------------------------------------------------

describe("proximoNumero", () => {
  it("a primeira ordem do ano e a 0001", () => {
    expect(proximoNumero([], new Date("2026-03-04T12:00:00Z"))).toBe("OF-2026-0001");
  });

  it("segue o MAIOR numero usado, nao a contagem de ordens", () => {
    // Cancelar uma ordem nao pode fazer a proxima reaproveitar o numero dela.
    const existentes = [
      ordem({ numero: "OF-2026-0001" }),
      ordem({ numero: "OF-2026-0009" }),
    ];
    expect(proximoNumero(existentes, new Date("2026-03-04T12:00:00Z"))).toBe("OF-2026-0010");
  });

  it("ordem de outro ano nao conta", () => {
    const existentes = [ordem({ numero: "OF-2025-0042" })];
    expect(proximoNumero(existentes, new Date("2026-03-04T12:00:00Z"))).toBe("OF-2026-0001");
  });
});

describe("normalizarTracos", () => {
  it("prende os pontos entre 0 e 1", () => {
    expect(normalizarTracos([[-3, 0.5, 9, 0.25]])).toEqual([[0, 0.5, 1, 0.25]]);
  });

  it("traco com valor invalido dentro e descartado INTEIRO", () => {
    /*
     * Nao basta pular o valor ruim: `Number(null)` e `Number("")` valem ZERO,
     * entao um `null` no meio viraria coordenada valida e todos os pontos
     * seguintes trocariam de eixo. Faltar e honesto; embaralhada parece
     * assinatura de outra pessoa.
     */
    expect(normalizarTracos([[0.1, 0.2, null, 0.4, 0.5, 0.6]])).toEqual([]);
    expect(normalizarTracos([[0.1, 0.2, "0.3", 0.4]])).toEqual([]);
    expect(normalizarTracos([[0.1, 0.2, Number.NaN, 0.4]])).toEqual([]);
  });

  it("traco com menos de dois pontos e descartado", () => {
    expect(normalizarTracos([[0.1, 0.2]])).toEqual([]);
  });

  it("coordenada solta no fim nao vira meio ponto", () => {
    expect(normalizarTracos([[0.1, 0.2, 0.3, 0.4, 0.5]])).toEqual([[0.1, 0.2, 0.3, 0.4]]);
  });

  it("entrada que nao e lista devolve lista vazia", () => {
    expect(normalizarTracos("x")).toEqual([]);
    expect(normalizarTracos(null)).toEqual([]);
  });

  it("arredonda para tres casas", () => {
    expect(normalizarTracos([[0.123456, 0.987654, 0.5, 0.5]])).toEqual([
      [0.123, 0.988, 0.5, 0.5],
    ]);
  });
});

describe("assinaturaTemTinta", () => {
  it("quadro vazio nao assina nada", () => {
    expect(assinaturaTemTinta([])).toBe(false);
    expect(assinaturaTemTinta([[0, 0, 1, 1]])).toBe(false);
  });

  it("um traco de verdade conta", () => {
    expect(assinaturaTemTinta([[0, 0, 0.2, 0.2, 0.4, 0.4, 0.6, 0.6]])).toBe(true);
  });
});

describe("hashDoConteudo", () => {
  it("nao depende da ordem das chaves do objeto", () => {
    const a = ordem();
    const b = { ...ordem() };
    expect(hashDoConteudo(a)).toBe(hashDoConteudo(b));
  });

  it("muda quando a quantidade muda", () => {
    const outra = ordem({ itens: [{ ...ITENS[0]!, quantidade: 2401 }, ITENS[1]!] });
    expect(hashDoConteudo(outra)).not.toBe(hashDoConteudo(ordem()));
  });

  it("muda quando entra mais um passo assinado", () => {
    // O hash cobre TODOS os passos: um que cobrisse so o pedido continuaria
    // valendo depois de alguem trocar quem assinou a fabricacao.
    const comConferencia = ordem({ passos: [passo("abertura"), passo("conferencia")] });
    expect(hashDoConteudo(comConferencia)).not.toBe(hashDoConteudo(ordem()));
  });

  it("muda quando a quantidade FABRICADA muda", () => {
    const a = ordemConcluida();
    const b = ordemConcluida();
    b.passos[2]!.fabricacao = { dataFabricacao: "2026-09-28", quantidades: { "1:11": 1, "2:22": 1 } };
    expect(hashDoConteudo(a)).not.toBe(hashDoConteudo(b));
  });

  it("nao muda com o id", () => {
    expect(hashDoConteudo(ordem({ id: "outro" }))).toBe(hashDoConteudo(ordem()));
  });

  it("hashLegivel entrega blocos de quatro", () => {
    expect(hashLegivel("a91f3c0244556677")).toBe("a91f 3c02 4455 6677");
  });
});

describe("desenharOrdem", () => {
  it("o documento diz o numero, a data e cada item", () => {
    const escrito = textos(desenharOrdem(ordem(), OPCOES));
    expect(escrito).toContain("OF-2026-0007");
    expect(escrito.some((t) => t.includes("Sérum Vitamina C"))).toBe(true);
    expect(escrito.some((t) => t.includes("Tônico Facial"))).toBe(true);
  });

  it("a data de lancamento nao anda um dia para tras", () => {
    // "2026-10-12" com `new Date` viraria meia-noite UTC, que no Brasil ainda
    // e dia 11 -- por isso ela passa por `dataCalendario`.
    expect(textos(desenharOrdem(ordem(), OPCOES))).toContain("12/10/2026");
  });

  it("traz uma moldura por etapa, com quem assinou cada uma", () => {
    const escrito = textos(desenharOrdem(ordemConcluida(), OPCOES));
    expect(escrito).toContain("Marina Alves");
    expect(escrito).toContain("Carlos Mendes");
    expect(escrito.some((t) => t.includes("Conferência de insumos"))).toBe(true);
    expect(escrito.some((t) => t.includes("Recebimento na Criar"))).toBe(true);
  });

  it("etapa nao cumprida aparece declarada, e nao em branco", () => {
    const escrito = textos(desenharOrdem(ordem(), OPCOES));
    expect(escrito.filter((t) => t === "não assinada").length).toBeGreaterThan(0);
  });

  it("mostra o pedido ao lado do fabricado e do recebido", () => {
    const escrito = textos(desenharOrdem(ordemConcluida(), OPCOES));
    expect(escrito).toContain("Pedido");
    expect(escrito).toContain("Fabricado");
    expect(escrito).toContain("Recebido");
    // 1.150 de 1.200: a diferenca tem que estar no papel.
    expect(escrito).toContain("1.150");
  });

  it("as respostas da conferencia saem no documento", () => {
    const escrito = textos(desenharOrdem(ordemConcluida(), OPCOES));
    expect(escrito.some((t) => t.includes("Tem embalagem?"))).toBe(true);
    expect(escrito).toContain("SIM");
  });

  it("o hash do conteudo sai impresso no rodape", () => {
    const hash = hashLegivel(hashDoConteudo(ordem()));
    expect(textos(desenharOrdem(ordem(), OPCOES)).some((t) => t.includes(hash))).toBe(true);
  });

  it("em modo demonstracao a tarja aparece em todas as paginas", () => {
    const paginas = desenharOrdem(ordemConcluida(), { ...OPCOES, demonstracao: true });
    for (const pagina of paginas) {
      expect(
        pagina.some((d) => d.tipo === "texto" && d.texto.includes("DEMONSTRAÇÃO")),
      ).toBe(true);
    }
  });

  it("fora da demonstracao nao ha tarja nenhuma", () => {
    const escrito = textos(desenharOrdem(ordem(), OPCOES));
    expect(escrito.some((t) => t.includes("DEMONSTRAÇÃO"))).toBe(false);
  });

  it("nome de produto comprido e cortado, nao invade a coluna do numero", () => {
    const comprido = ordem({
      itens: [{ chave: "1:11", nome: "Sérum ".repeat(40), sku: "X", quantidade: 10 }],
    });
    const linha = textos(desenharOrdem(comprido, OPCOES)).find((t) => t.startsWith("Sérum"));
    expect(linha!.length).toBeLessThan(80);
  });

  it("vinte itens cabem, quebrando a pagina, e todas ganham rodape", () => {
    const muitos = ordem({
      itens: Array.from({ length: 20 }, (_, i) => ({
        chave: `${i}:${i}`,
        nome: `Produto ${i}`,
        sku: `SKU-${i}`,
        quantidade: 100 + i,
      })),
    });
    const paginas = desenharOrdem(muitos, OPCOES);
    expect(paginas.length).toBeGreaterThan(1);
    for (const [indice, pagina] of paginas.entries()) {
      expect(
        pagina.some(
          (d) => d.tipo === "texto" && d.texto === `Página ${indice + 1} de ${paginas.length}`,
        ),
      ).toBe(true);
    }
  });

  it("o motivo do cancelamento entra no documento", () => {
    const cancelada = ordem({
      situacao: "cancelada",
      etapaAtual: null,
      motivoCancelamento: "A campanha saiu do ar.",
    });
    const escrito = textos(desenharOrdem(cancelada, OPCOES));
    expect(escrito.some((t) => t.includes("A campanha saiu do ar."))).toBe(true);
  });
});

describe("gerarDocumento", () => {
  it("produz um PDF de verdade, com o hash dos proprios bytes", () => {
    const doc = gerarDocumento(ordemConcluida(), OPCOES);
    const bytes = Buffer.from(doc.base64, "base64");

    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(doc.bytes).toBe(bytes.length);
    expect(doc.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("o hash do conteudo e o mesmo que sai impresso", () => {
    const ordemPronta = ordemConcluida();
    expect(gerarDocumento(ordemPronta, OPCOES).hashConteudo).toBe(hashDoConteudo(ordemPronta));
  });

  it("mesma ordem e mesma data produzem bytes identicos", () => {
    const a = gerarDocumento(ordemConcluida(), OPCOES);
    const b = gerarDocumento(ordemConcluida(), OPCOES);
    expect(a.sha256).toBe(b.sha256);
  });

  it("mudar um item muda os bytes", () => {
    const outra = ordemConcluida();
    outra.itens = [{ ...ITENS[0]!, quantidade: 1 }, ITENS[1]!];
    expect(gerarDocumento(outra, OPCOES).sha256).not.toBe(
      gerarDocumento(ordemConcluida(), OPCOES).sha256,
    );
  });

  it("aguenta nome e observacao com acento", () => {
    /*
     * O arquivo e latin-1 do inicio ao fim: escrever em utf-8 faria cada
     * acento virar dois bytes e todos os deslocamentos da tabela `xref`
     * ficariam errados depois dele.
     */
    const comAcento = ordemConcluida();
    comAcento.observacao = "Ação de lançamento — atenção à validação";
    const doc = gerarDocumento(comAcento, OPCOES);
    expect(Buffer.from(doc.base64, "base64").subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});

describe("resumirOrdens", () => {
  const hoje = "2026-09-18";

  it("conta o que esta em aberto e o volume que a fabrica ainda deve", () => {
    const resumo = resumirOrdens(
      [ordem(), ordem({ id: "b", situacao: "revisao" }), ordemConcluida()],
      hoje,
    );

    expect(resumo.total).toBe(3);
    expect(resumo.emAndamento).toBe(1);
    expect(resumo.emRevisao).toBe(1);
    expect(resumo.concluidas).toBe(1);
    expect(resumo.unidadesEmAberto).toBe(unidadesDaOrdem(ordem()) * 2);
  });

  it("ordem aberta com a data ja vencida entra em atrasadas", () => {
    const vencida = ordem({ dataLancamento: "2026-09-01" });
    expect(resumirOrdens([vencida], hoje).atrasadas).toBe(1);
    // Concluida com data vencida NAO conta: ela ja fechou.
    expect(resumirOrdens([ordemConcluida()], hoje).atrasadas).toBe(0);
  });

  it("lista vazia devolve zeros", () => {
    const resumo = resumirOrdens([], hoje);
    expect(resumo.total).toBe(0);
    expect(resumo.unidadesEmAberto).toBe(0);
  });
});

describe("unidadesDaOrdem", () => {
  it("soma as quantidades de todos os itens", () => {
    expect(unidadesDaOrdem(ordem())).toBe(3600);
  });
});

describe("normalizarBusca", () => {
  it("tira acento e caixa dos dois lados", () => {
    expect(normalizarBusca("  Sérum VITAMINA  ")).toBe("serum vitamina");
  });
});
