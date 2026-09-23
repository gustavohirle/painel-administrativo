import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Pedido } from "@/types/nuvemshop";

/*
 * O cache de pedidos guarda UM ARQUIVO POR LOJA (seção 12).
 *
 * O que este teste protege é a migração: no servidor existe uma cópia no
 * formato antigo, de arquivo único, e ela precisa virar o formato novo sem
 * perder pedido nenhum. Se perdesse, o painel abriria vazio e buscaria os 12
 * meses das cinco lojas no caminho da primeira página aberta.
 */

let pasta: string;

const pedido = (id: number, marca: string): Pedido =>
  ({
    id,
    number: id,
    created_at: "2026-09-10T12:00:00-03:00",
    paid_at: null,
    status: "open",
    payment_status: "pending",
    shipping_status: "unpacked",
    subtotal: "100.00",
    total: "119.00",
    discount: "0.00",
    shipping_cost_customer: "19.00",
    shipping_cost_owner: "19.00",
    gateway_name: "Nuvem Pago",
    payment_details: { method: "pix" },
    cancel_reason: null,
    shipping_address: { province: "SP" },
    customer: null,
    products: [],
    marca,
  }) as unknown as Pedido;

const loja = (marca: string) => ({
  marca,
  sincronizadoEm: "2026-09-23T10:00:00.000Z",
  desdeMes: "2026-07",
});

/**
 * O cache guarda a copia lida em `globalThis` (armadilha 2), entao cada teste
 * precisa de um modulo novo e de um `globalThis` limpo -- senao o segundo
 * teste leria a pasta do primeiro.
 */
async function carregar() {
  process.env.NUVEMSHOP_CACHE_DIR = pasta;
  delete (globalThis as Record<string, unknown>).__cacheNuvemshop;
  vi.resetModules();
  return import("@/data/cachePedidos");
}

beforeEach(async () => {
  pasta = await fs.mkdtemp(path.join(os.tmpdir(), "cache-painel-"));
});

afterEach(async () => {
  await fs.rm(pasta, { recursive: true, force: true });
});

describe("cache de pedidos, um arquivo por loja", () => {
  it("converte a copia antiga de arquivo unico sem perder pedido", async () => {
    await fs.writeFile(
      path.join(pasta, "pedidos.json"),
      JSON.stringify({
        versao: 1,
        lojas: { "111": loja("Loja A"), "222": loja("Loja B") },
        pedidos: [pedido(1, "Loja A"), pedido(2, "Loja A"), pedido(3, "Loja B")],
        carrinhos: [{ id: 9, marca: "Loja B", created_at: "2026-09-01T00:00:00-03:00" }],
        ausentes: { "111": { shipping_cost_customer: 2 } },
      }),
    );

    const { lerCache } = await carregar();
    const base = await lerCache();

    expect(base.pedidos).toHaveLength(3);
    expect(base.carrinhos).toHaveLength(1);
    expect(Object.keys(base.lojas).sort()).toEqual(["111", "222"]);
    // O indice guarda o que nao e pedido -- inclusive os campos vigiados.
    expect(base.ausentes["111"]).toEqual({ shipping_cost_customer: 2 });

    const arquivos = (await fs.readdir(pasta)).sort();
    expect(arquivos).toEqual(["indice.json", "loja-111.json", "loja-222.json"]);

    // Cada arquivo com os pedidos da SUA loja, e so eles.
    const a = JSON.parse(await fs.readFile(path.join(pasta, "loja-111.json"), "utf8"));
    const b = JSON.parse(await fs.readFile(path.join(pasta, "loja-222.json"), "utf8"));
    expect(a.pedidos.map((p: Pedido) => p.id)).toEqual([1, 2]);
    expect(b.pedidos.map((p: Pedido) => p.id)).toEqual([3]);
    expect(b.carrinhos).toHaveLength(1);
  });

  it("o arquivo antigo so some depois que os novos estao gravados", async () => {
    await fs.writeFile(
      path.join(pasta, "pedidos.json"),
      JSON.stringify({
        versao: 1,
        lojas: { "111": loja("Loja A") },
        pedidos: [pedido(1, "Loja A")],
        carrinhos: [],
        ausentes: {},
      }),
    );

    const { lerCache } = await carregar();
    await lerCache();
    expect((await fs.readdir(pasta)).includes("pedidos.json")).toBe(false);
  });

  it("ler duas vezes devolve o mesmo, sem remigrar", async () => {
    await fs.writeFile(
      path.join(pasta, "pedidos.json"),
      JSON.stringify({
        versao: 1,
        lojas: { "111": loja("Loja A") },
        pedidos: [pedido(1, "Loja A"), pedido(2, "Loja A")],
        carrinhos: [],
        ausentes: {},
      }),
    );

    const { lerCache } = await carregar();
    expect((await lerCache()).pedidos).toHaveLength(2);
    expect((await lerCache()).pedidos).toHaveLength(2);
  });

  it("pasta vazia devolve base vazia, e nao quebra", async () => {
    const { lerCache } = await carregar();
    const base = await lerCache();
    expect(base.pedidos).toEqual([]);
    expect(base.lojas).toEqual({});
  });

  it("arquivo de uma loja corrompido nao derruba as outras", async () => {
    /*
     * A loja continua no indice de proposito: assim ela nao vira "loja
     * pendente" para sempre, e a proxima sincronizacao a busca de novo.
     */
    await fs.writeFile(
      path.join(pasta, "indice.json"),
      JSON.stringify({ versao: 1, lojas: { "111": loja("Loja A"), "222": loja("Loja B") }, ausentes: {} }),
    );
    await fs.writeFile(
      path.join(pasta, "loja-111.json"),
      JSON.stringify({ pedidos: [pedido(1, "Loja A")], carrinhos: [] }),
    );
    await fs.writeFile(path.join(pasta, "loja-222.json"), "{ isto nao e json");

    const { lerCache } = await carregar();
    const base = await lerCache();

    expect(base.pedidos.map((p: Pedido) => p.id)).toEqual([1]);
    expect(Object.keys(base.lojas).sort()).toEqual(["111", "222"]);
  });

  it("copia de outra versao recomeca, em vez de migrar as cegas", async () => {
    await fs.writeFile(
      path.join(pasta, "indice.json"),
      JSON.stringify({ versao: 99, lojas: { "111": loja("Loja A") }, ausentes: {} }),
    );

    const { lerCache } = await carregar();
    expect((await lerCache()).pedidos).toEqual([]);
  });
});
