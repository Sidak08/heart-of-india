import { migrate } from "drizzle-orm/postgres-js/migrator";
import { closeDb, requireDb } from "../db";

async function main() { try { await migrate(requireDb(), { migrationsFolder: "drizzle" }); console.log("Database migrations applied."); } finally { await closeDb(); } }
main().catch((error) => { console.error(error); process.exitCode = 1; });
