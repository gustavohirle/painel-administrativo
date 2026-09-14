import { describe, expect, it } from "vitest";

import {
  assinaturaTemTinta,
  desenharOrdem,
  FILTROS_DE_ORDENS_VAZIOS,
  filtrarOrdens,
  haFiltroAtivo,
  lerFiltrosDaUrl,
  normalizarBusca,
  type DonoDoProduto,
  gerarDocumento,
  hashDoConteudo,
  hashLegivel,
  normalizarTracos,
  novoToken,
  proximoNumero,
  resumirOrdens,
  tokenConfere,
} from "@/lib/ordens";
import { sha256 } from "@/lib/pdf";
import {
  unidadesDaOrdem,
  type AssinaturaOrdem,
  type OrdemFabricacao,
} from "@/types/ordemFabricacao";

const GERADO_EM = new Date("2026-09-12T15:00:00Z");

function assinatura(nome: string, parcial: Partial<AssinaturaOrdem> = {}): AssinaturaOrdem {
  return {
    nome,
    papel: "solicitante",
    tracos: [[0.1, 0.5, 0.4, 0.2, 0.7, 0.6, 0.9, 0.4]],
    assinadoEm: "2026-09-10T14:22:00.000Z",
    ip: "189.4.22.7",
    agente: "teste",
    ...parcial,
  };
}

function ordem(parcial: Partial<OrdemFabricacao> = {}): OrdemFabricacao {
  return {
    id: "ordem-1",
    numero: "OF-2026-0007",
    itens: [
      { chave: "1001:100101", nome: "Serum Vitamina C 30ml", sku: "VN-SER-30", quantidade: 2400 },
      { chave: "1002:100201", nome: "Tonico Facial 200ml", sku: "VN-TON-200", quantidade: 1200 },
    ],
    dataLancamento: "2026-10-12",
    observacao: "Lancamento da campanha de primavera.",
    situacao: "aguardando",
    solicitante: assinatura("Marina Alves"),
    aprovador: null,
    motivoRecusa: null,
    token: "t".repeat(43),
    criadoEm: "2026-09-10T14:22:00.000Z",
    fechadoEm: null,
    documento: null,
    ...parcial,
  };
}

function aprovada(): OrdemFabricacao {
  return ordem({
    situacao: "aprovada",
    aprovador: assinatura("Carlos Mendes", {
      papel: "aprovador",
      assinadoEm: "2026-09-10T19:40:00.000Z",
    }),
    fechadoEm: "2026-09-10T19:40:00.000Z",
  });
}

/** Todo texto desenhado numa pagina, para procurar sem abrir o PDF. */
function textos(paginas: ReturnType<typeof desenharOrdem>): string[] {
  return paginas.flatMap((pagina) =>
    pagina.filter((d) => d.tipo === "texto").map((d) => (d as { texto: string }).texto),
  );
}

// ---------------------------------------------------------------------------

describe("proximoNumero", () => {
  it("a primeira ordem do ano e a 0001", () => {
    expect(proximoNumero([], new Date("2026-03-01T12:00:00"))).toBe("OF-2026-0001");
  });

  it("segue o MAIOR numero usado, nao a contagem de ordens", () => {
    // Diferenca que importa: com uma ordem cancelada no meio, contar daria um
    // numero ja usado -- e dois documentos com o mesmo numero destroem a
    // serventia de ter numero.
    const existentes = [
      ordem({ numero: "OF-2026-0001" }),
      ordem({ numero: "OF-2026-0009", situacao: "cancelada" }),
    ];

    expect(proximoNumero(existentes, new Date("2026-03-01T12:00:00"))).toBe("OF-2026-0010");
  });

  it("ordem de outro ano nao conta", () => {
    const existentes = [ordem({ numero: "OF-2025-0042" })];
    expect(proximoNumero(existentes, new Date("2026-01-02T12:00:00"))).toBe("OF-2026-0001");
  });
});

describe("novoToken e tokenConfere", () => {
  it("o token tem 256 bits e nao se repete", () => {
    const a = novoToken();
    const b = novoToken();

    // 32 bytes em base64url dao 43 caracteres.
    expect(a).toHaveLength(43);
    expect(a).not.toBe(b);
  });

  it("aceita o token igual e recusa qualquer outro", () => {
    const token = novoToken();

    expect(tokenConfere(token, token)).toBe(true);
    expect(tokenConfere(token, novoToken())).toBe(false);
    expect(tokenConfere("", token)).toBe(false);
    expect(tokenConfere(token.slice(0, 42), token)).toBe(false);
  });
});

