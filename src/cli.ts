import { readFileSync } from "fs";

const file = process.argv[2];
const api = process.env.API_URL ?? "http://localhost:3000";

function bar(percent: number) {
  const filled = Math.round(percent / 5);
  return "#".repeat(filled) + "-".repeat(20 - filled);
}

async function main() {
  if (!file) {
    console.error("Usage: npm run import -- path/to/products.csv");
    process.exit(1);
  }

  const res = await fetch(`${api}/imports`, {
    method: "POST",
    headers: { "Content-Type": "text/csv" },
    body: readFileSync(file, "utf8"),
  });
  const start: any = await res.json();
  if (!res.ok) {
    console.error("Import rejected:", start.error);
    process.exit(1);
  }
  console.log(`Import ${start.id}: ${start.validRows} valid rows, ${start.invalidRows} invalid, ${start.chunks} chunks\n`);

  for (;;) {
    const p: any = await (await fetch(`${api}${start.statusUrl}`)).json();
    process.stdout.write(`\r[${bar(p.percent)}] ${String(p.percent).padStart(3)}%  created ${p.created}  updated ${p.updated}  failed ${p.failed}   `);
    if (p.finished) {
      console.log(`\n\nDone in ${((p.finishedAt - p.startedAt) / 1000).toFixed(1)}s.`);
      if (p.errors.length > 0) {
        console.log(`\nProblems (${p.errors.length}):`);
        p.errors.slice(0, 10).forEach((e: any) => console.log(`  ${e.sku ?? "-"}: ${e.error}`));
        if (p.errors.length > 10) console.log(`  ...and ${p.errors.length - 10} more (see ${api}${start.statusUrl})`);
      }
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
