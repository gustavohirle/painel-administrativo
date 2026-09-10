"use client";

import { useActionState, useState } from "react";

import { entrar } from "@/app/entrar/actions";
import { ESTADO_INICIAL } from "@/types/formulario";

interface CredencialDemo {
  usuario: string;
  senha: string;
  rotulo: string;
  descricao: string;
}

export function FormularioLogin({
  credenciais,
}: {
  credenciais: CredencialDemo[];
}) {
  const [estado, acao, entrando] = useActionState(entrar, ESTADO_INICIAL);
  const [preenchido, setPreenchido] = useState({ usuario: "", senha: "" });

  return (
    <div className="w-full max-w-md">
      <form action={acao} className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-tinta">Usuario</span>
          <input
            name="usuario"
            autoComplete="username"
            autoFocus
            required
            value={preenchido.usuario}
            onChange={(e) =>
              setPreenchido((p) => ({ ...p, usuario: e.target.value }))
            }
            className="mt-1 w-full rounded-lg border border-borda-forte bg-superficie px-4 py-2.5 text-tinta focus:border-tinta focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-tinta">Senha</span>
          <input
            name="senha"
            type="password"
            autoComplete="current-password"
            required
            value={preenchido.senha}
            onChange={(e) => setPreenchido((p) => ({ ...p, senha: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-borda-forte bg-superficie px-4 py-2.5 text-tinta focus:border-tinta focus:outline-none"
          />
        </label>

        {estado.mensagem && !estado.ok && (
          <p
            role="alert"
            className="rounded-lg border border-alerta-borda bg-alerta-fundo px-4 py-2.5 text-sm font-medium text-naopago"
          >
            {estado.mensagem}
          </p>
        )}

        <button
          type="submit"
          disabled={entrando}
          className="w-full rounded-lg bg-tinta px-5 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {entrando ? "Entrando..." : "Entrar"}
        </button>
      </form>

      {credenciais.length > 0 && (
        <div className="mt-8 rounded-xl border border-borda bg-fundo p-5">
          <p className="text-sm font-semibold text-tinta">
            Credenciais de demonstracao
          </p>
          <p className="mt-1 text-xs leading-relaxed text-tinta-media">
            Clique para preencher. Os dois perfis existem para mostrar que quem
            cuida do estoque nao enxerga nenhum numero financeiro.
          </p>

          <div className="mt-3 space-y-2">
            {credenciais.map((credencial) => (
              <button
                key={credencial.usuario}
                type="button"
                onClick={() =>
                  setPreenchido({
                    usuario: credencial.usuario,
                    senha: credencial.senha,
                  })
                }
                className="w-full rounded-lg border border-borda-forte bg-superficie px-4 py-3 text-left transition-colors hover:border-tinta"
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-semibold text-tinta">
                    {credencial.rotulo}
                  </span>
                  <span className="numerico text-xs text-tinta-fraca">
                    {credencial.usuario} / {credencial.senha}
                  </span>
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-tinta-media">
                  {credencial.descricao}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