describe("normalizarTracos", () => {
  it("prende os pontos entre 0 e 1", () => {
    // Vem de formulario publico, sem login: um valor fora da faixa desenharia
    // fora da moldura no PDF.
    expect(normalizarTracos([[-5, 0.5, 9, 2]])).toEqual([[0, 0.5, 1, 1]]);
  });

  it("traco com valor invalido dentro e descartado INTEIRO", () => {
    /*
     * Nao basta pular o valor ruim. `Number(null)` vale zero, entao a versao
     * ingenua transformava o `null` numa coordenada valida e todos os pontos
     * seguintes trocavam de eixo: a assinatura saia embaralhada em vez de
     * faltar. Faltar e honesto; embaralhada parece assinatura de outra pessoa.
     */
    expect(normalizarTracos([[0.1, 0.2, null, 0.3, 0.4, 0.5]])).toEqual([]);
    expect(normalizarTracos([[0.1, 0.2, "0.3", 0.4]])).toEqual([]);

    // O traco bom ao lado sobrevive.
    expect(
      normalizarTracos([
        [0.1, 0.2, null, 0.4],
        [0.1, 0.2, 0.3, 0.4],
      ]),
    ).toEqual([[0.1, 0.2, 0.3, 0.4]]);
  });

  it("traco com menos de dois pontos e descartado", () => {
    // Um toque sem arrasto nao e assinatura.
    expect(normalizarTracos([[0.5, 0.5]])).toEqual([]);
  });

  it("coordenada solta no fim nao vira meio ponto", () => {
    expect(normalizarTracos([[0.1, 0.2, 0.3, 0.4, 0.5]])).toEqual([[0.1, 0.2, 0.3, 0.4]]);
  });

  it("limita o tamanho do desenho", () => {
    const enorme = Array.from({ length: 500 }, () => [0.1, 0.2, 0.3, 0.4]);
    expect(normalizarTracos(enorme).length).toBeLessThanOrEqual(200);

    const pontudo = [Array.from({ length: 5000 }, (_, i) => (i % 100) / 100)];
    expect(normalizarTracos(pontudo)[0]!.length).toBeLessThanOrEqual(1200);
  });

  it("entrada que nao e lista devolve lista vazia", () => {
    expect(normalizarTracos(null)).toEqual([]);
    expect(normalizarTracos("assinatura")).toEqual([]);
    expect(normalizarTracos([1, 2, 3])).toEqual([]);
  });

  it("arredonda para tres casas", () => {
    expect(normalizarTracos([[0.123456789, 0.5, 0.9, 0.987654321]])).toEqual([
      [0.123, 0.5, 0.9, 0.988],
    ]);
  });
});

describe("assinaturaTemTinta", () => {
  it("quadro vazio nao assina nada", () => {
    expect(assinaturaTemTinta([])).toBe(false);
    expect(assinaturaTemTinta([[0.1, 0.2]])).toBe(false);
  });

  it("um traco de verdade conta", () => {
    expect(assinaturaTemTinta([[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]])).toBe(true);
  });
});

describe("hashDoConteudo", () => {
  it("nao depende da ordem das chaves do objeto", () => {
    // O registro lido do banco tem as chaves noutra ordem que o recem-criado.
    // Com `JSON.stringify(ordem)` o hash mudaria sem o conteudo mudar.
    const invertido = Object.fromEntries(
      Object.entries(ordem()).reverse(),
    ) as unknown as OrdemFabricacao;

    expect(hashDoConteudo(invertido)).toBe(hashDoConteudo(ordem()));
  });

  it("muda quando a quantidade muda", () => {
    const original = ordem();
    const adulterada = ordem({
      itens: [{ ...original.itens[0]!, quantidade: 24000 }, original.itens[1]!],
    });

    expect(hashDoConteudo(adulterada)).not.toBe(hashDoConteudo(original));
  });

  it("muda quando entra a assinatura do aprovador", () => {
    expect(hashDoConteudo(aprovada())).not.toBe(hashDoConteudo(ordem()));
  });

  it("nao muda com o token nem com o id", () => {
    // Token e id sao encanamento; o documento nao fala deles, entao nao podem
    // alterar o hash impresso no rodape.
    expect(hashDoConteudo(ordem({ token: "outro", id: "outro" }))).toBe(
      hashDoConteudo(ordem()),
    );
  });

  it("hashLegivel entrega blocos de quatro", () => {
    expect(hashLegivel("a".repeat(64))).toBe("aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa");
  });
});

