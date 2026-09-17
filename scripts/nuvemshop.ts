/**
 * Ferramentas da integracao com a Nuvemshop. Leem o `.env.live`.
 *
 *   npm run nuvemshop:testar          confere cada loja sem gravar nada
 *   npm run nuvemshop:sincronizar     busca os pedidos e grava o cache
 *   npm run nuvemshop:sincronizar -- --completa   ignora o cache e busca tudo
 *   npm run nuvemshop:token -- CODIGO troca o codigo de autorizacao pela chave
 *
 * O `testar` e o primeiro passo depois de colar a chave (ver DADOS_REAIS.md):
 * ele prova que a chave vale e mostra COMO os pedidos reais chegam -- quais
 * campos faltam, que meios de pagamento e status aparecem. E ali que se
 * descobre se a API real difere do formato que o painel espera, antes de
 * qualquer numero ir para a tela.
 */

import { buscarDadosDaLoja, buscarPedidosDaLoja } from "@/data/apiSource";
import { sincronizar } from "@/data/cachePedidos";
import { baseUrlNuvemshop, lojasNuvemshop, mesesNuvemshop } from "@/lib/config";
import { situacoesDesconhecidas } from "@/lib/nuvemshop";
import { classificarPedido } from "@/lib/metrics";
import { normalizarMetodoPagamento, paraNumero } from "@/types/nuvemshop";

