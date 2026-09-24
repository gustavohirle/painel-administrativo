/**
 * Redefine a senha de um usuario do painel, direto no banco.
 *
 *     npm run senha -- <login>
 *
 * A senha NOVA vem pela entrada padrao, nunca como argumento: argumento
 * aparece na lista de processos do servidor e no historico do shell.
 *
 *     echo 'a-senha' | npm run senha -- valmir
 *
 * Existe para o caso de alguem ficar tranc/ado do lado de fora -- que e o unico
 * caminho quando nao ha outro administrador para redefinir pela tela. O
 * caminho normal continua sendo `/usuarios` (outra pessoa) ou `/conta` (a
 * propria, com a senha atual).
 *
 * A senha passa pelas MESMAS travas da tela (`problemaNaSenha`): nao adianta
 * ter uma porta dos fundos que aceita o que a porta da frente recusa.
 */

import { RepositorioPostgres } from "@/data/prismaCostRepository";
import { criarHashSenha } from "@/lib/auth";
import { problemaNaSenha } from "@/lib/usuarios";

async function lerDaEntrada(): Promise<string> {
  const pedacos: Buffer[] = [];
  for await (const pedaco of process.stdin) pedacos.push(pedaco as Buffer);
  // So a primeira linha, e sem o \n: `echo` acrescenta um, e uma senha com
  // quebra no fim nunca mais seria digitada igual.
  return Buffer.concat(pedacos).toString("utf8").split(/\r?\n/)[0] ?? "";
}

async function main() {
  const login = process.argv[2]?.trim().toLowerCase();
  if (!login) {
    console.error("\n  Uso: echo 'a-senha' | npm run senha -- <login>\n");
    process.exitCode = 1;
    return;
  }

  const repositorio = new RepositorioPostgres();
  const usuarios = await repositorio.listarUsuarios();
  const usuario = usuarios.find((u) => u.usuario === login);

  if (!usuario) {
    console.error(
      `\n  Não há usuário "${login}". Existem: ${usuarios.map((u) => u.usuario).join(", ")}\n`,
    );
    process.exitCode = 1;
    return;
  }

  const senha = await lerDaEntrada();
  if (senha === "") {
    console.error("\n  Nenhuma senha veio pela entrada padrão.\n");
    process.exitCode = 1;
    return;
  }

  const problema = problemaNaSenha(senha, usuario.usuario);
  if (problema) {
    console.error(`\n  ${problema}\n`);
    process.exitCode = 1;
    return;
  }

  await repositorio.salvarUsuario({
    ...usuario,
    ...(await criarHashSenha(senha)),
    atualizadoEm: new Date().toISOString(),
  });

  console.log(`\n  Senha de "${usuario.usuario}" (${usuario.nome}) redefinida.`);
  console.log("  As sessões abertas dele continuam valendo até expirar.\n");
}

main().catch((erro: unknown) => {
  console.error(erro);
  process.exitCode = 1;
});
