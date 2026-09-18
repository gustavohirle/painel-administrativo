import { describe, expect, it } from "vitest";

import {
  aplicarPasso,
  cancelarOrdem,
  conferenciaAprova,
  diasAteOLancamento,
  estadoDaEtapa,
  montarFila,
  motivosDaConferencia,
  podeAssinar,
  podeCancelar,
  podeDecidirNaRevisao,
  problemaNasQuantidades,
  problemaNoPasso,
  retomarOrdem,
} from "@/lib/processoOrdem";
import type {
  AssinaturaOrdem,
  DadosConferencia,
  EtapaOrdem,
  ItemOrdem,
  OrdemFabricacao,
  PassoDaOrdem,
} from "@/types/ordemFabricacao";
import type { UsuarioPublico } from "@/types/usuario";

// ---------------------------------------------------------------------------
// Fabricas
// ---------------------------------------------------------------------------

const assinatura = (nome = "Quem Assinou"): AssinaturaOrdem => ({
  nome,
  tracos: [[0, 0, 0.5, 0.5, 1, 0.2]],
  assinadoEm: "2026-09-18T12:00:00.000-03:00",
  ip: "189.4.22.7",
  agente: "teste",
});

const itens: ItemOrdem[] = [
  { chave: "1:11", nome: "Sérum", sku: "A", quantidade: 500 },
  { chave: "2:22", nome: "Tônico", sku: "B", quantidade: 300 },
];

function ordem(parcial: Partial<OrdemFabricacao> = {}): OrdemFabricacao {
  return {
    id: "ordem-1",
    numero: "OF-2026-0001",
    itens,
    dataLancamento: "2026-10-10",
    observacao: null,
    situacao: "andamento",
    etapaAtual: "conferencia",
    passos: [
      { etapa: "abertura", usuarioId: "u-dono", assinatura: assinatura("Marina"), observacao: null },
    ],
    abertaPor: "u-dono",
    motivoCancelamento: null,
    criadoEm: "2026-09-15T10:00:00.000-03:00",
    fechadoEm: null,
    documento: null,
    ...parcial,
  };
}

const usuario = (parcial: Partial<UsuarioPublico> = {}): UsuarioPublico => ({
  id: "u-dono",
  nome: "Marina Alves",
  usuario: "dono",
  perfil: "dono",
  ativo: true,
  ...parcial,
});

const TODAS_SIM: DadosConferencia = {
  respostas: {
    embalagem: true,
    tampa: true,
    tampaCorreta: true,
    caixa: true,
    materiaPrima: true,
  },
  cumpreAData: true,
  dataPossivel: null,
};

const passo = (etapa: EtapaOrdem, extra: Partial<PassoDaOrdem> = {}): PassoDaOrdem => ({
  etapa,
  usuarioId: "u-1",
  assinatura: assinatura(),
  observacao: null,
  ...extra,
});

const quantidades = { "1:11": 500, "2:22": 300 };

// ---------------------------------------------------------------------------

describe("podeAssinar", () => {
  it("na fase de teste, quem esta logado assina a etapa atual", () => {
    // `TRAVAR_ETAPA_POR_PERFIL` esta desligado a pedido do dono: primeiro o
    // processo e experimentado de ponta a ponta, depois se trava por perfil.
    expect(podeAssinar(ordem(), usuario({ perfil: "estoque" }))).toBe(true);
  });

  it("ordem concluida nao aceita mais assinatura", () => {
    expect(podeAssinar(ordem({ situacao: "concluida", etapaAtual: null }), usuario())).toBe(false);
  });

  it("ordem em revisao nao anda por assinatura de etapa", () => {
    // Em revisao quem decide e o administrador, e por outro caminho.
    expect(podeAssinar(ordem({ situacao: "revisao" }), usuario())).toBe(false);
  });
});

describe("podeDecidirNaRevisao e podeCancelar", () => {
  it("so o administrador decide numa ordem que voltou", () => {
    const emRevisao = ordem({ situacao: "revisao" });
    expect(podeDecidirNaRevisao(emRevisao, usuario())).toBe(true);
    expect(podeDecidirNaRevisao(emRevisao, usuario({ perfil: "estoque" }))).toBe(false);
  });

  it("ordem concluida nao se cancela", () => {
    expect(podeCancelar(ordem({ situacao: "concluida" }), usuario())).toBe(false);
  });
});