describe("desenharOrdem", () => {
  const opcoes = { demonstracao: false, geradoEm: GERADO_EM };

  it("o documento diz o numero, a data e cada item", () => {
    const escrito = textos(desenharOrdem(aprovada(), opcoes));

    expect(escrito).toContain("OF-2026-0007");
    expect(escrito).toContain("12/10/2026");
    expect(escrito).toContain("Serum Vitamina C 30ml");
    expect(escrito).toContain("2.400 un");
    expect(escrito).toContain("3.600 un"); // total
  });

  it("a data de lancamento nao anda um dia para tras", () => {
    // "2026-10-12" e data de calendario. Passar por `new Date()` produziria
    // meia-noite em UTC, que no Brasil ainda e dia 11.
    const escrito = textos(desenharOrdem(ordem({ dataLancamento: "2026-01-01" }), opcoes));
    expect(escrito).toContain("01/01/2026");
  });

  it("traz os dois nomes e as duas assinaturas quando esta aprovada", () => {
    const paginas = desenharOrdem(aprovada(), opcoes);
    const escrito = textos(paginas);

    expect(escrito).toContain("Marina Alves");
    expect(escrito).toContain("Carlos Mendes");

    const tracos = paginas.flat().filter((d) => d.tipo === "traco");
    expect(tracos).toHaveLength(2);
  });

  it("sem aprovador, a moldura fica vazia e declarada", () => {
    const paginas = desenharOrdem(ordem(), opcoes);

    expect(textos(paginas)).toContain("aguardando assinatura");
    expect(paginas.flat().filter((d) => d.tipo === "traco")).toHaveLength(1);
  });

  it("o hash do conteudo sai impresso no rodape", () => {
    const esperado = hashLegivel(hashDoConteudo(aprovada()));
    const rodape = textos(desenharOrdem(aprovada(), opcoes)).find((t) => t.includes(esperado));

    expect(rodape).toBeDefined();
  });

  it("em modo demonstracao a tarja aparece em todas as paginas", () => {
    const paginas = desenharOrdem(aprovada(), { demonstracao: true, geradoEm: GERADO_EM });

    for (const pagina of paginas) {
      const tarja = pagina.filter(
        (d) => d.tipo === "texto" && d.texto.includes("DEMONSTRA\u00c7\u00c3O"),
      );
      expect(tarja).toHaveLength(1);
    }
  });

  it("fora da demonstracao nao ha tarja nenhuma", () => {
    expect(textos(desenharOrdem(aprovada(), opcoes)).join(" ")).not.toContain("DEMONSTRA\u00c7\u00c3O");
  });

  it("nome de produto comprido e cortado, nao invade a coluna do numero", () => {
    const comprido = ordem({
      itens: [
        {
          chave: "1:1",
          nome: "Serum Facial Concentrado de Vitamina C Estabilizada 30ml Edicao Limitada",
          sku: "X",
          quantidade: 10,
        },
      ],
    });

    const escrito = textos(desenharOrdem(comprido, opcoes));
    expect(escrito.some((t) => t.endsWith("..."))).toBe(true);
  });

  it("vinte itens cabem, quebrando a pagina, e todas ganham rodape", () => {
    const muitos = ordem({
      itens: Array.from({ length: 20 }, (_, i) => ({
        chave: `${i}:1`,
        nome: `Produto ${i + 1}`,
        sku: `SKU-${i}`,
        quantidade: 100 + i,
      })),
    });

    const paginas = desenharOrdem(muitos, opcoes);
    const escrito = textos(paginas);

    // Nenhum item pode sumir na quebra.
    for (let i = 1; i <= 20; i++) expect(escrito).toContain(`Produto ${i}`);

    for (const [indice, pagina] of paginas.entries()) {
      const numeracao = pagina.filter(
        (d) => d.tipo === "texto" && d.texto === `P\u00e1gina ${indice + 1} de ${paginas.length}`,
      );
      expect(numeracao).toHaveLength(1);
    }
  });

  it("nada e desenhado abaixo da margem inferior", () => {
    // O corte silencioso e o defeito classico de PDF gerado a mao: o conteudo
    // existe, o leitor so nao mostra. Ver secao 5.14 do CLAUDE.md.
    const muitos = ordem({
      itens: Array.from({ length: 20 }, (_, i) => ({
        chave: `${i}:1`,
        nome: `Produto ${i + 1}`,
        sku: null,
        quantidade: 100,
      })),
    });

    for (const pagina of desenharOrdem(muitos, opcoes)) {
      for (const desenho of pagina) {
        if (desenho.tipo === "texto") expect(desenho.y).toBeLessThan(830);
      }
    }
  });

  it("o motivo da recusa entra no documento", () => {
    const recusada = ordem({
      situacao: "recusada",
      motivoRecusa: "Falta materia-prima ate o dia 30 (Carlos Mendes)",
      fechadoEm: "2026-09-11T10:00:00.000Z",
    });

    expect(textos(desenharOrdem(recusada, opcoes)).join(" ")).toContain("Falta materia-prima");
  });
});

