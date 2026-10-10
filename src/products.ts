export interface Product {
  sku: string;
  name: string;
  regular_price: string;
  sale_price?: string;
  stock_quantity: number;
  description?: string;
}

export interface InvalidRow {
  line: number;
  sku?: string;
  error: string;
}

export const REQUIRED_COLUMNS = ["sku", "name", "regular_price"];

export function missingColumns(headers: string[]): string[] {
  return REQUIRED_COLUMNS.filter((c) => !headers.includes(c));
}

function parsePrice(raw: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return null;
  return Number(raw);
}

/** Checks every row and separates good products from bad rows (with a reason for each bad one). */
export function validateRecords(records: { line: number; values: Record<string, string> }[]): {
  valid: Product[];
  invalid: InvalidRow[];
} {
  const valid: Product[] = [];
  const invalid: InvalidRow[] = [];
  const seen = new Set<string>();

  for (const { line, values: v } of records) {
    const fail = (error: string) => invalid.push({ line, sku: v.sku || undefined, error });

    if (!v.sku) { fail("sku is required"); continue; }
    if (v.sku.length > 100) { fail("sku is longer than 100 characters"); continue; }
    if (seen.has(v.sku)) { fail("duplicate sku in this file"); continue; }
    if (!v.name) { fail("name is required"); continue; }

    const regular = parsePrice(v.regular_price ?? "");
    if (regular === null) { fail(`regular_price "${v.regular_price}" is not a valid price`); continue; }

    let sale: number | null = null;
    if (v.sale_price) {
      sale = parsePrice(v.sale_price);
      if (sale === null) { fail(`sale_price "${v.sale_price}" is not a valid price`); continue; }
      if (sale >= regular) { fail("sale_price must be lower than regular_price"); continue; }
    }

    let stock = 0;
    if (v.stock_quantity) {
      if (!/^\d+$/.test(v.stock_quantity)) { fail(`stock_quantity "${v.stock_quantity}" must be a whole number`); continue; }
      stock = Number(v.stock_quantity);
    }

    seen.add(v.sku);
    valid.push({
      sku: v.sku,
      name: v.name,
      regular_price: regular.toFixed(2),
      ...(sale !== null ? { sale_price: sale.toFixed(2) } : {}),
      stock_quantity: stock,
      ...(v.description ? { description: v.description } : {}),
    });
  }
  return { valid, invalid };
}

/** Converts our product to the shape the WooCommerce REST API expects. */
export function toWooPayload(p: Product) {
  return {
    sku: p.sku,
    name: p.name,
    type: "simple",
    regular_price: p.regular_price,
    sale_price: p.sale_price ?? "",
    manage_stock: true,
    stock_quantity: p.stock_quantity,
    description: p.description ?? "",
  };
}