describe("conferenciaAprova", () => {
  it("passa so com as cinco respostas sim E a data cumprida", () => {
    expect(conferenciaAprova(TODAS_SIM)).toBe(true);
  });

  it("uma resposta em falta reprova", () => {
    expect(
      conferenciaAprova({ ...TODAS_SIM, respostas: { ...TODAS_SIM.respostas, caixa: false } }),
    ).toBe(false);
  });

  it("nao cumprir a data reprova, mesmo com tudo em estoque", () => {
    expect(conferenciaAprova({ ...TODAS_SIM, cumpreAData: false })).toBe(false);
  });

  it("os motivos dizem o que falta, em portugues", () => {
    const motivos = motivosDaConferencia({
      ...TODAS_SIM,
      respostas: { ...TODAS_SIM.respostas, embalagem: false },
      cumpreAData: false,
      dataPossivel: "2026-11-01",
    });
    expect(motivos).toContain("Falta embalagem");
    expect(motivos.some((m) => m.includes("2026-11-01"))).toBe(true);
  });
});

describe("problemaNasQuantidades", () => {
  it("aceita zero: fabricar zero de um item e um resultado possivel", () => {
    expect(problemaNasQuantidades(ordem(), { "1:11": 0, "2:22": 300 })).toBeNull();
  });

  it("campo vazio (NaN) e recusado, e nao vira zero em silencio", () => {
    // Armadilha 8: `Number("")` vale ZERO. Se passasse, a tela registraria
    // "fabricou zero" sem ninguem ter dito isso.
    expect(problemaNasQuantidades(ordem(), { "1:11": Number.NaN, "2:22": 300 })).toContain("Sérum");
  });

  it("negativo e quebrado sao recusados", () => {
    expect(problemaNasQuantidades(ordem(), { "1:11": -1, "2:22": 300 })).not.toBeNull();
    expect(problemaNasQuantidades(ordem(), { "1:11": 1.5, "2:22": 300 })).not.toBeNull();
  });

  it("item que nao esta na ordem e recusado", () => {
    expect(problemaNasQuantidades(ordem(), { ...quantidades, "9:99": 10 })).not.toBeNull();
  });
});

describe("problemaNoPasso", () => {
  it("a fabricacao precisa da data e das quantidades", () => {
    expect(
      problemaNoPasso(ordem(), passo("fabricacao", { fabricacao: { dataFabricacao: "", quantidades } })),
    ).toContain("data");
  });

  it("reprovar por data sem dizer para quando nao passa", () => {
    const dados: DadosConferencia = { ...TODAS_SIM, cumpreAData: false, dataPossivel: null };
    expect(problemaNoPasso(ordem(), passo("conferencia", { conferencia: dados }))).toContain(
      "para quando",
    );
  });

  it("conferencia completa passa", () => {
    expect(problemaNoPasso(ordem(), passo("conferencia", { conferencia: TODAS_SIM }))).toBeNull();
  });
});

describe("aplicarPasso", () => {
  const agora = new Date("2026-09-18T15:00:00.000Z");

  it("a conferencia aprovada empurra para a fabricacao", () => {
    const r = aplicarPasso(ordem(), passo("conferencia", { conferencia: TODAS_SIM }), agora);

    expect(r.proxima).toBe("fabricacao");
    expect(r.ordem.etapaAtual).toBe("fabricacao");
    expect(r.ordem.situacao).toBe("andamento");
    expect(r.voltouParaRevisao).toBe(false);
    expect(r.ordem.passos).toHaveLength(2);
  });

  it("a conferencia reprovada VOLTA a ordem para quem abriu", () => {
    // Era a decisao que o checklist exigia: sem ela, as perguntas seriam
    // decoracao. Qualquer nao devolve a ordem.
    const dados: DadosConferencia = { ...TODAS_SIM, cumpreAData: false, dataPossivel: "2026-11-01" };
    const r = aplicarPasso(ordem(), passo("conferencia", { conferencia: dados }), agora);

    expect(r.voltouParaRevisao).toBe(true);
    expect(r.ordem.situacao).toBe("revisao");
    expect(r.ordem.etapaAtual).toBe("conferencia");
    // O passo fica registrado: a recusa tambem e assinada.
    expect(r.ordem.passos).toHaveLength(2);
  });

  it("o recebimento fecha a ordem e carimba a data", () => {
    const naUltima = ordem({ etapaAtual: "recebimento" });
    const r = aplicarPasso(
      naUltima,
      passo("recebimento", {
        recebimento: { dataRecebimento: "2026-09-18", quantidades },
      }),
      agora,
    );

    expect(r.ordem.situacao).toBe("concluida");
    expect(r.ordem.etapaAtual).toBeNull();
    expect(r.ordem.fechadoEm).toBe(agora.toISOString());
  });

  it("o processo inteiro chega ao fim passo a passo", () => {
    let atual = ordem();
    const sequencia: EtapaOrdem[] = ["conferencia", "fabricacao", "contagem", "envio", "recebimento"];

    for (const etapa of sequencia) {
      expect(atual.etapaAtual).toBe(etapa);
      atual = aplicarPasso(atual, passo(etapa, { conferencia: etapa === "conferencia" ? TODAS_SIM : undefined }), agora).ordem;
    }

    expect(atual.situacao).toBe("concluida");
    expect(atual.passos).toHaveLength(6);
  });
});