describe("gerarDocumento", () => {
  it("produz um PDF de verdade, com o hash dos proprios bytes", () => {
    const documento = gerarDocumento(aprovada(), { demonstracao: false, geradoEm: GERADO_EM });
    const bytes = Buffer.from(documento.base64, "base64");

    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(documento.sha256).toBe(sha256(bytes));
    expect(documento.bytes).toBe(bytes.length);
  });

  it("o hash do conteudo e o mesmo que sai impresso", () => {
    const documento = gerarDocumento(aprovada(), { demonstracao: false, geradoEm: GERADO_EM });
    expect(documento.hashConteudo).toBe(hashDoConteudo(aprovada()));
  });

  it("mesma ordem e mesma data produzem bytes identicos", () => {
    // O documento e congelado: dois downloads tem que dar o mesmo arquivo.
    const a = gerarDocumento(aprovada(), { demonstracao: false, geradoEm: GERADO_EM });
    const b = gerarDocumento(aprovada(), { demonstracao: false, geradoEm: GERADO_EM });

    expect(a.sha256).toBe(b.sha256);
  });

  it("mudar um item muda os bytes", () => {
    const adulterada = { ...aprovada(), itens: [{ ...aprovada().itens[0]!, quantidade: 1 }] };

    const original = gerarDocumento(aprovada(), { demonstracao: false, geradoEm: GERADO_EM });
    const outra = gerarDocumento(adulterada, { demonstracao: false, geradoEm: GERADO_EM });

    expect(outra.sha256).not.toBe(original.sha256);
  });

  it("aguenta nome e observacao com acento", () => {
    const comAcento = {
      ...aprovada(),
      observacao: "Gravac\u00e3o dia 20 \u2014 lan\u00e7amento na regi\u00e3o Sul",
      solicitante: assinatura("Jos\u00e9 Ant\u00f4nio Gon\u00e7alves"),
    };

    const documento = gerarDocumento(comAcento, { demonstracao: false, geradoEm: GERADO_EM });
    const texto = Buffer.from(documento.base64, "base64").toString("latin1");

    expect(texto.startsWith("%PDF-")).toBe(true);
    expect(texto).toContain("Jos\u00e9 Ant\u00f4nio Gon\u00e7alves");
  });
});

describe("resumirOrdens", () => {
  const hoje = new Date("2026-09-12T12:00:00Z");

  it("conta o que esta em aberto e o volume que a fabrica ainda deve", () => {
    const lista = [
      ordem({ id: "a", dataLancamento: "2026-10-01" }),
      ordem({ id: "b", dataLancamento: "2026-10-05" }),
      { ...aprovada(), id: "c" },
      ordem({ id: "d", situacao: "cancelada" }),
    ];

    const resumo = resumirOrdens(lista, hoje);

    expect(resumo.total).toBe(4);
    expect(resumo.aguardando).toBe(2);
    expect(resumo.aprovadas).toBe(1);
    expect(resumo.unidadesEmAberto).toBe(3600 * 2);
  });

  it("ordem aberta com a data ja vencida entra em atrasadas", () => {
    const lista = [
      ordem({ id: "a", dataLancamento: "2026-09-01" }),
      ordem({ id: "b", dataLancamento: "2026-12-01" }),
      // Fechada nao atrasa: ja foi respondida.
      { ...aprovada(), id: "c", dataLancamento: "2026-01-01" },
    ];

    expect(resumirOrdens(lista, hoje).atrasadas).toBe(1);
  });

  it("lista vazia devolve zeros", () => {
    expect(resumirOrdens([], hoje)).toEqual({
      total: 0,
      aguardando: 0,
      aprovadas: 0,
      unidadesEmAberto: 0,
      atrasadas: 0,
    });
  });
});

