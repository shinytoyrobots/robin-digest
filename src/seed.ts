import { getDb, upsertPipelines } from "./db.js";
import { loadPipelineConfigs } from "./config.js";

const sources = [
  { name: "SVPG", url: "https://svpg.com/articles" },
  { name: "Lenny's Newsletter", url: "https://www.lennysnewsletter.com" },
  { name: "Sachin Rekhi", url: "https://www.sachinrekhi.com" },
  { name: "Roman Pichler", url: "https://www.romanpichler.com/blog" },
  { name: "Product Talk", url: "https://www.producttalk.org" },
  { name: "Bring the Donuts", url: "https://www.bringthedonuts.com" },
  { name: "First Round Review", url: "https://review.firstround.com" },
  { name: "Inside Intercom", url: "https://www.intercom.com/blog" },
  { name: "Department of Product", url: "https://www.departmentofproduct.com/blog" },
  { name: "Amplitude Blog", url: "https://amplitude.com/blog" },
  { name: "Mind the Product", url: "https://www.mindtheproduct.com" },
  { name: "The Black Box of PM", url: "https://blackboxofpm.com" },
  { name: "Elezea", url: "https://elezea.com/blog" },
  { name: "Product Lessons", url: "https://www.productlessons.xyz" },
  { name: "Hitenism", url: "https://hitenism.com" },
];

// Init DB and load pipelines
const configs = loadPipelineConfigs();
upsertPipelines(configs);

const db = getDb();
const insert = db.prepare(
  "INSERT OR IGNORE INTO sources (pipeline_id, name, url) VALUES (?, ?, ?)"
);
const tx = db.transaction(() => {
  for (const s of sources) {
    insert.run("pm-blogs", s.name, s.url);
  }
});
tx();

const count = db.prepare("SELECT COUNT(*) as c FROM sources WHERE pipeline_id = 'pm-blogs'").get() as { c: number };
console.error(`Seeded ${count.c} sources for pm-blogs pipeline`);
