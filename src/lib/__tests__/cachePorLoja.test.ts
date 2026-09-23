import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Pedido } from "@/types/nuvemshop";

/*
 * O cache de pedidos guarda UM ARQUIVO POR LOJA E POR MÊS (seção 12).
 *
 * O que este arquivo protege são as três lições de 23/09/2026, pagas com 239
 * mil pedidos apagados em produção:
 *
 * 1. `destino.push(...origem)` estoura a pilha com array grande — foi a causa
 *    raiz, e só aparece com volume (ver "volume", no fim);
 * 2. falha ao LER uma loja não pode ser engolida — quem não conseguiu ler não
 *    pode gravar por cima. Foi o que transformou um erro de leitura em perda
 *    de dado;
 * 3. a migração dos formatos antigos não pode perder pedido.
 */

let pasta: string;

const pedido = (id: number, marca: string, mes = "2026-09"): Pedido =>
  ({
    id,
    number: id,
    created_at: `${mes}-10T12:00:00-03:00`,
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
  desdeMes: "2025-09",
});

/**
 * O cache guarda a cópia lida em `globalThis` (armadilha 2), então cada teste
 * precisa de um módulo novo e de um `globalThis` limpo — senão o segundo teste
 * leria a pasta do primeiro.
 */
async function carregar() {
  process.env.NUVEMSHOP_CACHE_DIR = pasta;
  delete (globalThis as Record<string, unknown>).__cacheNuvemshop;
  vi.resetModules();
  return import("@/data/cachePedidos");
}

const escrever = (nome: string, conteudo: unknown) =>
  fs.writeFile(path.join(pasta, nome), JSON.stringify(conteudo));

beforeEach(async () => {
  pasta = await fs.mkdtemp(path.join(os.tmpdir(), "cache-painel-"));
});

afterEach(async () => {
  await fs.rm(pasta, { recursive: true, force: true });
});

describe("migração do arquivo único", () => {
  it("converte sem perder pedido, e quebra por mês", async () => {
    await escrever("pedidos.json", {
      versao: 1,
      lojas: { "111": loja("Loja A"), "222": loja("Loja B") },
      pedidos: [
        pedido(1, "Loja A", "2026-08"),
        pedido(2, "Loja A", "2026-09"),
        pedido(3, "Loja A", "2026-09"),
        pedido(4, "Loja B", "2026-09"),
      ],
      carrinhos: [{ id: 9, marca: "Loja B", created_at: "2026-09-01T00:00:00-03:00" }],
      ausentes: { "111": { shipping_cost_customer: 2 } },
    });

    const { lerCache } = await carregar();
    const base = await lerCache();

    expect(base.pedidos).toHaveLength(4);
    expect(base.carrinhos).toHaveLength(1);
    expect(base.ausentes["111"]).toEqual({ shipping_cost_customer: 2 });

    // Um arquivo por mês, e é isso que impede o arquivo de crescer com a janela.
    expect((await fs.readdir(path.join(pasta, "loja-111"))).sort()).toEqual([
      "carrinhos.json",
      "pedidos-2026-08.json",
      "pedidos-2026-09.json",
    ]);
    const agosto = JSON.parse(
      await fs.readFile(path.join(pasta, "loja-111", "pedidos-2026-08.json"), "utf8"),
    );
    expect(agosto.map((p: Pedido) => p.id)).toEqual([1]);

    // Só apaga o antigo depois de gravar o novo.
    expect((await fs.readdir(pasta)).includes("pedidos.json")).toBe(false);
  });
});

describe("migração do formato de um arquivo por loja", () => {
  it("converte para a quebra por mês sem perder pedido", async () => {
    await escrever("indice.json", {
      versao: 1,
      lojas: { "111": loja("Loja A") },
      ausentes: {},
    });
    await escrever("loja-111.json", {
      pedidos: [pedido(1, "Loja A", "2026-08"), pedido(2, "Loja A", "2026-09")],
      carrinhos: [],
    });

    const { lerCache } = await carregar();
    const base = await lerCache();

    expect(base.pedidos.map((p: Pedido) => p.id).sort()).toEqual([1, 2]);
    expect((await fs.readdir(pasta)).includes("loja-111.json")).toBe(false);
    expect((await fs.readdir(path.join(pasta, "loja-111"))).sort()).toEqual([
      "carrinhos.json",
      "pedidos-2026-08.json",
      "pedidos-2026-09.json",
    ]);
  });
});