describe("unidadesDaOrdem", () => {
  it("soma as quantidades de todos os itens", () => {
    expect(unidadesDaOrdem(ordem())).toBe(3600);
  });
});

// ---------------------------------------------------------------------------
// Filtro da lista
// ---------------------------------------------------------------------------

describe("normalizarBusca", () => {
  it("tira acento e caixa dos dois lados", () => {
    // Nome de produto da Nuvemshop vem acentuado; ninguem digita acento numa
    // caixa de busca. Sem normalizar os dois lados o filtro parece quebrado.
    expect(normalizarBusca("  S\u00e9rum M\u00e1scara  ")).toBe("serum mascara");
    expect(normalizarBusca("NUTRI\u00c7\u00c3O")).toBe("nutricao");
  });
});

describe("filtrarOrdens", () => {
  const DONOS = new Map<string, DonoDoProduto>([
    ["1001:100101", { id: "inf-1", nome: "Marina Alves", marca: "Verte Natural" }],
    ["1002:100201", { id: "inf-2", nome: "Bruno Sales", marca: "Aurora" }],
  ]);

  const lista = [
    ordem({
      id: "a",
      numero: "OF-2026-0001",
      itens: [
        { chave: "1001:100101", nome: "S\u00e9rum Vitamina C", sku: "VN-SER", quantidade: 10 },
      ],
      observacao: "Campanha de primavera",
    }),
    ordem({
      id: "b",
      numero: "OF-2026-0002",
      situacao: "aprovada",
      itens: [
        { chave: "1002:100201", nome: "Mascara Capilar", sku: "AUR-MSC", quantidade: 20 },
      ],
      solicitante: assinatura("Roberto Nunes"),
      observacao: null,
    }),
    ordem({
      id: "c",
      numero: "OF-2026-0003",
      // Pedido misto: um item de cada influencer.
      itens: [
        { chave: "1001:100101", nome: "S\u00e9rum Vitamina C", sku: "VN-SER", quantidade: 5 },
        { chave: "1002:100201", nome: "Mascara Capilar", sku: "AUR-MSC", quantidade: 5 },
      ],
      observacao: null,
    }),
  ];

  const so = (r: OrdemFabricacao[]) => r.map((o) => o.id);

  it("sem filtro devolve tudo, na mesma ordem", () => {
    expect(so(filtrarOrdens(lista, FILTROS_DE_ORDENS_VAZIOS, DONOS))).toEqual(["a", "b", "c"]);
  });

  it("acha pelo nome do produto, ignorando acento", () => {
    const r = filtrarOrdens(lista, { ...FILTROS_DE_ORDENS_VAZIOS, busca: "serum" }, DONOS);
    expect(so(r)).toEqual(["a", "c"]);
  });

  it("acha pelo SKU", () => {
    expect(so(filtrarOrdens(lista, { ...FILTROS_DE_ORDENS_VAZIOS, busca: "aur-msc" }, DONOS)))
      .toEqual(["b", "c"]);
  });

  it("acha pelo numero da ordem e por quem pediu", () => {
    expect(so(filtrarOrdens(lista, { ...FILTROS_DE_ORDENS_VAZIOS, busca: "0002" }, DONOS)))
      .toEqual(["b"]);
    expect(so(filtrarOrdens(lista, { ...FILTROS_DE_ORDENS_VAZIOS, busca: "roberto" }, DONOS)))
      .toEqual(["b"]);
  });

  it("a busca livre tambem acha pelo nome do influencer e pela marca", () => {
    // Quem digita "Aurora" quer as ordens da Aurora, sem precisar descobrir
    // que existe um seletor separado para isso.
    expect(so(filtrarOrdens(lista, { ...FILTROS_DE_ORDENS_VAZIOS, busca: "aurora" }, DONOS)))
      .toEqual(["b", "c"]);
    expect(so(filtrarOrdens(lista, { ...FILTROS_DE_ORDENS_VAZIOS, busca: "marina" }, DONOS)))
      .toEqual(["a", "c"]);
  });

  it("acha na observacao", () => {
    expect(so(filtrarOrdens(lista, { ...FILTROS_DE_ORDENS_VAZIOS, busca: "primavera" }, DONOS)))
      .toEqual(["a"]);
  });

  it("filtra por influencer, e pedido misto entra nos dois", () => {
    // A ordem "c" tem um item de cada: aparece filtrando por qualquer um dos
    // dois. Exigir que TODOS os itens fossem do influencer esconderia
    // justamente o pedido misto.
    expect(so(filtrarOrdens(lista, { ...FILTROS_DE_ORDENS_VAZIOS, influencerId: "inf-1" }, DONOS)))
      .toEqual(["a", "c"]);
    expect(so(filtrarOrdens(lista, { ...FILTROS_DE_ORDENS_VAZIOS, influencerId: "inf-2" }, DONOS)))
      .toEqual(["b", "c"]);
  });

  it("filtra por situacao", () => {
    expect(so(filtrarOrdens(lista, { ...FILTROS_DE_ORDENS_VAZIOS, situacao: "aprovada" }, DONOS)))
      .toEqual(["b"]);
  });

  it("os filtros se somam, nao se substituem", () => {
    const r = filtrarOrdens(
      lista,
      { busca: "serum", influencerId: "inf-2", situacao: null },
      DONOS,
    );
    // So a "c" tem Serum E pertence tambem ao inf-2.
    expect(so(r)).toEqual(["c"]);
  });

  it("produto sem influencer vinculado nao quebra o filtro", () => {
    const semDono = filtrarOrdens(lista, { ...FILTROS_DE_ORDENS_VAZIOS, influencerId: "inf-1" }, new Map());
    expect(semDono).toEqual([]);

    // E a busca livre continua funcionando sem o indice.
    expect(so(filtrarOrdens(lista, { ...FILTROS_DE_ORDENS_VAZIOS, busca: "serum" }, new Map())))
      .toEqual(["a", "c"]);
  });

  it("termo que nao existe devolve lista vazia, nao a lista inteira", () => {
    expect(filtrarOrdens(lista, { ...FILTROS_DE_ORDENS_VAZIOS, busca: "xyz" }, DONOS)).toEqual([]);
  });

  it("busca so com espacos e o mesmo que nao filtrar", () => {
    expect(so(filtrarOrdens(lista, { ...FILTROS_DE_ORDENS_VAZIOS, busca: "   " }, DONOS)))
      .toEqual(["a", "b", "c"]);
  });
});

