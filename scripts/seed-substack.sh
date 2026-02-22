#!/bin/bash
# Seed Substack sources for the three digest pipelines.
# Usage: AUTH_TOKEN=<token> BASE_URL=<url> ./scripts/seed-substack.sh
# Defaults to production Railway deployment.

BASE_URL="${BASE_URL:-https://robin-cannon.dev}"
AUTH_TOKEN="${AUTH_TOKEN:?AUTH_TOKEN required}"

seed() {
  local pipeline_id="$1"
  local json="$2"
  echo "Seeding $pipeline_id..."
  curl -s -X POST "$BASE_URL/admin/seed-sources" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    -d "$json" | jq .
}

delete_source() {
  local pipeline_id="$1"
  local url="$2"
  echo "Removing $url from $pipeline_id..."
  curl -s -X DELETE "$BASE_URL/admin/delete-source" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    -d "{\"pipeline_id\": \"$pipeline_id\", \"url\": \"$url\"}" | jq .
}

# --- Removals ---
delete_source "substack-fiction" "https://cafelatteau.substack.com"

# Design & Tech
seed "substack-design-tech" '{
  "pipeline_id": "substack-design-tech",
  "sources": [
    { "name": "Design + AI", "url": "https://felixhhaas.substack.com" },
    { "name": "Brand Archive", "url": "https://brandarchive.substack.com" },
    { "name": "Defining Experience", "url": "https://kobewan.substack.com" },
    { "name": "Designverse", "url": "https://nassoskappa.substack.com" },
    { "name": "techletter", "url": "https://web3brew.substack.com" },
    { "name": "Zero Vector", "url": "https://zerovector.substack.com" },
    { "name": "The Substack Post", "url": "https://newsletter.substack.com" },
    { "name": "Design Systems Collective", "url": "https://www.designsystemscollective.com" },
    { "name": "Cyberpunk Survival Guide", "url": "https://www.cyberpunksurvivalguide.com" }
  ]
}'

# Culture & Ideas
seed "substack-culture" '{
  "pipeline_id": "substack-culture",
  "sources": [
    { "name": "The Anatomy of Reality", "url": "https://gabyjdb.substack.com" },
    { "name": "Dark Matter", "url": "https://darkmatter.substack.com" },
    { "name": "Emily Writes", "url": "https://emilywrites.substack.com" },
    { "name": "Today in Fascism", "url": "https://todayinfascism.substack.com" },
    { "name": "Sommyyah", "url": "https://sommyyah.substack.com" },
    { "name": "Emily Barlett", "url": "https://emilybarlett.substack.com" },
    { "name": "Beautiful, Daring, Stupid", "url": "https://megoolders.substack.com" },
    { "name": "The Panicked Writer", "url": "https://ellieleonard.substack.com" },
    { "name": "Graphomane", "url": "https://nealstephenson.substack.com" },
    { "name": "Orwell Daily", "url": "https://orwell.substack.com" },
    { "name": "The Molehill", "url": "https://www.themolehill.net" },
    { "name": "The Cognitive Dissident", "url": "https://cognitivedissident.substack.com" },
    { "name": "Always The Horizon", "url": "https://alwaysthehorizon.substack.com" },
    { "name": "Things Hidden in Complexity", "url": "https://hiddencomplexity.substack.com" },
    { "name": "Noahpinion", "url": "https://www.noahpinion.blog" },
    { "name": "THE CHOW", "url": "https://www.thechow.net" }
  ]
}'

# Fiction & Craft
seed "substack-fiction" '{
  "pipeline_id": "substack-fiction",
  "sources": [
    { "name": "Andy Futuro", "url": "https://andyfuturo.substack.com" },
    { "name": "The Art of Flash Fiction", "url": "https://kathyfish.substack.com" },
    { "name": "DECENTRALIZED FICTION", "url": "https://arxhan.substack.com" },
    { "name": "Elizabeth Lamont", "url": "https://appalledamerican.substack.com" },
    { "name": "FicStack", "url": "https://ficstack.substack.com" },
    { "name": "Fictionistas", "url": "https://fictionistas.substack.com" },
    { "name": "Mechanical Pulp", "url": "https://mechanicalpulp.substack.com" },
    { "name": "MY AGENT SECRET", "url": "https://myagentsecret.substack.com" },
    { "name": "Stop Writing Alone", "url": "https://stopwritingalone.substack.com" },
    { "name": "Top In Fiction", "url": "https://topinfiction.substack.com" },
    { "name": "The Pneumanaut", "url": "https://pneumanauts.substack.com" },
    { "name": "The Tearoom", "url": "https://mariellahunt.substack.com" },
    { "name": "Beth Brower", "url": "https://bethbrower.substack.com" },
    { "name": "Tom Cox", "url": "https://tomcox.substack.com" },
    { "name": "Punk Noir Magazine", "url": "https://www.punknoir.online" },
    { "name": "Project Dreamcatcher", "url": "https://digitalisarchives.substack.com" },
    { "name": "Allison Ink", "url": "https://allisonink.substack.com" },
    { "name": "Kairos", "url": "https://brianniemeier.substack.com" }
  ]
}'

# PM Blogs (additions only — base sources seeded via src/seed.ts)
seed "pm-blogs" '{
  "pipeline_id": "pm-blogs",
  "sources": [
    { "name": "Product Growth", "url": "https://www.news.aakashg.com" },
    { "name": "Marketing Ideas", "url": "https://www.marketingideas.com" }
  ]
}'

echo "Done. Run pipelines via POST /admin/run-pipeline to test."
