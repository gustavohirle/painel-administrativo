import { describe, expect, it } from "vitest";

import {
  criarHashSenha,
  criarTokenSessao,
  DURACAO_SESSAO_SEGUNDOS,
  lerTokenSessao,
  verificarSenha,
} from "@/lib/auth";

describe("senha", () => {
  it("nao guarda a senha em texto", async () => {
    const guardada = await criarHashSenha("segredo123");
    expect(guardada.senhaHash).not.toContain("segredo123");
    expect(guardada.senhaHash.length).toBeGreaterThan(60);
  });

  it("usa sal diferente a cada cadastro", async () => {
    // Sem sal por usuario, duas pessoas com a mesma senha teriam o mesmo hash,
    // e quebrar um entregaria os dois.
    const a = await criarHashSenha("mesma-senha");
    const b = await criarHashSenha("mesma-senha");
    expect(a.senhaSal).not.toBe(b.senhaSal);
    expect(a.senhaHash).not.toBe(b.senhaHash);
  });

  it("aceita a senha certa e recusa a errada", async () => {
    const guardada = await criarHashSenha("segredo123");
    expect(await verificarSenha("segredo123", guardada)).toBe(true);
    expect(await verificarSenha("segredo124", guardada)).toBe(false);
    expect(await verificarSenha("", guardada)).toBe(false);
  });

  it("recusa qualquer senha quando o registro esta corrompido", async () => {
    // Este e o caso perigoso: `Buffer.from("nao-e-hex", "hex")` devolve buffer
    // VAZIO, e `timingSafeEqual` de dois vazios devolve true. Sem a guarda de
    // formato, um hash corrompido no banco liberaria a conta para qualquer um.
    for (const senhaHash of ["", "nao-e-hex", "ab", "zz".repeat(64), "00"]) {
      expect(
        await verificarSenha("chute-qualquer", { senhaHash, senhaSal: "abc" }),
      ).toBe(false);
    }
  });

  it("recusa quando o sal esta faltando", async () => {
    const guardada = await criarHashSenha("segredo123");
    expect(
      await verificarSenha("segredo123", { ...guardada, senhaSal: "" }),
    ).toBe(false);
  });
});

describe("sessao", () => {
  it("le de volta o que assinou", () => {
    const token = criarTokenSessao("usuario-1", "dono");
    const sessao = lerTokenSessao(token);

    expect(sessao?.usuarioId).toBe("usuario-1");
    expect(sessao?.perfil).toBe("dono");
  });

  it("recusa token com o corpo adulterado", () => {
    // E este o ataque que importa: trocar o perfil para "dono" no proprio
    // cookie e passar a ver o financeiro.
    const token = criarTokenSessao("usuario-1", "estoque");
    const [, assinatura] = token.split(".");

    const forjado = Buffer.from(
      JSON.stringify({
        usuarioId: "usuario-1",
        perfil: "dono",
        expiraEm: Math.floor(Date.now() / 1000) + 3600,
      }),
    )
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    expect(lerTokenSessao(`${forjado}.${assinatura}`)).toBeNull();
  });

  it("recusa token vencido", () => {
    const agora = Date.now();
    const token = criarTokenSessao("usuario-1", "dono", agora);
    const depois = agora + (DURACAO_SESSAO_SEGUNDOS + 60) * 1000;

    expect(lerTokenSessao(token, agora)).not.toBeNull();
    expect(lerTokenSessao(token, depois)).toBeNull();
  });

  it("recusa entrada vazia ou sem formato", () => {
    expect(lerTokenSessao(undefined)).toBeNull();
    expect(lerTokenSessao("")).toBeNull();
    expect(lerTokenSessao("sem-ponto")).toBeNull();
    expect(lerTokenSessao("corpo.assinatura")).toBeNull();
  });

  it("recusa perfil que nao existe", () => {
    const corpo = Buffer.from(
      JSON.stringify({
        usuarioId: "u",
        perfil: "administrador-supremo",
        expiraEm: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url");

    // Mesmo assinando corretamente, o perfil invalido e recusado.
    expect(lerTokenSessao(`${corpo}.qualquer`)).toBeNull();
  });
});
