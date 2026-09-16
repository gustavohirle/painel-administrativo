import { describe, expect, it } from "vitest";

import { escolherMes } from "@/lib/mesDaTela";

describe("escolherMes", () => {
  const meses = ["2026-09", "2026-08", "2026-07"];

  it("o mes da URL manda: link compartilhado abre no mes certo", () => {
    expect(escolherMes(meses, "2026-07", "2026-08")).toBe("2026-07");
  });

  it("sem mes na URL, vale o escolhido no seletor: trocar de aba nao volta para o ultimo", () => {
    expect(escolherMes(meses, undefined, "2026-08")).toBe("2026-08");
  });

  it("sem escolha nenhuma, abre no mais recente", () => {
    expect(escolherMes(meses, undefined, undefined)).toBe("2026-09");
  });

  it("mes que nao existe na base e ignorado, venha de onde vier", () => {
    expect(escolherMes(meses, "2025-01", "2026-07")).toBe("2026-07");
    expect(escolherMes(meses, undefined, "lixo")).toBe("2026-09");
    expect(escolherMes([], "2026-09", "2026-09")).toBe("");
  });
});
