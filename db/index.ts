import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/server/env";
import * as schema from "./schema";

type Database = ReturnType<typeof drizzle<typeof schema>>;
const globalForDb = globalThis as unknown as { sqlClient?: ReturnType<typeof postgres>; database?: Database };

export function getDb(): Database | null {
  if (!env.DATABASE_URL) return null;
  if (!globalForDb.sqlClient) {
    globalForDb.sqlClient = postgres(env.DATABASE_URL, { max: 5, prepare: false, idle_timeout: 20, connect_timeout: 10 });
    globalForDb.database = drizzle(globalForDb.sqlClient, { schema });
  }
  return globalForDb.database ?? null;
}

export function requireDb() {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  return db;
}

export async function closeDb() {
  if (globalForDb.sqlClient) await globalForDb.sqlClient.end({ timeout: 5 });
  globalForDb.sqlClient = undefined; globalForDb.database = undefined;
}