describe("retomarOrdem", () => {
  it("reescreve a data e devolve para a conferencia", () => {
    const emRevisao = ordem({ situacao: "revisao" });
    const devolvida = retomarOrdem(emRevisao, "2026-11-05", passo("abertura"));

    expect(devolvida.dataLancamento).toBe("2026-11-05");
    expect(devolvida.situacao).toBe("andamento");
    expect(devolvida.etapaAtual).toBe("conferencia");
    expect(devolvida.passos).toHaveLength(2);
  });
});

describe("cancelarOrdem", () => {
  it("guarda o motivo e fecha", () => {
    const agora = new Date("2026-09-18T15:00:00.000Z");
    const cancelada = cancelarOrdem(ordem(), "A campanha saiu do ar.", agora);

    expect(cancelada.situacao).toBe("cancelada");
    expect(cancelada.etapaAtual).toBeNull();
    expect(cancelada.motivoCancelamento).toBe("A campanha saiu do ar.");
    expect(cancelada.fechadoEm).toBe(agora.toISOString());
  });
});

describe("estadoDaEtapa", () => {
  it("cumprida, atual e futura na mesma ordem", () => {
    const atual = ordem({ etapaAtual: "fabricacao", passos: [passo("abertura"), passo("conferencia")] });

    expect(estadoDaEtapa(atual, "abertura")).toBe("cumprida");
    expect(estadoDaEtapa(atual, "conferencia")).toBe("cumprida");
    expect(estadoDaEtapa(atual, "fabricacao")).toBe("atual");
    expect(estadoDaEtapa(atual, "recebimento")).toBe("futura");
  });

  it("em revisao a conferencia aparece PARADA, e nao cumprida", () => {
    // A linha do tempo precisa mostrar onde o processo travou; dizer
    // "cumprida" afirmaria o contrario do que aconteceu.
    const travada = ordem({ situacao: "revisao", passos: [passo("abertura"), passo("conferencia")] });
    expect(estadoDaEtapa(travada, "conferencia")).toBe("parada");
  });
});

describe("diasAteOLancamento", () => {
  it("conta em dias de calendario, sem fuso no meio", () => {
    // "2026-10-12" com `new Date` viraria meia-noite UTC, que no Brasil ainda
    // e dia 11 -- a conta e feita sobre o texto de proposito.
    expect(diasAteOLancamento("2026-10-12", "2026-10-10")).toBe(2);
    expect(diasAteOLancamento("2026-10-10", "2026-10-10")).toBe(0);
    expect(diasAteOLancamento("2026-10-08", "2026-10-10")).toBe(-2);
  });
});

describe("montarFila", () => {
  it("o que esta com a pessoa vem primeiro, depois o mais urgente", () => {
    const longe = ordem({ id: "a", numero: "OF-2026-0001", dataLancamento: "2026-12-01" });
    const perto = ordem({ id: "b", numero: "OF-2026-0002", dataLancamento: "2026-10-01" });
    const fechada = ordem({
      id: "c",
      numero: "OF-2026-0003",
      dataLancamento: "2026-09-01",
      situacao: "concluida",
      etapaAtual: null,
    });

    const fila = montarFila([fechada, longe, perto], usuario(), "2026-09-18");

    // As duas abertas sao "minhas" na fase de teste; entre elas manda a data.
    expect(fila.map((f) => f.ordem.id)).toEqual(["b", "a", "c"]);
    expect(fila[0]!.minha).toBe(true);
    expect(fila[2]!.minha).toBe(false);
  });
});
