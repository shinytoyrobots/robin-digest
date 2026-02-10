import { getDb, upsertPipelines } from "./db.js";
import { loadPipelineConfigs } from "./config.js";
import { runPipeline } from "./pipeline/runner.js";

getDb();
upsertPipelines(loadPipelineConfigs());

console.error("Starting pm-blogs pipeline...");
const result = await runPipeline("pm-blogs");
console.error("Result:", JSON.stringify(result, null, 2));
