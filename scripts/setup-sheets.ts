import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const { initializeSpreadsheet } = await import("../lib/server/sheets");

try { const result = await initializeSpreadsheet(); console.log(`Spreadsheet ready. Tabs: ${result.initialized.join(", ")}.`); if (result.created.length) console.log(`Created: ${result.created.join(", ")}.`); }
catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
