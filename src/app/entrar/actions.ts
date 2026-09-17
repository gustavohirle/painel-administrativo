"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { obterRepositorioCadastros } from "@/data";
import { exigirHttpsNoCookie } from "@/lib/config";
import {
  criarTokenSessao,
  DURACAO_SESSAO_SEGUNDOS,
  NOME_COOKIE_SESSAO,
  verificarSenha,
} from "@/lib/auth";
import { origemDaRequisicao } from "@/lib/requisicao";
import {
  chavesDaTentativa,
  esperaEmTexto,
  limparFalhas,
  limparVelhas,
  maiorEspera,
  registrarFalha,
  registro,
} from "@/lib/tentativasLogin";
import { ROTA_INICIAL } from "@/types/usuario";
import type { EstadoFormulario } from "@/types/formulario";

const esquema = z.object({
  usuario: z.string().trim().min(1, "Informe o usuário").max(80),
  senha: z.string().min(1, "Informe a senha").max(200),
});

/**
 * Mensagem unica para usuario inexistente, senha errada e conta desativada.
 *
 * Dizer "usuario nao encontrado" entrega quais logins existem, e a partir dai
 * so falta a senha. A resposta e sempre a mesma, custe o que custar em
 * simpatia.
 */
const RECUSA = "Usuário ou senha inválidos.";

export async function entrar(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const analise = esquema.safeParse({
    usuario: formData.get("usuario"),
    senha: formData.get("senha"),
  });

  if (!analise.success) {
    return {
      ok: false,
      mensagem: analise.error.issues[0]?.message ?? RECUSA,
    };
  }

  /*
   * Limite de tentativas ANTES de olhar o cadastro (secao 5.13.2).
   *
   * A espera vale por login e por endereco, contados separadamente: quem
   * ataca uma conta especifica bate no primeiro; quem varre logins, no
   * segundo. A conta so e consultada quando ha tentativa disponivel -- senao
   * um programa insistindo faria o painel rodar scrypt sem parar, que e um
   * jeito de derrubar o servidor sem acertar senha nenhuma.
   */
  const tentativas = registro();
  const agora = Date.now();
  limparVelhas(tentativas, agora);
  const { ip } = await origemDaRequisicao();
  const chaves = chavesDaTentativa(analise.data.usuario, ip);

  const espera = maiorEspera(tentativas, chaves, agora);
  if (espera > 0) {
    return {
      ok: false,
      mensagem: `Muitas tentativas. Tente de novo em ${esperaEmTexto(espera)}.`,
    };
  }

  const repositorio = await obterRepositorioCadastros();
  const usuario = await repositorio.buscarUsuarioPorLogin(analise.data.usuario);

  // O scrypt roda mesmo sem usuario encontrado: sem isso, a resposta volta
  // instantaneamente para login inexistente e devagar para login existente --
  // e o tempo de resposta vira um oraculo de quais contas existem.
  const senhaConfere = await verificarSenha(analise.data.senha, {
    senhaHash: usuario?.senhaHash ?? "00".repeat(64),
    senhaSal: usuario?.senhaSal ?? "sal-inexistente",
  });

  if (!usuario || !usuario.ativo || !senhaConfere) {
    registrarFalha(tentativas, chaves, Date.now());
    return { ok: false, mensagem: RECUSA };
  }

  // Acertou: a contagem do login e a do endereco zeram.
  limparFalhas(tentativas, chaves);

  const jar = await cookies();
  jar.set(NOME_COOKIE_SESSAO, criarTokenSessao(usuario.id, usuario.perfil), {
    httpOnly: true,
    sameSite: "lax",
    secure: exigirHttpsNoCookie(),
    path: "/",
    maxAge: DURACAO_SESSAO_SEGUNDOS,
  });

  // Fora do try/catch: `redirect` sinaliza por excecao, e engoli-la deixaria
  // o usuario autenticado parado na tela de login.
  redirect(ROTA_INICIAL[usuario.perfil]);
}

export async function sair(): Promise<void> {
  const jar = await cookies();
  jar.delete(NOME_COOKIE_SESSAO);
  redirect("/entrar");
}