const reais = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function contar<T>(itens: T[], chave: (item: T) => string): string {
  const mapa = new Map<string, number>();
  for (const item of itens) mapa.set(chave(item), (mapa.get(chave(item)) ?? 0) + 1);
  return [...mapa.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} (${v})`)
    .join(", ");
}

async function testar() {
  const lojas = lojasNuvemshop();
  if (lojas.length === 0) {
    console.error("Nenhuma loja configurada. Preencha os blocos NUVEMSHOP_LOJA_<n>_* no .env.live.");
    process.exitCode = 1;
    return;
  }

  console.log(`API: ${baseUrlNuvemshop()}`);
  console.log(`${lojas.length} loja(s) configurada(s)\n`);

  const desde = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  let falhou = false;

  for (const loja of lojas) {
    console.log(`== ${loja.marca} (loja ${loja.storeId})`);
    try {
      const dados = await buscarDadosDaLoja(loja);
      console.log(`  chave aceita. Nome na Nuvemshop: "${dados.nome}"`);
      if (dados.moeda && dados.moeda !== "BRL") {
        console.log(`  ATENÇÃO: moeda da loja é ${dados.moeda}; o painel formata tudo em reais.`);
      }

      const convertidos = await buscarPedidosDaLoja(loja, { criadosDesde: desde });
      const pedidos = convertidos.map((c) => c.pedido);
      console.log(`  pedidos dos últimos 7 dias: ${pedidos.length}`);
      if (pedidos.length === 0) {
        console.log("  (nenhum pedido na semana; a conversão não pôde ser conferida)\n");
        continue;
      }

      const bruto = pedidos.reduce((s, p) => s + paraNumero(p.total), 0);
      const frete = pedidos.reduce((s, p) => s + paraNumero(p.shipping_cost_customer), 0);
      console.log(`  faturamento bruto da semana: ${reais(bruto)} (frete: ${reais(frete)})`);
      console.log(`  como o painel classifica: ${contar(pedidos, classificarPedido)}`);
      console.log(`  status do pedido: ${contar(pedidos, (p) => p.status)}`);
      console.log(`  status do pagamento: ${contar(pedidos, (p) => p.payment_status)}`);
      console.log(
        `  meios de pagamento (como chegam -> como o painel entende): ${contar(
          pedidos,
          (p) => `${p.payment_details.method ?? "vazio"} -> ${normalizarMetodoPagamento(p.payment_details.method)}`,
        )}`,
      );
      console.log(`  estados de destino: ${contar(pedidos, (p) => p.shipping_address?.province ?? "vazio")}`);

      const faltas = new Map<string, number>();
      for (const c of convertidos) for (const campo of c.ausentes) faltas.set(campo, (faltas.get(campo) ?? 0) + 1);
      if (faltas.size > 0) {
        console.log("  campos que vieram vazios:");
        for (const [campo, n] of faltas) console.log(`    ${campo}: ${n} de ${pedidos.length} pedidos`);
      } else {
        console.log("  todos os campos usados pelo painel vieram preenchidos");
      }

      const estranhas = situacoesDesconhecidas(pedidos);
      if (Object.keys(estranhas).length > 0) {
        console.log(`  ATENÇÃO, status que o painel não conhece (contam como recebido): ${JSON.stringify(estranhas)}`);
      }

      if (dados.nome && dados.nome.trim().toLowerCase() !== loja.marca.toLowerCase()) {
        console.log(
          `  obs.: a marca configurada ("${loja.marca}") é diferente do nome da loja. Tudo bem, mas os contratos precisam usar exatamente "${loja.marca}".`,
        );
      }
      console.log("");
    } catch (erro) {
      falhou = true;
      console.log(`  FALHOU: ${erro instanceof Error ? erro.message : String(erro)}\n`);
    }
  }

  if (falhou) process.exitCode = 1;
  else console.log("Conexão ok. Próximo passo: npm run nuvemshop:sincronizar");
}

async function sincronizarAgora(completa: boolean) {
  console.log(
    `Buscando ${completa ? "todos os pedidos" : "o que falta"} dos últimos ${mesesNuvemshop()} meses. Pode levar alguns minutos na primeira vez.\n`,
  );
  const inicio = Date.now();
  let ultimaLinha = "";
  const { base, falhas } = await sincronizar({
    completa,
    aoAvancar: ({ loja, etapa, pedidos }) => {
      const linha = `  ${loja}: ${etapa} (${pedidos} pedidos até aqui)`;
      if (linha !== ultimaLinha) console.log(linha);
      ultimaLinha = linha;
    },
  });

  const segundos = Math.round((Date.now() - inicio) / 1000);
  console.log(`\n${base.pedidos.length} pedidos e ${base.carrinhos.length} carrinhos no cache (${segundos}s).`);
  const porMarca = contar(base.pedidos, (p) => p.marca);
  console.log(`Por marca: ${porMarca}`);
  const estranhas = situacoesDesconhecidas(base.pedidos);
  if (Object.keys(estranhas).length > 0) {
    console.log(`ATENÇÃO, status desconhecidos: ${JSON.stringify(estranhas)}`);
  }
  if (falhas.length > 0) {
    console.log("\nLojas que falharam (ficaram com a cópia anterior, se havia):");
    for (const f of falhas) console.log(`  ${f.marca} (loja ${f.storeId}): ${f.motivo}`);
    process.exitCode = 1;
  }
}

async function trocarCodigo(codigo: string | undefined) {
  const clientId = process.env.NUVEMSHOP_CLIENT_ID;
  const clientSecret = process.env.NUVEMSHOP_CLIENT_SECRET;
  if (!codigo || !clientId || !clientSecret) {
    console.error(
      "Uso: npm run nuvemshop:token -- CODIGO\n" +
        "Precisa de NUVEMSHOP_CLIENT_ID e NUVEMSHOP_CLIENT_SECRET no .env.live.\n" +
        "O CODIGO vem no endereço para onde a Nuvemshop redireciona depois de instalar o aplicativo (?code=...).",
    );
    process.exitCode = 1;
    return;
  }

  const resposta = await fetch("https://www.tiendanube.com/apps/authorize/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code: codigo,
    }),
  });
  const corpo = (await resposta.json().catch(() => ({}))) as Record<string, unknown>;
  if (!resposta.ok || typeof corpo.access_token !== "string") {
    console.error(`A Nuvemshop recusou o código (${resposta.status}): ${JSON.stringify(corpo)}`);
    console.error("O código vale uma vez e por pouco tempo. Instale o aplicativo de novo para gerar outro.");
    process.exitCode = 1;
    return;
  }

  console.log("Chave gerada. Ela não expira. Preencha um bloco livre no .env.live (troque N pelo");
  console.log("número do bloco e NOME DA MARCA pelo nome exato que o contrato do influencer vai usar):\n");
  console.log('NUVEMSHOP_LOJA_N_MARCA="NOME DA MARCA"');
  console.log(`NUVEMSHOP_LOJA_N_STORE_ID=${String(corpo.user_id)}`);
  console.log(`NUVEMSHOP_LOJA_N_TOKEN=${String(corpo.access_token)}`);
  console.log(`\nPermissões concedidas: ${String(corpo.scope ?? "")}`);
}

const [comando, ...resto] = process.argv.slice(2);

const execucao =
  comando === "testar"
    ? testar()
    : comando === "sincronizar"
      ? sincronizarAgora(resto.includes("--completa"))
      : comando === "token"
        ? trocarCodigo(resto[0])
        : Promise.resolve().then(() => {
            console.error("Comandos: testar | sincronizar [--completa] | token CODIGO");
            process.exitCode = 1;
          });

execucao.catch((erro) => {
  console.error(`\nFALHOU: ${erro instanceof Error ? erro.message : String(erro)}`);
  process.exitCode = 1;
});
