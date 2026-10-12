import path from "node:path";
import { createApp } from "./app";
import { JsonStore } from "./store/json-store";

const port = Number(process.env.PORT ?? 3001);
const dataDir = process.env.DATA_DIR ?? path.join(__dirname, "..", "data");

async function main() {
  const store = new JsonStore(path.join(dataDir, "tasks.json"), path.join(dataDir, "audit-logs.json"));
  await store.load();
  const app = createApp(store);
  app.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
