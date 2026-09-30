// 在暂停应用写入期间比较迁移前后的原有列；文件仅存行数和摘要，不保存业务内容。
import dotenv from "dotenv";
import pg from "pg";
import fs from "node:fs";
dotenv.config({ quiet: true });
const { Client } = pg;
const [mode, path] = process.argv.slice(2);
const quote = value => '"' + value.replaceAll('"', '""') + '"';
async function main() {
  if (!["snapshot", "verify"].includes(mode) || !path || !process.env.DATABASE_URL) throw new Error("Expected snapshot|verify, output path and DATABASE_URL");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const database = (await client.query("SELECT current_database() AS name")).rows[0].name;
    let snapshot;
    if (mode === "snapshot") {
      const columns = (await client.query("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name <> '_prisma_migrations' ORDER BY table_name, ordinal_position")).rows;
      snapshot = { database, tables: {} };
      for (const { table_name, column_name } of columns) (snapshot.tables[table_name] ??= { columns: [] }).columns.push(column_name);
    } else {
      snapshot = JSON.parse(fs.readFileSync(path, "utf8"));
      if (snapshot.database !== database) throw new Error("Database identity mismatch");
    }
    for (const [table, entry] of Object.entries(snapshot.tables)) {
      const query = `SELECT count(*)::text AS count, md5(COALESCE(string_agg(row_data, '' ORDER BY row_data), '')) AS digest FROM (SELECT to_jsonb(r)::text AS row_data FROM (SELECT ${entry.columns.map(quote).join(",")} FROM public.${quote(table)}) r) source`;
      const result = (await client.query(query)).rows[0];
      if (mode === "snapshot") Object.assign(entry, result);
      else if (entry.count !== result.count || entry.digest !== result.digest) throw new Error(`Existing data changed: ${table}`);
    }
    await client.query("COMMIT");
    if (mode === "snapshot") fs.writeFileSync(path, JSON.stringify(snapshot), { mode: 0o600, flag: "wx" });
    console.log(`${mode}: ${Object.keys(snapshot.tables).length} tables checked successfully`);
  } finally { await client.end(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
