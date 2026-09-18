import { describe, expect, it } from "vitest";

import {
  normalizarLogin,
  ordenarUsuarios,
  problemaAoAlterar,
  problemaAoRemover,
  problemaNaSenha,
  problemaNoLogin,
} from "@/lib/usuarios";
import type { PerfilUsuario } from "@/types/usuario";

const pessoa = (
  id: string,
  perfil: PerfilUsuario,
  ativo = true,
  nome = id,
): { id: string; nome: string; perfil: PerfilUsuario; ativo: boolean } => ({
  id,
  nome,
  perfil,
  ativo,
});

describe("login", () => {
  it("normaliza para minúsculas, sem acento e sem espaço", () => {
    expect(normalizarLogin("  João Silva ")).toBe("joao.silva");
    expect(normalizarLogin("PRODUÇÃO")).toBe("producao");
  });

  it("recusa formato inválido e login repetido", () => {
    const existentes = [{ id: "1", usuario: "ana" }];
    expect(problemaNoLogin("ana", existentes)).toContain("Já existe");
    // O mesmo login, no proprio registro, continua valendo.
    expect(problemaNoLogin("ana", existentes, "1")).toBeNull();
    expect(problemaNoLogin("ab", existentes)).toContain("3 letras");
    expect(problemaNoLogin("joão", existentes)).toContain("apenas letras");
    expect(problemaNoLogin("joao.silva", existentes)).toBeNull();
  });
});

describe("senha", () => {
  it("exige tamanho e recusa as senhas publicadas na documentação", () => {
    expect(problemaNaSenha("curta", "ana")).toContain("pelo menos 10");
    expect(problemaNaSenha("dono123", "dono")).toContain("pelo menos 10");
    expect(problemaNaSenha("estoque123", "estoque")).toContain("demonstração");
    expect(problemaNaSenha("12345678901", "ana")).toContain("letras também");
    expect(problemaNaSenha("anaanaanaana", "anaanaanaana")).toContain("igual ao login");
    expect(problemaNaSenha("chuva-de-verao-26", "ana")).toBeNull();
  });
});

describe("travas do cadastro", () => {
  const time = [pessoa("a", "dono"), pessoa("b", "estoque"), pessoa("c", "dono", false)];

  it("ninguém remove a própria conta", () => {
    expect(problemaAoRemover(time, "a", "a")).toContain("própria conta");
  });

  it("o último administrador ativo não pode ser removido", () => {
    const so_um = [pessoa("a", "dono"), pessoa("b", "estoque")];
    expect(problemaAoRemover(so_um, "a", "b")).toContain("último administrador");
    // Com dois administradores ativos, remover um e permitido.
    const dois = [...so_um, pessoa("c", "dono")];
    expect(problemaAoRemover(dois, "a", "c")).toBeNull();
  });

  it("administrador inativo não conta como administrador", () => {
    expect(problemaAoRemover(time, "a", "b")).toContain("último administrador");
  });

  it("produção pode ser removida à vontade", () => {
    expect(problemaAoRemover(time, "b", "a")).toBeNull();
  });

  it("não dá para tirar o próprio acesso de administrador", () => {
    expect(problemaAoAlterar(time, "a", "a", { perfil: "estoque", ativo: true })).toContain(
      "próprio acesso",
    );
    expect(problemaAoAlterar(time, "a", "a", { perfil: "dono", ativo: false })).toContain(
      "próprio acesso",
    );
  });

  it("o último administrador não pode ser rebaixado nem desativado por outro", () => {
    const so_um = [pessoa("a", "dono"), pessoa("b", "estoque")];
    expect(problemaAoAlterar(so_um, "a", "b", { perfil: "estoque", ativo: true })).toContain(
      "último administrador",
    );
    expect(problemaAoAlterar(so_um, "a", "b", { perfil: "dono", ativo: false })).toContain(
      "último administrador",
    );
    // Continuar administrador ativo nunca e problema.
    expect(problemaAoAlterar(so_um, "a", "a", { perfil: "dono", ativo: true })).toBeNull();
  });

  it("promover alguém de produção nunca é bloqueado", () => {
    expect(problemaAoAlterar(time, "b", "a", { perfil: "dono", ativo: true })).toBeNull();
  });
});

describe("ordem da lista", () => {
  it("ativos primeiro, administradores antes, depois por nome", () => {
    const lista = [
      pessoa("1", "estoque", true, "Zuleica"),
      pessoa("2", "dono", false, "Ana"),
      pessoa("3", "dono", true, "Bruno"),
      pessoa("4", "estoque", true, "Carla"),
    ];
    expect(ordenarUsuarios(lista).map((u) => u.nome)).toEqual([
      "Bruno",
      "Carla",
      "Zuleica",
      "Ana",
    ]);
  });
});
