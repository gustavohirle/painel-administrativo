/**
 * Pedidos do TikTok Shop, na mao (secao 15).
 *
 *     npm run tiktok:sincronizar            # ultimos meses (NUVEMSHOP_MESES)
 *     npm run tiktok:sincronizar -- --meses 3
 *
 * Como na Nuvemshop, quem busca e este comando: as paginas leem o disco e
 * nunca esperam a API. O token e renovado sozinho quando esta perto de vencer.
 */

import { mesesNuvemshop } from "@/lib/config";
import { pedidosDoTikTok, sincronizarTikTok } from "@/data/tiktokSource";
import { classificarPedido, reconciliar } from "@/lib/metrics";

const reais = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function argumento(nome: string, padrao: string): string {
  const i = process.argv.indexOf(`--${nome}`);
  return i !== -1 ? (process.argv[i + 1] ?? padrao) : padrao;
}

async function main() {
  const meses = Number(argumento("meses", String(mesesNuvemshop())));
  if (!Number.isInteger(meses) || meses < 1 || meses > 36) {
    console.error("--meses precisa ser um numero de 1 a 36.");
    process.exitCode = 1;
    return;
  }

  console.log(`Buscando ${meses} mes(es) de pedidos do TikTok Shop.\n`);
  const inicio = Date.now();
  let ultima = "";

  const resultados = await sincronizarTikTok(meses, ({ marca, etapa, pedidos }) => {
    const linha = `  ${marca}: ${etapa} (${pedidos} pedidos ate aqui)`;
    if (linha !== ultima) console.log(linha);
    ultima = linha;
  });

  if (resultados.length === 0) {
    console.log("Nenhuma conta de TikTok Shop configurada no .env.live.");
    return;
  }

  const segundos = Math.round((Date.now() - inicio) / 1000);
  console.log(`\nPronto em ${segundos}s.`);

  const todos = await pedidosDoTikTok();
  for (const r of resultados) {
    const daMarca = todos.filter((p) => p.marca === r.marca);
    const contas = reconciliar(daMarca);
    const situacoes = new Map<string, number>();
    for (const p of daMarca) {
      const chave = classificarPedido(p);
      situacoes.set(chave, (situacoes.get(chave) ?? 0) + 1);
    }

    console.log(`\n${r.marca}: ${r.pedidos} pedido(s) no disco (${r.novosIds} id(s) novo(s))`);
    console.log(`  faturamento bruto: ${reais(contas.bruto)}`);
    console.log(`  recebido:          ${reais(contas.recebido)}`);
    console.log(`  receita real:      ${reais(contas.receitaReal)}`);
    if (contas.freteAbsorvido > 0) {
      console.log(`  frete que a loja bancou: ${reais(contas.freteAbsorvido)}`);
    }
    console.log(
      `  como o painel classifica: ${[...situacoes.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k} (${v})`)
        .join(", ")}`,
    );
  }

  console.log(
    "\nCadastre o contrato do influencer com a MESMA marca, e traga os produtos" +
      "\nem Produtos -> Trazer da Nuvemshop (ele junta as vendas de todos os canais).",
  );
}

main().catch((erro) => {
  console.error(`\n${erro instanceof Error ? erro.message : String(erro)}\n`);
  process.exitCode = 1;
});
