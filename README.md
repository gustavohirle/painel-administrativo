# Painel Administrativo

Painel financeiro para lojas Nuvemshop. Cruza os pedidos da API com os custos
de fabricação e os contratos de comissão de influencers, para responder três
perguntas que o painel da própria Nuvemshop não responde:

1. **Quanto realmente entrou?** Faturamento bruto inclui pedido cancelado,
   reembolsado e boleto que nunca foi pago.
2. **Quanto sobrou depois de fabricar?** Custo de matéria-prima, embalagem,
   mão de obra e rateio indireto por produto.
3. **Quanto sobrou depois das comissões?** Contratos de influencer com base de
   cálculo configurável.

---

## Como rodar

Requisitos: **Node.js 20 ou superior**.

```bash
npm install
npm run dev
```

Abre em <http://localhost:3000>.

Sem nenhuma configuração, o painel sobe em **modo demonstração**: dados
fictícios determinísticos, sem banco, sem internet. É o modo usado para
apresentar o projeto.

### Testes

```bash
npm test
```

Cobrem as funções puras de cálculo (`lib/metrics.ts` e `lib/costing.ts`) e
verificam que os totais da base de demonstração batem com o cenário esperado.

---

## Telas

| Rota | O que faz |
|---|---|
| `/` | Cascata do faturamento, simulador de comissão, raio-x do resultado, meios de pagamento, evolução de 6 meses |
| `/custos` | Cadastro de custo de fabricação por produto/variante, com margem calculada ao vivo |
| `/comissoes` | Cadastro de influencers e da base de cálculo de cada contrato |

O seletor de mês no topo vale para as três telas.

---

## Modo demonstração x modo real

Controlado por `FONTE_DADOS` no `.env`.

| | `demo` (padrão) | `live` |
|---|---|---|
| Pedidos | gerador determinístico com seed fixo | API da Nuvemshop |
| Custos e comissões | arquivo local `.demo-data/` | PostgreSQL via Prisma |
| Internet | dispensável | obrigatória |
| Selo "Dados de demonstração" | visível | oculto |

O `if` que decide entre os dois vive num lugar só: [`src/data/index.ts`](src/data/index.ts).
As funções de cálculo não sabem qual modo está ativo.

### Ligando o modo real

1. Copie `.env.example` para `.env`.
2. Preencha as credenciais da Nuvemshop. Uma loja por marca:

   ```env
   NUVEMSHOP_LOJAS='[{"marca":"Aurora Beleza","storeId":"123","accessToken":"abc"}]'
   ```

   Ou, para uma loja só, `NUVEMSHOP_STORE_ID` + `NUVEMSHOP_ACCESS_TOKEN`.
3. Crie um banco no [Neon](https://neon.tech) e cole a connection string em
   `DATABASE_URL`.
4. Prepare o banco:

   ```bash
   npm run db:push
   npm run db:seed
   ```

5. Troque `FONTE_DADOS=live` e reinicie.

Depois de ligar, confira os totais de um mês já fechado contra o painel da
própria Nuvemshop antes de mostrar para alguém.

---

## Como o cálculo funciona

Toda a regra de negócio vive em dois arquivos puros — sem React, sem I/O:

- [`src/lib/metrics.ts`](src/lib/metrics.ts) — reconciliação de faturamento,
  comissão, agrupamento por marca e por meio de pagamento, evolução mensal.
- [`src/lib/costing.ts`](src/lib/costing.ts) — CMV, comissões por contrato,
  DRE e rentabilidade por produto.

A cascata de reconciliação é:

```
bruto − não pago − cancelado − reembolsado = recebido
recebido − frete = receita real
receita real − CMV = margem de contribuição
margem de contribuição − comissões = lucro operacional
```

Cada pedido entra em **exatamente uma** categoria de dedução, seguindo a
precedência `cancelado > reembolsado > não pago > recebido`. Sem isso, um
pedido cancelado e pendente seria contado duas vezes e a cascata não fecharia.

### Produtos sem custo cadastrado

Não somem do cálculo em silêncio. O painel mostra quantos são e quanta receita
representam, e o lucro operacional é declarado como calculado sobre o restante.

---

## Estrutura

```
src/
  types/nuvemshop.ts    tipos espelhando a API oficial
  types/dominio.ts      custo de fabricação e contrato de comissão
  data/                 fontes de dados e repositórios (demo e real)
  lib/                  cálculo puro, formatação pt-BR, config
  components/           interface
  app/                  rotas do App Router e Server Actions
prisma/schema.prisma    só custo e comissão -- pedidos não são replicados
```

Documentação de contexto do projeto: [CLAUDE.md](CLAUDE.md).

---

## Aviso

Os dados de demonstração são inteiramente fictícios. Marcas, produtos, clientes
e influencers foram inventados e não correspondem a nenhuma empresa ou pessoa
real.
