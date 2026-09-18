"use client";

import { useActionState } from "react";

import { trocarMinhaSenha } from "@/app/conta/actions";
import { ESTADO_INICIAL } from "@/types/formulario";
import { TAMANHO_MINIMO_SENHA } from "@/types/usuario";

const CAMPO =
  "w-full rounded-lg border border-borda-forte bg-superficie px-3 py-2 text-sm text-tinta";

/**
 * Troca da propria senha.
 *
 * Pede a senha atual: sem isso, um computador deixado aberto na fabrica deixa
 * qualquer um trocar a senha e tomar a conta. Quem esqueceu pede a um
 * administrador, que redefine pela tela de Usuarios.
 */
export function TrocaDeSenha() {
  const [estado, acao, enviando] = useActionState(trocarMinhaSenha, ESTADO_INICIAL);

  return (
    <form action={acao} className="max-w-md space-y-4">
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-tinta">Senha atual</span>
        <input
          name="atual"
          type="password"
          required
          className={CAMPO}
          autoComplete="current-password"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-tinta">Nova senha</span>
        <input
          name="nova"
          type="password"
          required
          minLength={TAMANHO_MINIMO_SENHA}
          className={CAMPO}
          autoComplete="new-password"
        />
        <span className="mt-1 block text-xs text-tinta-fraca">
          Pelo menos {TAMANHO_MINIMO_SENHA} caracteres, com letras.
        </span>
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-tinta">Repita a nova senha</span>
        <input
          name="repeticao"
          type="password"
          required
          minLength={TAMANHO_MINIMO_SENHA}
          className={CAMPO}
          autoComplete="new-password"
        />
      </label>

      {estado.mensagem && (
        <p
          className={`rounded-lg px-4 py-3 text-sm ${
            estado.ok
              ? "border border-borda bg-real-claro text-real"
              : "border border-alerta-borda bg-alerta-fundo text-naopago"
          }`}
        >
          {estado.mensagem}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="rounded-lg bg-tinta px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {enviando ? "Trocando..." : "Trocar minha senha"}
      </button>
    </form>
  );
}
