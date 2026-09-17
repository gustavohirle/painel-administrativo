import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buscarCarrinhosDaLoja, buscarPedidosDaLoja } from "@/data/apiSource";
import { dividirJanela, LIMITE_POR_CONSULTA } from "@/lib/nuvemshop";

const LOJA = { marca: "Loja A", storeId: "123", accessToken: "chave-de-teste" };

describe("dividirJanela", () => {
  it("parte ao meio, e as metades compartilham o instante do meio", () => {
    const metades = dividirJanela("2025-09-01T03:00:00.000Z", "2025-09-01T03:00:10.000Z")!;
    expect(metades).toEqual([
      ["2025-09-01T03:00:00.000Z", "2025-09-01T03:00:05.000Z"],
      ["2025-09-01T03:00:05.000Z", "2025-09-01T03:00:10.000Z"],
    ]);
  });

  it("não divide intervalo de menos de dois segundos, nem data ilegível", () => {
    expect(dividirJanela("2025-09-01T03:00:00.000Z", "2025-09-01T03:00:01.000Z")).toBeNull();
    expect(dividirJanela("ontem", "2025-09-01T03:00:01.000Z")).toBeNull();
  });
});

interface Registro {
  id: number;
  created_at: string;
  updated_at: string;
}

/**
 * API falsa com o comportamento medido na loja real (16/09/2026):
 * - 422 quando a pagina pedida passa de LIMITE_POR_CONSULTA registros;
 * - `x-total-count` com o total da consulta;
 * - mais recentes primeiro;
 * - demora para responder, o que permite medir quantas chamadas correm juntas.
 */
function apiFalsa(registros: Registro[], opcoes: { semTotal?: boolean } = {}) {
  const estado = { chamadas: 0, simultaneas: 0, maxSimultaneas: 0, urls: [] as string[] };

  const fetchFalso = async (entrada: string | URL) => {
    const url = new URL(String(entrada));
    estado.chamadas += 1;
    estado.urls.push(url.toString());
    estado.simultaneas += 1;
    estado.maxSimultaneas = Math.max(estado.maxSimultaneas, estado.simultaneas);
    try {
      await new Promise((r) => setTimeout(r, 2));
      const q = url.searchParams;
      const campo = q.has("updated_at_min") ? "updated_at" : "created_at";
      const min = new Date(q.get(`${campo}_min`) ?? 0).getTime();
      const max = new Date(q.get(`${campo}_max`) ?? "2100-01-01").getTime();
      const porPagina = Number(q.get("per_page"));
      const pagina = Number(q.get("page"));

      const filtrados = registros
        .filter((r) => {
          const t = new Date(r[campo]).getTime();
          return t >= min && t <= max;
        })
        .sort((a, b) => b.id - a.id);

      if ((pagina - 1) * porPagina >= LIMITE_POR_CONSULTA) {
        return new Response(
          JSON.stringify({ code: 422, description: "Query exceeds max allowed limit of 10000" }),
          { status: 422 },
        );
      }
      const ultima = Math.max(1, Math.ceil(filtrados.length / porPagina));
      if (pagina > ultima) {
        return new Response(JSON.stringify({ code: 404, description: `Last page is ${ultima}` }), {
          status: 404,
        });
      }
      const headers: Record<string, string> = { "x-rate-limit-remaining": "399" };
      if (!opcoes.semTotal) headers["x-total-count"] = String(filtrados.length);
      const fatia = filtrados.slice((pagina - 1) * porPagina, pagina * porPagina);
      return new Response(JSON.stringify(fatia), { status: 200, headers });
    } finally {
      estado.simultaneas -= 1;
    }
  };

  return { estado, fetchFalso };
}

/** `quantos` registros espalhados por setembro de 2025, com a data no formato da API. */
function registrosDeSetembro(quantos: number): Registro[] {
  const inicio = Date.parse("2025-09-01T03:00:00Z");
  const passo = (30 * 24 * 60 * 60 * 1000) / quantos;
  return Array.from({ length: quantos }, (_, i) => {
    const data = new Date(inicio + Math.floor(i * passo)).toISOString().replace(".000Z", "+0000");
    return { id: i + 1, created_at: data, updated_at: data };
  });
}

