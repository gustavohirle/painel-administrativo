/**
 * Conferencia das credenciais de marketplace.
 *
 *     npm run canais:conferir
 *
 * Diz o que o painel LEU do `.env.live`, sem chamar API nenhuma. Existe porque
 * colar seis campos por conta, em tres marketplaces que chamam cada um pelo
 * seu nome, e onde os erros acontecem -- e um bloco pela metade so daria sinal
 * quando a busca falhasse, dias depois.
 *
 * NAO IMPRIME SEGREDO. O identificador do aplicativo aparece inteiro (ele nao
 * e secreto e e por ele que se confere a conta); o segredo e o token saem
 * mascarados, com os quatro ultimos digitos, que e o bastante para comparar
 * com o que esta na tela do marketplace.
 */

import { contasDeCanal } from "../src/lib/config";
import { contasComToken, tokenDaConta } from "../src/data/tokensCanais";
import {
  chaveDaConta,
  mascarar,
  NOMES_DA_CREDENCIAL,
  ROTULO_CANAL,
} from "../src/types/canais";

async function main() {
  let contas;
  try {
    contas = contasDeCanal();
  } catch (erro) {
    console.error(`\n  ${erro instanceof Error ? erro.message : String(erro)}\n`);
    process.exitCode = 1;
    return;
  }

  if (contas.length === 0) {
    console.log("\nNenhuma conta de marketplace configurada.");
    console.log("Preencha os blocos CANAL_<n>_* no .env.live (modelo em .env.live.example).\n");
    return;
  }

  const comToken = new Set(await contasComToken());

  console.log(`\n${contas.length} conta(s) de marketplace no .env.live:\n`);

  for (const conta of contas) {
    const nomes = NOMES_DA_CREDENCIAL[conta.canal];
    const guardado = await tokenDaConta(conta);
    const id = chaveDaConta(conta.canal, conta.lojaId);

    console.log(`  ${ROTULO_CANAL[conta.canal]}  ->  marca "${conta.marca}"`);
    console.log(`    ${nomes.lojaId.padEnd(22)} ${conta.lojaId}`);
    console.log(`    ${nomes.chave.padEnd(22)} ${conta.chave}`);
    console.log(`    ${nomes.segredo.padEnd(22)} ${mascarar(conta.segredo)}`);

    if (!guardado) {
      console.log(`    ${"token".padEnd(22)} ainda nao autorizado`);
    } else {
      const origem = comToken.has(id) ? "guardado em .live-data" : "do .env.live";
      console.log(`    ${"token".padEnd(22)} ${mascarar(guardado.token)}  (${origem})`);
      if (guardado.expiraEm) {
        const vencido = new Date(guardado.expiraEm).getTime() < Date.now();
        console.log(
          `    ${"expira em".padEnd(22)} ${guardado.expiraEm}${vencido ? "  -- VENCIDO" : ""}`,
        );
      }
    }
    console.log("");
  }

  /*
   * A marca e CHAVE (armadilha 9): sem um contrato com exatamente este texto,
   * o faturamento do canal nao casaria com influencer nenhum e ficaria fora de
   * comissao, imposto e lucro. Nao da para conferir isso aqui -- o cadastro
   * esta no banco, e este script nao abre o banco de proposito --, entao o
   * aviso fica escrito.
   */
  const marcas = [...new Set(contas.map((c) => c.marca))];
  console.log("Confira na aba Influencers que existe contrato para:");
  for (const marca of marcas) console.log(`  - "${marca}"`);
  console.log("  (a grafia precisa bater, com acento e maiusculas)\n");

  console.log("A BUSCA AINDA NAO EXISTE: preencher isto nao traz pedido nenhum.");
  console.log("O painel continua mostrando so a Nuvemshop (secao 9, Fase 4).\n");
}

main().catch((erro: unknown) => {
  console.error(erro);
  process.exitCode = 1;
});
