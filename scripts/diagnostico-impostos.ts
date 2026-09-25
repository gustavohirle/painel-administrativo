/**
 * Os impostos de UMA marca num mes, tributo a tributo, com as bases.
 *
 *     npm run impostos:marca -- "Tha Beauty TikTok" 2026-08
 *
 * Existe para responder "por que o simulador diz X% de imposto": o simulador
 * divide o imposto do mes pelo RECEBIDO, e o imposto incide sobre o FATURADO
 * sem cancelados e reembolsados (5.1.1). Aqui aparecem as bases lado a lado, e
 * cada linha da apuracao.
 * Mesmas funcoes da tela; nenhuma conta propria alem das divisoes do resumo.
 */

import { lerCache } from "@/data/cachePedidos";
import { pedidosDoTikTok } from "@/data/tiktokSource";
import { RepositorioPostgres } from "@/data/prismaCostRepository";
import { chaveMes, filtrarPorMes, reconciliar } from "@/lib/metrics";
import { apurarImpostos } from "@/lib/impostos";
import { paraNumero } from "@/types/nuvemshop";

const reais = (n: number) =>
  "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

async function main() {
  const [marca, mes] = process.argv.slice(2);
  if (!marca || !mes) {
    console.error('Uso: npm run impostos:marca -- "<marca>" <aaaa-mm>');
    process.exit(1);
  }

  const repositorio = new RepositorioPostgres();
  const [{ pedidos: daNuvemshop }, doTikTok] = await Promise.all([lerCache(), pedidosDoTikTok()]);
  const pedidos = [...daNuvemshop, ...doTikTok];
  const [produtos, influencers, impostos, aliquotas] = await Promise.all([
    repositorio.listarProdutos(),
    repositorio.listarInfluencers(),
    repositorio.listarImpostos(),
    repositorio.listarAliquotasEstaduais(),
  ]);

  const doMes = filtrarPorMes(pedidos, mes);
  const historico = pedidos.filter((p) => chaveMes(p.created_at) <= mes);
  const apuracao = apurarImpostos(doMes, historico, produtos, impostos, influencers, aliquotas);
  const daMarca = doMes.filter((p) => p.marca === marca);
  const r = reconciliar(daMarca);
  const a = apuracao.porInfluencer.find((x) => x.marca === marca);
  if (!a) {
    console.error(`Nenhuma apuracao para "${marca}" em ${mes}.`);
    process.exit(1);
  }

  const itens = daMarca.reduce(
    (s, p) => s + p.products.reduce((t, i) => t + paraNumero(i.price) * i.quantity, 0),
    0,
  );

  console.log(`\n${marca} -- ${mes} -- ${a.regime}\n`);
  console.log(`pedidos criados        ${daMarca.length}`);
  console.log(`faturado (com frete)   ${reais(r.bruto)}`);
  console.log(`  soma dos itens       ${reais(itens)}   (preco x quantidade, todos os pedidos)`);
  console.log(`  nao pago             ${reais(r.naoPago)}`);
  console.log(`  cancelado            ${reais(r.cancelado)}`);
  console.log(`  reembolsado          ${reais(r.reembolsado)}`);
  console.log(`base do imposto        ${reais(r.faturadoTributavel)}   <- faturado - cancelado - reembolsado (5.1.1)`);
  console.log(`recebido               ${reais(r.recebido)}   <- o simulador divide por este`);
  console.log(`base / recebido        ${(r.faturadoTributavel / r.recebido).toFixed(3)}x\n`);

  console.log("tributo      aliquota         base            valor    % do faturado   % do recebido");
  let semDifal = 0;
  for (const l of a.linhas) {
    const ehDifal = l.sigla.toUpperCase().includes("DIFAL");
    if (!ehDifal) semDifal += l.valor;
    console.log(
      `${l.sigla.padEnd(10)} ${pct(l.aliquota / 100).padStart(9)} ${reais(l.base).padStart(16)} ${reais(l.valor).padStart(15)}` +
        `   ${pct(l.valor / r.bruto).padStart(8)}        ${pct(l.valor / r.recebido).padStart(8)}` +
        (l.porProduto ? "   (por produto)" : ""),
    );
  }
  console.log(
    `\nimpostos sem DIFAL     ${reais(semDifal)}  = ${pct(semDifal / r.bruto)} do faturado, ${pct(semDifal / r.recebido)} do recebido (o que o simulador mostra)`,
  );
  console.log(`DIFAL                  ${reais(a.difal.total)}  = ${pct(a.difal.total / r.recebido)} do recebido`);
  process.exit(0);
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
