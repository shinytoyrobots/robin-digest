#!/bin/bash
# Seed all sources across all pipelines.
# Idempotent — uses INSERT OR IGNORE, safe to re-run.
# Usage: AUTH_TOKEN=<token> BASE_URL=<url> ./scripts/seed-sources.sh
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

# --- AI News ---
seed "ai-news" '{
  "pipeline_id": "ai-news",
  "sources": [
    { "name": "Cursor Blog", "url": "https://cursor.com/blog" },
    { "name": "Every", "url": "https://every.to/" },
    { "name": "Google AI Blog", "url": "https://blog.google/technology/ai/" },
    { "name": "Knapsack Blog", "url": "https://www.knapsack.cloud/blog" },
    { "name": "Le Monde (AI)", "url": "https://www.lemonde.fr/en/artificial-intelligence/" },
    { "name": "Microsoft AI Blog", "url": "https://www.microsoft.com/en-us/ai/blog/property/microsoft-industry-blogs/" },
    { "name": "NVIDIA (Generative AI)", "url": "https://blogs.nvidia.com/blog/category/generative-ai/" },
    { "name": "One Useful Thing", "url": "https://www.oneusefulthing.org" },
    { "name": "OpenAI News", "url": "https://openai.com/news/" },
    { "name": "Palantir Blog", "url": "https://blog.palantir.com/" },
    { "name": "Strefa Tech", "url": "https://strefatech.substack.com" },
    { "name": "The Guardian (AI)", "url": "https://www.theguardian.com/technology/artificialintelligenceai" }
  ]
}'

# --- PM Blogs ---
seed "pm-blogs" '{
  "pipeline_id": "pm-blogs",
  "sources": [
    { "name": "Amplitude Blog", "url": "https://amplitude.com/blog" },
    { "name": "Bring the Donuts", "url": "https://www.bringthedonuts.com" },
    { "name": "Department of Product", "url": "https://www.departmentofproduct.com/blog" },
    { "name": "Elezea", "url": "https://elezea.com/blog" },
    { "name": "First Round Review", "url": "https://review.firstround.com" },
    { "name": "Hitenism", "url": "https://hitenism.com" },
    { "name": "Inside Intercom", "url": "https://www.intercom.com/blog" },
    { "name": "Lenny Newsletter", "url": "https://www.lennysnewsletter.com" },
    { "name": "Marketing Ideas", "url": "https://www.marketingideas.com" },
    { "name": "Mind the Product", "url": "https://www.mindtheproduct.com" },
    { "name": "Product Growth", "url": "https://www.news.aakashg.com" },
    { "name": "Product Lessons", "url": "https://www.productlessons.xyz" },
    { "name": "Product Talk", "url": "https://www.producttalk.org" },
    { "name": "Roman Pichler", "url": "https://www.romanpichler.com/blog" },
    { "name": "Sachin Rekhi", "url": "https://www.sachinrekhi.com" },
    { "name": "SVPG", "url": "https://svpg.com/articles" }
  ]
}'

# --- Culture & Ideas ---
seed "substack-culture" '{
  "pipeline_id": "substack-culture",
  "sources": [
    { "name": "Always The Horizon", "url": "https://alwaysthehorizon.substack.com" },
    { "name": "Beautiful, Daring, Stupid", "url": "https://megoolders.substack.com" },
    { "name": "Dark Matter", "url": "https://darkmatter.substack.com" },
    { "name": "Emily Barlett", "url": "https://emilybarlett.substack.com" },
    { "name": "Emily Writes", "url": "https://emilywrites.substack.com" },
    { "name": "Graphomane", "url": "https://nealstephenson.substack.com" },
    { "name": "Noahpinion", "url": "https://www.noahpinion.blog" },
    { "name": "Off Message", "url": "http://offmessage.net/" },
    { "name": "Orwell Daily", "url": "https://orwell.substack.com" },
    { "name": "Sommyyah", "url": "https://sommyyah.substack.com" },
    { "name": "The Anatomy of Reality", "url": "https://gabyjdb.substack.com" },
    { "name": "The Argument", "url": "https://www.theargumentmag.com/" },
    { "name": "THE CHOW", "url": "https://www.thechow.net" },
    { "name": "The Cognitive Dissident", "url": "https://cognitivedissident.substack.com" },
    { "name": "The Molehill", "url": "https://www.themolehill.net" },
    { "name": "The Panicked Writer", "url": "https://ellieleonard.substack.com" },
    { "name": "Things Hidden in Complexity", "url": "https://hiddencomplexity.substack.com" },
    { "name": "Today in Fascism", "url": "https://todayinfascism.substack.com" }
  ]
}'

# --- Design & Tech ---
seed "substack-design-tech" '{
  "pipeline_id": "substack-design-tech",
  "sources": [
    { "name": "Brand Archive", "url": "https://brandarchive.substack.com" },
    { "name": "Cyberpunk Survival Guide", "url": "https://www.cyberpunksurvivalguide.com" },
    { "name": "Defining Experience", "url": "https://kobewan.substack.com" },
    { "name": "Design + AI", "url": "https://felixhhaas.substack.com" },
    { "name": "Design Systems Collective", "url": "https://www.designsystemscollective.com" },
    { "name": "Designverse", "url": "https://nassoskappa.substack.com" },
    { "name": "techletter", "url": "https://web3brew.substack.com" },
    { "name": "The Substack Post", "url": "https://newsletter.substack.com" },
    { "name": "Zero Vector", "url": "https://zerovector.substack.com" }
  ]
}'

# --- Fiction & Craft ---
seed "substack-fiction" '{
  "pipeline_id": "substack-fiction",
  "sources": [
    { "name": "Allison Ink", "url": "https://allisonink.substack.com" },
    { "name": "Andy Futuro", "url": "https://andyfuturo.substack.com" },
    { "name": "Beth Brower", "url": "https://bethbrower.substack.com" },
    { "name": "DECENTRALIZED FICTION", "url": "https://arxhan.substack.com" },
    { "name": "Elizabeth Lamont", "url": "https://appalledamerican.substack.com" },
    { "name": "FicStack", "url": "https://ficstack.substack.com" },
    { "name": "Fictionistas", "url": "https://fictionistas.substack.com" },
    { "name": "Mechanical Pulp", "url": "https://mechanicalpulp.substack.com" },
    { "name": "MY AGENT SECRET", "url": "https://myagentsecret.substack.com" },
    { "name": "Project Dreamcatcher", "url": "https://digitalisarchives.substack.com" },
    { "name": "Punk Noir Magazine", "url": "https://www.punknoir.online" },
    { "name": "Stop Writing Alone", "url": "https://stopwritingalone.substack.com" },
    { "name": "The Art of Flash Fiction", "url": "https://kathyfish.substack.com" },
    { "name": "The Pneumanaut", "url": "https://pneumanauts.substack.com" },
    { "name": "The Tearoom", "url": "https://mariellahunt.substack.com" },
    { "name": "Tom Cox", "url": "https://tomcox.substack.com" },
    { "name": "Top In Fiction", "url": "https://topinfiction.substack.com" }
  ]
}'

echo "Done. Run pipelines via POST /admin/run-pipeline to test."
