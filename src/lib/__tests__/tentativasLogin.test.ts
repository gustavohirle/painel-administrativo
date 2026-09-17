import { beforeEach, describe, expect, it } from "vitest";

import {
  chavesDaTentativa,
  esperaEmSegundos,
  esperaEmTexto,
  limparFalhas,
  limparVelhas,
  maiorEspera,
  registrarFalha,
  type RegistroDeTentativas,
} from "@/lib/tentativasLogin";

const T0 = Date.parse("2026-09-17T21:00:00-03:00");
const MINUTO = 60_000;

let registro: RegistroDeTentativas;
const chaves = ["login:dono"];

beforeEach(() => {
  registro = new Map();
});

function falhar(vezes: number, agora = T0) {
  for (let i = 0; i < vezes; i += 1) registrarFalha(registro, chaves, agora);
}

describe("limite de tentativas", () => {
  it("as quatro primeiras falhas passam direto", () => {
    falhar(4);
    expect(esperaEmSegundos(registro, "login:dono", T0)).toBe(0);
  });

  it("a quinta falha faz esperar, e cada erro novo espera mais", () => {
    falhar(5);
    expect(esperaEmSegundos(registro, "login:dono", T0)).toBe(60);
    falhar(1, T0 + 2 * MINUTO);
    expect(esperaEmSegundos(registro, "login:dono", T0 + 2 * MINUTO)).toBe(120);
    falhar(1, T0 + 10 * MINUTO);
    expect(esperaEmSegundos(registro, "login:dono", T0 + 10 * MINUTO)).toBe(300);
  });

  it("a espera termina sozinha quando o tempo passa", () => {
    falhar(5);
    expect(esperaEmSegundos(registro, "login:dono", T0 + 59_000)).toBe(1);
    expect(esperaEmSegundos(registro, "login:dono", T0 + 60_000)).toBe(0);
  });

  it("a espera nao cresce sem limite", () => {
    falhar(30);
    expect(esperaEmSegundos(registro, "login:dono", T0)).toBe(1800);
  });

  it("acertar a senha zera a contagem", () => {
    falhar(6);
    expect(esperaEmSegundos(registro, "login:dono", T0)).toBeGreaterThan(0);
    limparFalhas(registro, chaves);
    expect(esperaEmSegundos(registro, "login:dono", T0)).toBe(0);
  });

  it("uma hora sem errar recomeça a contagem do zero", () => {
    falhar(6);
    const depois = T0 + 61 * MINUTO;
    expect(esperaEmSegundos(registro, "login:dono", depois)).toBe(0);
    // E a falha seguinte conta como primeira, nao como setima.
    falhar(1, depois);
    expect(registro.get("login:dono")?.falhas).toBe(1);
  });

  it("login e endereço contam separado, e a maior espera vale", () => {
    const daTentativa = chavesDaTentativa("Dono", "191.0.0.9");
    expect(daTentativa).toEqual(["login:dono", "ip:191.0.0.9"]);

    // Cinco erros no mesmo login, de dois enderecos diferentes.
    registrarFalha(registro, chavesDaTentativa("dono", "191.0.0.9"), T0);
    for (let i = 0; i < 4; i += 1) {
      registrarFalha(registro, chavesDaTentativa("dono", "200.1.2.3"), T0);
    }
    // O login ja passou do limite; o endereco novo, sozinho, ainda nao.
    expect(esperaEmSegundos(registro, "login:dono", T0)).toBe(60);
    expect(esperaEmSegundos(registro, "ip:191.0.0.9", T0)).toBe(0);
    expect(maiorEspera(registro, chavesDaTentativa("dono", "191.0.0.9"), T0)).toBe(60);
    // Outro login vindo do endereco ja carimbado nao e afetado por engano.
    expect(maiorEspera(registro, chavesDaTentativa("estoque", "191.0.0.9"), T0)).toBe(0);
  });

  it("sem endereço, a conta por login continua valendo", () => {
    expect(chavesDaTentativa("dono", null)).toEqual(["login:dono"]);
  });

  it("a limpeza tira o que já foi esquecido, para a memória não crescer", () => {
    for (let i = 0; i < 500; i += 1) {
      registrarFalha(registro, [`login:inventado-${i}`], T0);
    }
    expect(registro.size).toBe(500);
    limparVelhas(registro, T0 + 61 * MINUTO);
    expect(registro.size).toBe(0);
  });

  it("a espera vira texto legível", () => {
    expect(esperaEmTexto(45)).toBe("45 segundos");
    expect(esperaEmTexto(1)).toBe("1 segundo");
    expect(esperaEmTexto(60)).toBe("1 minuto");
    expect(esperaEmTexto(90)).toBe("2 minutos");
    expect(esperaEmTexto(1800)).toBe("30 minutos");
  });
});
