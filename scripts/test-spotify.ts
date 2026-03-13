/**
 * CLI script to test Spotify song recommendation.
 * Usage: npx tsx scripts/test-spotify.ts [direction_id]
 *
 * If no direction_id is given, uses the most recent direction.
 */
import { getDb } from "../src/db.js";
import { generateSongRecommendation } from "../src/direction/spotify.js";

async function main() {
  const db = getDb();
  const directionId = process.argv[2]
    ? parseInt(process.argv[2], 10)
    : (
        db.prepare("SELECT id FROM daily_directions ORDER BY created_at DESC LIMIT 1").get() as
          | { id: number }
          | undefined
      )?.id;

  if (!directionId) {
    console.error("No directions found in the database. Run the direction generator first.");
    process.exit(1);
  }

  console.error(`Testing song recommendation for direction #${directionId}...`);
  const song = await generateSongRecommendation(directionId);

  if (song) {
    console.error("\nSong of the day:");
    console.error(`  Title:    ${song.title}`);
    console.error(`  Artist:   ${song.artist}`);
    console.error(`  Album:    ${song.album}`);
    console.error(`  Released: ${song.release_date}`);
    console.error(`  Spotify:  ${song.spotify_url}`);
    console.error(`  Reason:   ${song.reason}`);
  } else {
    console.error("\nNo song recommendation generated.");
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
