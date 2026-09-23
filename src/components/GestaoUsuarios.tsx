"use client";

import { Fragment, useActionState, useState } from "react";

import {
  alterarUsuario,
  criarUsuario,
  definirSenha,
  removerUsuario,
} from "@/app/usuarios/actions";
import { data } from "@/lib/format";
import { ESTADO_INICIAL } from "@/types/formulario";
import {
  areasDoPerfil,
  DESCRICAO_PERFIL,
  ROTULO_PERFIL,
  TAMANHO_MINIMO_SENHA,
  type PerfilUsuario,
} from "@/types/usuario";

/** Uma pessoa como a tela precisa dela: sem hash e sem sal. */
export interface UsuarioNaTela {
  id: string;
  nome: string;
  usuario: string;
  perfil: PerfilUsuario;
  ativo: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

const PERFIS: PerfilUsuario[] = ["dono", "estoque"];

const ROTULO_AREA: Record<string, string> = {
  financeiro: "Faturamento, influencers, relatórios e simulador",
  fiscal: "Impostos, DIFAL e cálculo do mês",
  custos: "Custo de fabricação",
  produtos: "Produtos, kits e ordens",
  estoque: "Estoque",
  usuarios: "Usuários",
};

/**
 * Cadastro de usuarios.
 *
 * Duas coisas que a tela deixa explicitas, porque errar nelas e caro:
 *
 * 1. **O que cada funcao enxerga** aparece escrito na propria tela, ao lado do
 *    perfil. "Producao" nao diz nada sozinho; a lista de areas diz.
 * 2. **Desativar e diferente de remover.** Desativado nao entra mais, e o
 *    login continua reservado -- da para religar. Removido some. Os dois
 *    existem porque a saida de uma pessoa da empresa quase sempre e o
 *    primeiro caso.
 */
export function GestaoUsuarios({
  usuarios,
  idDeQuemVe,
}: {
  usuarios: UsuarioNaTela[];
  idDeQuemVe: string;
}) {
  const [aberto, setAberto] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-sm leading-relaxed text-tinta-media">
          Cada pessoa entra com o login e a senha dela, e a função decide o que
          ela vê. A verificação é feita no servidor, em cada tela e em cada
          formulário: esconder o menu seria só conveniência.
        </p>
        <button
          type="button"
          onClick={() => setAberto(aberto === "novo" ? null : "novo")}
          className="rounded-lg bg-tinta px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          {aberto === "novo" ? "Cancelar" : "Novo usuário"}
        </button>
      </div>

      {aberto === "novo" && <FormularioNovo aoFechar={() => setAberto(null)} />}

      <div className="overflow-x-auto">
        <table className="tabela-ancorada w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-borda text-left text-xs uppercase tracking-wider text-tinta-fraca">
              <th className="py-2.5 pr-4 font-semibold">Pessoa</th>
              <th className="py-2.5 pr-4 font-semibold">Função</th>
              <th className="py-2.5 pr-4 font-semibold">Situação</th>
              <th className="py-2.5 pr-4 font-semibold">Desde</th>
              <th className="py-2.5 text-right font-semibold">Ação</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((usuario) => {
              const editando = aberto === `editar-${usuario.id}`;
              const trocandoSenha = aberto === `senha-${usuario.id}`;
              const souEu = usuario.id === idDeQuemVe;

              return (
                <Fragment key={usuario.id}>
                  <tr
                    className={`border-b border-borda ${usuario.ativo ? "" : "opacity-60"}`}
                  >
                    <td className="py-3 pr-4">
                      <p className="font-semibold text-tinta">
                        {usuario.nome}
                        {souEu && (
                          <span className="ml-2 rounded-full bg-fundo px-2 py-0.5 text-xs font-normal text-tinta-media">
                            você
                          </span>
                        )}
                      </p>
                      {/* "login:" escrito por extenso: sem o rotulo, o nome e
                          o login pareciam a mesma coisa em tamanhos
                          diferentes, e trocar um sem trocar o outro virava
                          defeito na cabeca de quem olha. */}
                      <p className="text-xs text-tinta-fraca">
                        login: <span className="numerico">{usuario.usuario}</span>
                      </p>
                    </td>

                    <td className="py-3 pr-4">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          usuario.perfil === "dono"
                            ? "bg-destaque/10 text-destaque"
                            : "bg-fundo text-tinta-media"
                        }`}
                      >
                        {ROTULO_PERFIL[usuario.perfil]}
                      </span>
                      <p className="mt-1 max-w-xs text-xs leading-relaxed text-tinta-fraca">
                        {areasDoPerfil(usuario.perfil)
                          .map((a) => ROTULO_AREA[a] ?? a)
                          .join(" · ")}
                      </p>
                    </td>

                    <td className="py-3 pr-4">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          usuario.ativo
                            ? "bg-real-claro text-real"
                            : "bg-alerta-fundo text-naopago"
                        }`}
                      >
                        {usuario.ativo ? "ativo" : "sem acesso"}
                      </span>
                    </td>

                    <td className="numerico py-3 pr-4 text-xs text-tinta-media">
                      {data(usuario.criadoEm)}
                    </td>

                    <td className="py-3 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setAberto(trocandoSenha ? null : `senha-${usuario.id}`)}
                          className="rounded-md border border-borda-forte bg-superficie px-3 py-1.5 text-sm font-medium text-tinta hover:bg-fundo"
                        >
                          {trocandoSenha ? "Fechar" : "Trocar senha"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setAberto(editando ? null : `editar-${usuario.id}`)}
                          className="rounded-md border border-borda-forte bg-superficie px-3 py-1.5 text-sm font-medium text-tinta hover:bg-fundo"
                        >
                          {editando ? "Fechar" : "Editar"}
                        </button>
                      </div>
                    </td>
                  </tr>

                  {(editando || trocandoSenha) && (
                    <tr>
                      <td colSpan={5} className="p-0 pb-4">
                        <div className="linha-de-edicao">
                          {editando ? (
                            <FormularioEdicao
                              usuario={usuario}
                              souEu={souEu}
                              aoFechar={() => setAberto(null)}
                            />
                          ) : (
                            <FormularioSenha
                              usuario={usuario}
                              aoFechar={() => setAberto(null)}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Aviso({ estado }: { estado: { ok: boolean; mensagem: string } }) {
  if (!estado.mensagem) return null;
  return (
    <p
      className={`rounded-lg px-4 py-3 text-sm ${
        estado.ok
          ? "border border-borda bg-real-claro text-real"
          : "border border-alerta-borda bg-alerta-fundo text-naopago"
      }`}
    >
      {estado.mensagem}
    </p>
  );
}

function EscolhaDeFuncao({ valor }: { valor?: PerfilUsuario }) {
  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium text-tinta">Função</span>
      {PERFIS.map((perfil) => (
        <label
          key={perfil}
          className="flex cursor-pointer gap-3 rounded-lg border border-borda bg-superficie px-3 py-2.5 hover:bg-fundo"
        >
          <input
            type="radio"
            name="perfil"
            value={perfil}
            defaultChecked={(valor ?? "estoque") === perfil}
            className="mt-1"
          />
          <span>
            <span className="block text-sm font-semibold text-tinta">
              {ROTULO_PERFIL[perfil]}
            </span>
            <span className="block text-xs leading-relaxed text-tinta-media">
              {DESCRICAO_PERFIL[perfil]}
            </span>
          </span>
        </label>
      ))}
    </div>
  );
}

const CAMPO =
  "w-full rounded-lg border border-borda-forte bg-superficie px-3 py-2 text-sm text-tinta";

function FormularioNovo({ aoFechar }: { aoFechar: () => void }) {
  const [estado, acao, enviando] = useActionState(criarUsuario, ESTADO_INICIAL);

  return (
    <form action={acao} className="space-y-4 rounded-xl border border-borda bg-fundo p-4 sm:p-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-tinta">Nome</span>
          <input name="nome" required maxLength={80} className={CAMPO} placeholder="Maria Souza" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-tinta">Login</span>
          <input
            name="usuario"
            required
            className={CAMPO}
            placeholder="maria"
            autoComplete="off"
          />
          <span className="mt-1 block text-xs text-tinta-fraca">
            Vira minúsculas, sem acento nem espaço.
          </span>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-tinta">Senha</span>
          <input
            name="senha"
            type="text"
            required
            minLength={TAMANHO_MINIMO_SENHA}
            className={CAMPO}
            autoComplete="new-password"
          />
          <span className="mt-1 block text-xs text-tinta-fraca">
            Mínimo de {TAMANHO_MINIMO_SENHA} caracteres. Aparece na tela para você copiar e
            avisar a pessoa; ela troca depois em Minha conta.
          </span>
        </label>
      </div>

      <EscolhaDeFuncao />
      <Aviso estado={estado} />

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={enviando}
          className="rounded-lg bg-tinta px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {enviando ? "Criando..." : "Criar usuário"}
        </button>
        <button
          type="button"
          onClick={aoFechar}
          className="rounded-lg border border-borda-forte px-4 py-2 text-sm font-medium text-tinta"
        >
          Fechar
        </button>
      </div>
    </form>
  );
}

function FormularioEdicao({
  usuario,
  souEu,
  aoFechar,
}: {
  usuario: UsuarioNaTela;
  souEu: boolean;
  aoFechar: () => void;
}) {
  const [estado, acao, enviando] = useActionState(alterarUsuario, ESTADO_INICIAL);
  const [removendo, setRemovendo] = useState(false);
  const [estadoRemocao, acaoRemocao, removendoAgora] = useActionState(
    removerUsuario,
    ESTADO_INICIAL,
  );

  return (
    <div className="space-y-4 rounded-xl border border-borda bg-fundo p-4 sm:p-5">
      <form action={acao} className="space-y-4">
        <input type="hidden" name="id" value={usuario.id} />
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-tinta">Nome</span>
            <input name="nome" required defaultValue={usuario.nome} maxLength={80} className={CAMPO} />
            <span className="mt-1 block text-xs text-tinta-fraca">
              Como a pessoa aparece na tela.
            </span>
          </label>
          {/* O login e campo proprio, e a explicacao mora aqui porque foi
              exatamente isto que confundiu: trocar o nome nao troca o login. */}
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-tinta">Login</span>
            <input
              name="usuario"
              required
              defaultValue={usuario.usuario}
              className={CAMPO}
              autoComplete="off"
            />
            <span className="mt-1 block text-xs text-tinta-fraca">
              É com isto que ela entra. Trocar aqui muda o login — avise a
              pessoa. Quem já está logado continua até sair.
            </span>
          </label>
          <label className="flex items-end gap-2 pb-2">
            <input
              type="checkbox"
              name="ativo"
              defaultChecked={usuario.ativo}
              className="h-4 w-4"
            />
            <span className="text-sm text-tinta">
              Pode entrar no painel
              <span className="block text-xs text-tinta-fraca">
                Desmarcado, o login continua reservado e a pessoa não entra.
              </span>
            </span>
          </label>
        </div>

        <EscolhaDeFuncao valor={usuario.perfil} />
        {souEu && (
          <p className="text-xs text-tinta-fraca">
            Você não pode tirar o próprio acesso de administrador — peça a outro
            administrador.
          </p>
        )}
        <Aviso estado={estado} />

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={enviando}
            className="rounded-lg bg-tinta px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {enviando ? "Salvando..." : "Salvar"}
          </button>
          <button
            type="button"
            onClick={aoFechar}
            className="rounded-lg border border-borda-forte px-4 py-2 text-sm font-medium text-tinta"
          >
            Fechar
          </button>
        </div>
      </form>

      {/* Remocao em dois passos, na propria linha: `window.confirm` some atras
          de abas no celular e trava a auditoria automatizada. */}
      <div className="border-t border-borda pt-3">
        <Aviso estado={estadoRemocao} />
        {removendo ? (
          <form action={acaoRemocao} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={usuario.id} />
            <span className="text-sm text-tinta">
              Remover {usuario.nome} de vez? Para tirar o acesso sem apagar,
              desmarque "Pode entrar no painel".
            </span>
            <button
              type="submit"
              disabled={removendoAgora}
              className="rounded-lg bg-naopago px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {removendoAgora ? "Removendo..." : "Remover"}
            </button>
            <button
              type="button"
              onClick={() => setRemovendo(false)}
              className="rounded-lg border border-borda-forte px-3 py-1.5 text-sm text-tinta"
            >
              Cancelar
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setRemovendo(true)}
            className="text-sm font-medium text-naopago hover:underline"
          >
            Remover usuário
          </button>
        )}
      </div>
    </div>
  );
}

function FormularioSenha({
  usuario,
  aoFechar,
}: {
  usuario: UsuarioNaTela;
  aoFechar: () => void;
}) {
  const [estado, acao, enviando] = useActionState(definirSenha, ESTADO_INICIAL);

  return (
    <form action={acao} className="space-y-4 rounded-xl border border-borda bg-fundo p-4 sm:p-5">
      <input type="hidden" name="id" value={usuario.id} />
      <label className="block max-w-md">
        <span className="mb-1 block text-sm font-medium text-tinta">
          Nova senha de {usuario.nome}
        </span>
        <input
          name="senha"
          type="text"
          required
          minLength={TAMANHO_MINIMO_SENHA}
          className={CAMPO}
          autoComplete="new-password"
        />
        <span className="mt-1 block text-xs text-tinta-fraca">
          Serve para quando a pessoa esquece a senha. Combine com ela um caminho
          seguro para avisar, e peça que troque em Minha conta.
        </span>
      </label>
      <Aviso estado={estado} />
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={enviando}
          className="rounded-lg bg-tinta px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {enviando ? "Trocando..." : "Trocar senha"}
        </button>
        <button
          type="button"
          onClick={aoFechar}
          className="rounded-lg border border-borda-forte px-4 py-2 text-sm font-medium text-tinta"
        >
          Fechar
        </button>
      </div>
    </form>
  );
}