const SETEMBRO = { criadosDesde: "2025-09-01T03:00:00.000Z", criadosAte: "2025-10-01T02:59:59.000Z" };

// A API falsa responde com atraso de proposito; com a suite inteira rodando em
// paralelo, o teste do mes grande passava dos 5 s padrao sem nada de errado.
describe("buscarPedidosDaLoja em loja grande", { timeout: 20_000 }, () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-16T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("traz um mês acima do limite da API inteiro, sem repetir nem perder pedido", async () => {
    // O caso real: setembro/2025 da loja tinha 25.235 pedidos, e a página 51 voltava 422.
    const { estado, fetchFalso } = apiFalsa(registrosDeSetembro(25_235));
    vi.stubGlobal("fetch", fetchFalso);

    const pedidos = await buscarPedidosDaLoja(LOJA, SETEMBRO);

    expect(pedidos).toHaveLength(25_235);
    expect(new Set(pedidos.map((p) => p.pedido.id)).size).toBe(25_235);
    expect(estado.urls.every((u) => !u.includes("page=51"))).toBe(true);
  });

  it("nunca passa de 12 chamadas ao mesmo tempo, e de fato usa mais de uma", async () => {
    const { estado, fetchFalso } = apiFalsa(registrosDeSetembro(25_235));
    vi.stubGlobal("fetch", fetchFalso);

    await buscarPedidosDaLoja(LOJA, SETEMBRO);

    expect(estado.maxSimultaneas).toBeLessThanOrEqual(12);
    expect(estado.maxSimultaneas).toBeGreaterThan(1);
  });

  it("sem o total no cabeçalho, segue página a página como antes", async () => {
    const { estado, fetchFalso } = apiFalsa(registrosDeSetembro(900), { semTotal: true });
    vi.stubGlobal("fetch", fetchFalso);

    const pedidos = await buscarPedidosDaLoja(LOJA, SETEMBRO);

    expect(pedidos).toHaveLength(900);
    expect(estado.maxSimultaneas).toBe(1);
  });

  it("não pede nada depois de agora, mesmo com o fim do mês no futuro", async () => {
    const { estado, fetchFalso } = apiFalsa([]);
    vi.stubGlobal("fetch", fetchFalso);

    await buscarPedidosDaLoja(LOJA, {
      criadosDesde: "2026-09-01T03:00:00.000Z",
      criadosAte: "2026-10-01T02:59:59.000Z",
    });

    const max = new URL(estado.urls[0]!).searchParams.get("created_at_max");
    expect(max).toBe("2026-09-16T12:00:00.000Z");
  });

  it("a busca incremental filtra por alteração e também termina em agora", async () => {
    const { estado, fetchFalso } = apiFalsa([]);
    vi.stubGlobal("fetch", fetchFalso);

    await buscarPedidosDaLoja(LOJA, { alteradosDesde: "2026-09-16T11:40:00.000Z" });

    const q = new URL(estado.urls[0]!).searchParams;
    expect(q.get("updated_at_min")).toBe("2026-09-16T11:40:00.000Z");
    expect(q.get("updated_at_max")).toBe("2026-09-16T12:00:00.000Z");
    expect(q.get("created_at_min")).toBeNull();
    expect(q.get("status")).toBe("any");
    expect(q.get("payment_status")).toBe("any");
  });

  it("carrinhos abandonados usam a mesma divisão", async () => {
    const agora = Date.parse("2026-09-16T12:00:00Z");
    const carrinhos = Array.from({ length: 12_000 }, (_, i) => {
      const data = new Date(agora - (i + 1) * 60_000).toISOString();
      return { id: i + 1, created_at: data, updated_at: data, total: "10.00" };
    });
    const { fetchFalso } = apiFalsa(carrinhos);
    vi.stubGlobal("fetch", fetchFalso);

    const lidos = await buscarCarrinhosDaLoja(LOJA, new Date(agora - 30 * 86_400_000).toISOString());

    expect(lidos).toHaveLength(12_000);
  });
});
