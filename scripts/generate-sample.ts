import { writeFileSync } from "fs";

const categories = ["Mug", "T-shirt", "Notebook", "Backpack", "Bottle", "Cap"];
const lines = ["sku,name,regular_price,sale_price,stock_quantity,description"];

for (let i = 1; i <= 300; i++) {
  const c = categories[i % categories.length];
  const price = (9 + (i % 40) * 1.5).toFixed(2);
  const sale = i % 7 === 0 ? (Number(price) * 0.8).toFixed(2) : "";
  lines.push(`SKU-${String(i).padStart(4, "0")},"Demo ${c} #${i}",${price},${sale},${i % 25},"A sample ${c.toLowerCase()}, number ${i}"`);
}

// A few deliberately broken rows, so you can see validation reporting.
lines.push(`,"Missing SKU",10.00,,5,`);
lines.push(`SKU-BAD1,"Bad price",ten,,5,`);
lines.push(`SKU-0001,"Duplicate of the first row",12.00,,5,`);
lines.push(`SKU-BAD2,"Sale above price",10.00,15.00,5,`);

writeFileSync("samples/products.csv", lines.join("\n") + "\n");
console.log(`Wrote samples/products.csv (${lines.length - 1} data rows)`);
