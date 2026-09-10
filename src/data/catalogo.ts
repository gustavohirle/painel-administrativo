/**
 * Catalogo ficticio de marcas e produtos.
 *
 * IMPORTANTE: todos os nomes sao INVENTADOS. Nenhuma marca, produto ou
 * influencer aqui corresponde a algo real -- isso e requisito, nao detalhe.
 *
 * Este catalogo e a fonte compartilhada entre o gerador de pedidos e o
 * cadastro de custos de demonstracao: os dois precisam falar dos MESMOS
 * `product_id`, senao o vinculo custo <-> venda nao fecha.
 */

export interface VarianteCatalogo {
  id: number;
  rotulo: string;
  preco: number;
  /** Custo de fabricacao "verdadeiro", usado para semear o cadastro de custos. */
  custoFabricacao: number;
}

export interface ProdutoCatalogo {
  id: number;
  nome: string;
  sku: string;
  /** Peso relativo de popularidade dentro da marca. */
  popularidade: number;
  variantes: VarianteCatalogo[];
}

export interface MarcaCatalogo {
  nome: string;
  /** Fracao dos pedidos do periodo que pertencem a esta marca. */
  participacao: number;
  /**
   * Mix de meios de pagamento da marca. Publicos diferentes pagam diferente --
   * e disso que nasce a variacao de inadimplencia entre as marcas.
   */
  mixPagamento: { credit_card: number; pix: number; boleto: number };
  produtos: ProdutoCatalogo[];
}