describe("leitura", () => {
  it("ler duas vezes devolve o mesmo", async () => {
    await escrever("pedidos.json", {
      versao: 1,
      lojas: { "111": loja("Loja A") },
      pedidos: [pedido(1, "Loja A"), pedido(2, "Loja A")],
      carrinhos: [],
      ausentes: {},
    });

    const { lerCache } = await carregar();
    expect((await lerCache()).pedidos).toHaveLength(2);
    expect((await lerCache()).pedidos).toHaveLength(2);
  });

  it("pasta vazia devolve base vazia, e não quebra", async () => {
    const { lerCache } = await carregar();
    const base = await lerCache();
    expect(base.pedidos).toEqual([]);
    expect(base.lojas).toEqual({});
  });

  it("cópia de outra versão recomeça, em vez de migrar às cegas", async () => {
    await escrever("indice.json", { versao: 99, lojas: { "111": loja("Loja A") }, ausentes: {} });
    const { lerCache } = await carregar();
    expect((await lerCache()).pedidos).toEqual([]);
  });

  it("MÊS ILEGÍVEL FAZ A LEITURA FALHAR, em vez de devolver a loja vazia", async () => {
    /*
     * A segunda metade do defeito de 23/09/2026: a leitura da loja maior
     * falhou (ver "volume", abaixo, para a causa), um `catch` devolveu a loja
     * vazia, e a gravação seguinte salvou esse vazio por cima de 13 meses de
     * histórico.
     *
     * Cópia velha é um problema; cópia APAGADA é outro, muito maior. Quem não
     * conseguiu ler não grava — e é isso que este teste exige.
     */
    await escrever("indice.json", { versao: 1, lojas: { "111": loja("Loja A") }, ausentes: {} });
    await fs.mkdir(path.join(pasta, "loja-111"), { recursive: true });
    await escrever(path.join("loja-111", "pedidos-2026-09.json"), [pedido(1, "Loja A")]);
    await fs.writeFile(path.join(pasta, "loja-111", "pedidos-2026-08.json"), "{ isto nao e json");

    const { lerCache } = await carregar();
    await expect(lerCache()).rejects.toThrow();
  });

  it("carrinho ilegível não derruba a leitura dos pedidos", async () => {
    // Carrinho é o número menos importante da tela e se refaz de hora em hora.
    await escrever("indice.json", { versao: 1, lojas: { "111": loja("Loja A") }, ausentes: {} });
    await fs.mkdir(path.join(pasta, "loja-111"), { recursive: true });
    await escrever(path.join("loja-111", "pedidos-2026-09.json"), [pedido(1, "Loja A")]);
    await fs.writeFile(path.join(pasta, "loja-111", "carrinhos.json"), "{ nao e json");

    const { lerCache } = await carregar();
    const base = await lerCache();
    expect(base.pedidos).toHaveLength(1);
    expect(base.carrinhos).toEqual([]);
  });

  it("loja sem pasta nenhuma é loja que nunca foi buscada, e não é erro", async () => {
    await escrever("indice.json", { versao: 1, lojas: { "111": loja("Loja A") }, ausentes: {} });
    await fs.mkdir(path.join(pasta, "loja-111"), { recursive: true });

    const { lerCache } = await carregar();
    expect((await lerCache()).pedidos).toEqual([]);
  });
});

describe("volume", () => {
  it("lê uma loja com 200 mil pedidos sem estourar a pilha", async () => {
    /*
     * O defeito que apagou 239 mil pedidos em produção (23/09/2026).
     *
     * A causa não era memória: era `destino.push(...origem)`. O spread passa
     * cada item como um ARGUMENTO da chamada, e o limite fica na casa das
     * dezenas de milhares — "Maximum call stack size exceeded". Não aparece em
     * teste pequeno nem numa loja pequena, só na maior. Daí o volume aqui.
     *
     * Antes o erro era engolido por um `catch` e a gravação seguinte salvava o
     * vazio por cima. Hoje ele derrubaria a leitura, o que já seria seguro —
     * mas o certo é ele não acontecer.
     */
    const MUITOS = 200_000;
    await escrever("indice.json", {
      versao: 1,
      lojas: { "111": loja("Loja Grande") },
      ausentes: {},
    });
    await fs.mkdir(path.join(pasta, "loja-111"), { recursive: true });
    await escrever(
      path.join("loja-111", "pedidos-2026-09.json"),
      Array.from({ length: MUITOS }, (_, i) => pedido(i, "Loja Grande")),
    );

    const { lerCache } = await carregar();
    const base = await lerCache();
    expect(base.pedidos).toHaveLength(MUITOS);
  });
});