describe("haFiltroAtivo", () => {
  it("distingue filtro vazio de filtro preenchido", () => {
    expect(haFiltroAtivo(FILTROS_DE_ORDENS_VAZIOS)).toBe(false);
    expect(haFiltroAtivo({ ...FILTROS_DE_ORDENS_VAZIOS, busca: "  " })).toBe(false);
    expect(haFiltroAtivo({ ...FILTROS_DE_ORDENS_VAZIOS, busca: "x" })).toBe(true);
    expect(haFiltroAtivo({ ...FILTROS_DE_ORDENS_VAZIOS, situacao: "aprovada" })).toBe(true);
  });
});

describe("lerFiltrosDaUrl", () => {
  it("nada na URL e o filtro vazio", () => {
    expect(lerFiltrosDaUrl({}, ["inf-1"])).toEqual(FILTROS_DE_ORDENS_VAZIOS);
  });

  it("le o que e valido", () => {
    expect(
      lerFiltrosDaUrl({ busca: "serum", influencer: "inf-1", situacao: "aprovada" }, ["inf-1"]),
    ).toEqual({ busca: "serum", influencerId: "inf-1", situacao: "aprovada" });
  });

  it("influencer que nao existe mais vira 'todos', nao lista vazia", () => {
    // Mesma regra de relatoriosUrl: nada da barra de endereco entra sem passar
    // por uma lista conhecida. Um id morto nao pode zerar a tela sem explicar.
    expect(lerFiltrosDaUrl({ influencer: "apagado" }, ["inf-1"]).influencerId).toBeNull();
  });

  it("situacao inventada e ignorada", () => {
    expect(lerFiltrosDaUrl({ situacao: "entregue" }, []).situacao).toBeNull();
  });

  it("busca gigante e cortada", () => {
    expect(lerFiltrosDaUrl({ busca: "a".repeat(500) }, []).busca).toHaveLength(120);
  });
});
