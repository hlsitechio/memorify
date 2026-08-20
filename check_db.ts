import { query } from "./backend/lib/db.ts";

async function run() {
  const ws = await query("SELECT * FROM workspaces");
  console.log("Workspaces rows:", ws);
  Deno.exit(0);
}
run();