export const MARCAS: MarcaCatalogo[] = [
  {
    nome: "Aurora Beleza",
    participacao: 0.3,
    mixPagamento: { credit_card: 0.58, pix: 0.27, boleto: 0.15 },
    produtos: [
      {
        id: 1001,
        nome: "Kit Reconstrucao Aurora",
        sku: "AUR-KIT-REC",
        popularidade: 22,
        variantes: [
          { id: 100101, rotulo: "300ml", preco: 189, custoFabricacao: 61.4 },
          { id: 100102, rotulo: "500ml", preco: 259, custoFabricacao: 84.9 },
        ],
      },
      {
        id: 1002,
        nome: "Shampoo Aurora Nutricao",
        sku: "AUR-SHP-NUT",
        popularidade: 30,
        variantes: [
          { id: 100201, rotulo: "300ml", preco: 89, custoFabricacao: 25.8 },
          { id: 100202, rotulo: "500ml", preco: 129, custoFabricacao: 36.2 },
        ],
      },
      {
        id: 1003,
        nome: "Mascara Capilar Aurora",
        sku: "AUR-MSC-CAP",
        popularidade: 24,
        variantes: [
          { id: 100301, rotulo: "250g", preco: 119, custoFabricacao: 34.7 },
          { id: 100302, rotulo: "500g", preco: 179, custoFabricacao: 52.1 },
        ],
      },
      {
        id: 1004,
        nome: "Oleo Finalizador Aurora",
        sku: "AUR-OLE-FIN",
        popularidade: 14,
        variantes: [
          { id: 100401, rotulo: "60ml", preco: 79, custoFabricacao: 19.6 },
          { id: 100402, rotulo: "120ml", preco: 119, custoFabricacao: 29.4 },
        ],
      },
      {
        id: 1005,
        nome: "Leave-in Aurora Protect",
        sku: "AUR-LVI-PRT",
        popularidade: 10,
        variantes: [
          { id: 100501, rotulo: "150ml", preco: 69, custoFabricacao: 21.3 },
          { id: 100502, rotulo: "300ml", preco: 99, custoFabricacao: 29.8 },
        ],
      },
    ],
  },
  {
    nome: "Luma Cosmeticos",
    participacao: 0.24,
    // Publico de maior renda: quase tudo no cartao, quase nada de boleto.
    mixPagamento: { credit_card: 0.72, pix: 0.23, boleto: 0.05 },
    produtos: [
      {
        id: 2001,
        nome: "Serum Vitamina C Luma",
        sku: "LUM-SER-VTC",
        popularidade: 28,
        variantes: [
          { id: 200101, rotulo: "30ml", preco: 189, custoFabricacao: 48.2 },
          { id: 200102, rotulo: "60ml", preco: 299, custoFabricacao: 74.5 },
        ],
      },
      {
        id: 2002,
        nome: "Protetor Solar Luma FPS 60",
        sku: "LUM-PRT-S60",
        popularidade: 26,
        variantes: [
          { id: 200201, rotulo: "50g", preco: 129, custoFabricacao: 41.8 },
          { id: 200202, rotulo: "120g", preco: 209, custoFabricacao: 66.3 },
        ],
      },
      {
        id: 2003,
        nome: "Creme Antissinais Luma",
        sku: "LUM-CRM-ANT",
        popularidade: 20,
        variantes: [
          { id: 200301, rotulo: "40g", preco: 219, custoFabricacao: 55.1 },
          { id: 200302, rotulo: "80g", preco: 349, custoFabricacao: 86.7 },
        ],
      },
      {
        id: 2004,
        nome: "Agua Micelar Luma",
        sku: "LUM-AGM-500",
        popularidade: 16,
        variantes: [
          { id: 200401, rotulo: "200ml", preco: 69, custoFabricacao: 18.4 },
          { id: 200402, rotulo: "400ml", preco: 109, custoFabricacao: 27.9 },
        ],
      },
      {
        id: 2005,
        nome: "Kit Rotina Luma",
        sku: "LUM-KIT-ROT",
        popularidade: 10,
        variantes: [
          { id: 200501, rotulo: "Unico", preco: 389, custoFabricacao: 112.5 },
        ],
      },
    ],
  },
  {
    nome: "Verte Natural",
    participacao: 0.2,
    mixPagamento: { credit_card: 0.5, pix: 0.32, boleto: 0.18 },
    produtos: [
      {
        id: 3001,
        nome: "Sabonete Vegetal Verte",
        sku: "VER-SAB-VEG",
        popularidade: 30,
        variantes: [
          { id: 300101, rotulo: "90g", preco: 29, custoFabricacao: 8.7 },
          { id: 300102, rotulo: "Kit 3 unidades", preco: 75, custoFabricacao: 23.1 },
        ],
      },
      {
        id: 3002,
        nome: "Hidratante Corporal Verte",
        sku: "VER-HID-COR",
        popularidade: 26,
        variantes: [
          { id: 300201, rotulo: "200ml", preco: 69, custoFabricacao: 22.4 },
          { id: 300202, rotulo: "400ml", preco: 109, custoFabricacao: 34.8 },
        ],
      },
      {
        id: 3003,
        nome: "Desodorante Natural Verte",
        sku: "VER-DES-NAT",
        popularidade: 20,
        variantes: [
          { id: 300301, rotulo: "55g", preco: 49, custoFabricacao: 15.9 },
          { id: 300302, rotulo: "Kit 2 unidades", preco: 89, custoFabricacao: 30.2 },
        ],
      },
      {
        id: 3004,
        nome: "Shampoo Solido Verte",
        sku: "VER-SHP-SOL",
        popularidade: 14,
        variantes: [
          { id: 300401, rotulo: "90g", preco: 59, custoFabricacao: 17.6 },
          { id: 300402, rotulo: "Kit 2 unidades", preco: 109, custoFabricacao: 33.4 },
        ],
      },
      {
        id: 3005,
        nome: "Oleo Corporal Verte",
        sku: "VER-OLE-COR",
        popularidade: 10,
        variantes: [
          { id: 300501, rotulo: "120ml", preco: 89, custoFabricacao: 27.1 },
          { id: 300502, rotulo: "250ml", preco: 139, custoFabricacao: 41.6 },
        ],
      },
    ],
  },
  {
    nome: "Nitro Hair",
    participacao: 0.16,
    // Publico jovem, muito boleto: e a marca que vai estourar o alerta de
    // inadimplencia na tabela por marca. E de proposito -- e o insight de venda.
    mixPagamento: { credit_card: 0.36, pix: 0.24, boleto: 0.4 },
    produtos: [
      {
        id: 4001,
        nome: "Pomada Modeladora Nitro",
        sku: "NIT-POM-MOD",
        popularidade: 30,
        variantes: [
          { id: 400101, rotulo: "120g", preco: 59, custoFabricacao: 16.2 },
          { id: 400102, rotulo: "250g", preco: 89, custoFabricacao: 24.8 },
        ],
      },
      {
        id: 4002,
        nome: "Tonico Barba Nitro",
        sku: "NIT-TON-BAR",
        popularidade: 24,
        variantes: [
          { id: 400201, rotulo: "60ml", preco: 99, custoFabricacao: 27.6 },
          { id: 400202, rotulo: "Kit 2 unidades", preco: 179, custoFabricacao: 52.4 },
        ],
      },
      {
        id: 4003,
        nome: "Shampoo Antiqueda Nitro",
        sku: "NIT-SHP-ANT",
        popularidade: 22,
        variantes: [
          { id: 400301, rotulo: "300ml", preco: 79, custoFabricacao: 23.9 },
          { id: 400302, rotulo: "500ml", preco: 119, custoFabricacao: 35.1 },
        ],
      },
      {
        id: 4004,
        nome: "Tonico Capilar Nitro",
        sku: "NIT-TON-CAP",
        popularidade: 14,
        variantes: [
          { id: 400401, rotulo: "100ml", preco: 89, custoFabricacao: 25.4 },
          { id: 400402, rotulo: "200ml", preco: 139, custoFabricacao: 39.7 },
        ],
      },
      {
        id: 4005,
        nome: "Kit Barba Nitro",
        sku: "NIT-KIT-BAR",
        popularidade: 10,
        variantes: [
          { id: 400501, rotulo: "Unico", preco: 199, custoFabricacao: 63.8 },
        ],
      },
    ],
  },
  {
    nome: "Petra Skin",
    participacao: 0.1,
    mixPagamento: { credit_card: 0.78, pix: 0.19, boleto: 0.03 },
    produtos: [
      {
        id: 5001,
        nome: "Serum Retinol Petra",
        sku: "PET-SER-RET",
        popularidade: 28,
        variantes: [
          { id: 500101, rotulo: "30ml", preco: 299, custoFabricacao: 71.3 },
          { id: 500102, rotulo: "50ml", preco: 449, custoFabricacao: 104.8 },
        ],
      },
      {
        id: 5002,
        nome: "Creme Firmador Petra",
        sku: "PET-CRM-FIR",
        popularidade: 24,
        variantes: [
          { id: 500201, rotulo: "50g", preco: 389, custoFabricacao: 92.6 },
          { id: 500202, rotulo: "100g", preco: 599, custoFabricacao: 138.4 },
        ],
      },
      {
        id: 5003,
        nome: "Oleo Facial Petra",
        sku: "PET-OLE-FAC",
        popularidade: 22,
        variantes: [
          { id: 500301, rotulo: "30ml", preco: 259, custoFabricacao: 63.7 },
          { id: 500302, rotulo: "60ml", preco: 399, custoFabricacao: 95.2 },
        ],
      },
      {
        id: 5004,
        nome: "Mascara Ouro Petra",
        sku: "PET-MSC-OUR",
        popularidade: 16,
        variantes: [
          { id: 500401, rotulo: "5 unidades", preco: 199, custoFabricacao: 54.9 },
          { id: 500402, rotulo: "10 unidades", preco: 349, custoFabricacao: 94.3 },
        ],
      },
      {
        id: 5005,
        nome: "Kit Ritual Petra",
        sku: "PET-KIT-RIT",
        popularidade: 10,
        variantes: [
          { id: 500501, rotulo: "Unico", preco: 899, custoFabricacao: 236.5 },
        ],
      },
    ],
  },
];

/** Todas as variantes do catalogo, achatadas, com a marca e o produto de origem. */
export function todasAsVariantes() {
  return MARCAS.flatMap((marca) =>
    marca.produtos.flatMap((produto) =>
      produto.variantes.map((variante) => ({
        marca: marca.nome,
        produtoId: produto.id,
        produtoNome: produto.nome,
        sku: produto.sku,
        ...variante,
      })),
    ),
  );
}

export function nomesDasMarcas(): string[] {
  return MARCAS.map((m) => m.nome);
}
