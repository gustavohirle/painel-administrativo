import { dataHora } from "@/lib/format";

/**
 * Rodape com a origem dos numeros.
 *
 * Junto com o selo do cabecalho, garante que ninguem saia da reuniao achando
 * que viu os numeros reais da propria empresa.
 */
export async function RodapeDemonstracao({ demonstracao }: { demonstracao: boolean }) {
  if (!demonstracao) {
    // Import dinamico: o modo demonstracao nunca carrega o cliente da API.
    const { estadoDaSincronizacao } = await import("@/data/cachePedidos");
    const estado = await estadoDaSincronizacao();

    return (
      <footer className="space-y-2 pt-2 pb-6 text-xs text-tinta-fraca">
        <p>
          Dados lidos da API da Nuvemshop
          {estado.atualizadoEm ? `, atualizados em ${dataHora(estado.atualizadoEm)}` : ""}
          {estado.sincronizando ? " (buscando novidades agora)" : ""}. Custos de
          fabricação e comissões vêm dos cadastros deste painel.
        </p>
        {estado.lojasPendentes.length > 0 && (
          <p className="rounded-lg border border-alerta-borda bg-alerta-fundo px-4 py-3 text-sm text-naopago">
            {estado.lojasPendentes.length === 1
              ? `A loja ${estado.lojasPendentes[0]} ainda não entrou nos números acima`
              : `As lojas ${estado.lojasPendentes.join(", ")} ainda não entraram nos números acima`}
            {estado.sincronizando
              ? ": os pedidos estão sendo buscados agora. A primeira busca leva alguns minutos."
              : "."}
          </p>
        )}
        {estado.ultimoErro && (
          <p className="rounded-lg border border-alerta-borda bg-alerta-fundo px-4 py-3 text-sm text-naopago">
            A última atualização com a Nuvemshop falhou, e a loja com problema
            ficou com a cópia anterior. Motivo: {estado.ultimoErro}
          </p>
        )}
      </footer>
    );
  }

  return (
    <footer className="rounded-xl border border-alerta-borda bg-alerta-fundo px-6 py-5">
      <p className="text-sm font-semibold text-naopago">
        Todos os números desta tela são fictícios
      </p>
      <p className="mt-1 max-w-4xl text-sm leading-relaxed text-tinta-media">
        Marcas, produtos, clientes e influencers foram inventados para esta
        demonstração. Nenhum dado real de loja foi utilizado. A estrutura de
        cálculo, essa sim, é a definitiva: quando a integração com a Nuvemshop
        for ligada, as mesmas contas passam a rodar sobre os pedidos reais.
      </p>
    </footer>
  );
}
