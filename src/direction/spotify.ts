import { config } from "../config.js";
import { getDb } from "../db.js";
import { generateTextWithUsage } from "../lib/claude.js";
import type { Suggestion } from "./generator.js";

const MB_USER_AGENT = "RobinDigest/1.0.0 ( https://robin-cannon.dev ) robin@shinytoyrobots.com";

// --- MusicBrainz ---

interface MBRelease {
  id: string;
  title: string;
  disambiguation: string;
  date: string;
  "artist-credit": { name: string; artist: { id: string; name: string } }[];
  "release-group": { "primary-type": string };
  status: string;
}

interface MBSearchResult {
  releases: MBRelease[];
  count: number;
}

async function fetchRecentReleases(): Promise<MBRelease[]> {
  const now = new Date();
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const fromDate = twoWeeksAgo.toISOString().slice(0, 10);
  const toDate = now.toISOString().slice(0, 10);

  const allReleases: MBRelease[] = [];

  // Fetch singles, albums, and EPs in separate queries to get good coverage
  for (const type of ["single", "album", "ep"]) {
    const query = `date:[${fromDate} TO ${toDate}] AND status:official AND type:${type}`;
    const url = `https://musicbrainz.org/ws/2/release?query=${encodeURIComponent(query)}&fmt=json&limit=100`;

    try {
      const res = await fetch(url, {
        headers: { "User-Agent": MB_USER_AGENT },
      });

      if (!res.ok) {
        console.error(`[musicbrainz] Search failed for ${type}: ${res.status}`);
        continue;
      }

      const data = (await res.json()) as MBSearchResult;
      console.error(`[musicbrainz] Found ${data.releases.length} recent ${type}s (of ${data.count} total)`);
      allReleases.push(...data.releases);
    } catch (err) {
      console.error(`[musicbrainz] Error fetching ${type}s:`, err);
    }

    // Respect MusicBrainz rate limit: 1 request per second
    await new Promise((resolve) => setTimeout(resolve, 1100));
  }

  return allReleases;
}

function fullMBTitle(r: MBRelease): string {
  return r.disambiguation ? `${r.title} (${r.disambiguation})` : r.title;
}

function formatMBRelease(r: MBRelease): string {
  const artist = r["artist-credit"]?.map((c) => c.name).join(", ") || "Unknown";
  const type = r["release-group"]?.["primary-type"] || "release";
  return `"${fullMBTitle(r)}" by ${artist} (${type}, ${r.date})`;
}

// --- Spotify ---

interface SpotifyToken {
  access_token: string;
  expires_at: number;
}

let cachedToken: SpotifyToken | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expires_at - 60_000) {
    return cachedToken.access_token;
  }

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${config.spotifyClientId}:${config.spotifyClientSecret}`).toString("base64")}`,
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Spotify auth failed: ${res.status} ${errBody}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    access_token: data.access_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.access_token;
}

interface SpotifyTrack {
  id: string;
  name: string;
  uri: string;
  artists: { name: string }[];
  album: {
    name: string;
    release_date: string;
    release_date_precision: string;
    images: { url: string; width: number }[];
  };
  external_urls: { spotify: string };
}

async function findOnSpotify(title: string, artist: string): Promise<SpotifyTrack | null> {
  const token = await getAccessToken();
  const q = encodeURIComponent(`${title} ${artist}`);
  const url = `https://api.spotify.com/v1/search?q=${q}&type=track&limit=5`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    console.error(`[spotify] Search failed: ${res.status}`);
    return null;
  }

  const data = (await res.json()) as { tracks: { items: SpotifyTrack[] } };
  // Return best match — first result
  return data.tracks.items[0] ?? null;
}

// --- DB helpers ---

function getPastTrackIds(): Set<string> {
  const db = getDb();
  const rows = db.prepare("SELECT track_id FROM direction_songs").all() as { track_id: string }[];
  return new Set(rows.map((r) => r.track_id));
}

function getPastSongTitles(): string[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT title, artist FROM direction_songs ORDER BY created_at DESC LIMIT 30")
    .all() as { title: string; artist: string }[];
  return rows.map((r) => `${r.title} by ${r.artist}`);
}

// --- Prompt ---

function buildSongPrompt(
  suggestions: Suggestion[],
  releases: MBRelease[],
  pastSongs: string[]
): string {
  // Shuffle and sample releases to keep prompt manageable
  const shuffled = releases.sort(() => Math.random() - 0.5);
  const sample = shuffled.slice(0, 80);

  let prompt = `You are picking a song-of-the-day for Robin Cannon from a list of REAL, VERIFIED recent releases.

Below is a list of music released in the last 14 days from MusicBrainz. These are real releases — do not invent or modify titles or artist names. Pick ONE that has a genuine thematic, emotional, or conceptual connection to today's daily direction content.

## Today's direction suggestions:
${suggestions.map((s) => `- "${s.title}": ${s.body}`).join("\n")}

## Recent releases (pick from this list ONLY):
${sample.map((r, i) => `${i + 1}. ${formatMBRelease(r)}`).join("\n")}
`;

  if (pastSongs.length > 0) {
    prompt += `\n## Do NOT pick any of these previously recommended songs:\n${pastSongs.map((s) => `- ${s}`).join("\n")}\n`;
  }

  prompt += `\n## How to pick:
- Favor the TITLE's connotation and mood over the artist's reputation. A title that evokes the right feeling matters more than a famous name.
- Prefer artists you know LESS about — obscure and unfamiliar is a feature, not a bug. This is about discovery.
- Look for emotional resonance, surprising conceptual parallels, or evocative mood — NOT literal keyword matches between song titles and direction content.
- Be surprising. The best pick is one Robin wouldn't find on his own.

Respond with ONLY a JSON object (no markdown, no explanation):
{"title": "Exact Title From List", "artist": "Exact Artist From List", "reason": "One sentence explaining the connection to today's direction"}`;

  return prompt;
}

// --- Main ---

export interface StoredSong {
  id: number;
  direction_id: number;
  track_id: string;
  title: string;
  artist: string;
  album: string | null;
  release_date: string | null;
  spotify_url: string;
  album_art_url: string | null;
  reason: string;
  reaction: string | null;
  created_at: string;
}

export interface AttemptLog {
  releases_fetched: number;
  pick?: { title: string; artist: string; reason: string };
  spotify_found: boolean;
  error?: string;
}

export async function generateSongRecommendation(directionId: number, attemptLog?: AttemptLog[]): Promise<StoredSong | null> {
  if (!config.spotifyClientId || !config.spotifyClientSecret) {
    console.error("[song] Missing Spotify credentials, skipping");
    return null;
  }

  const db = getDb();
  const direction = db
    .prepare("SELECT suggestions FROM daily_directions WHERE id = ?")
    .get(directionId) as { suggestions: string } | undefined;

  if (!direction) {
    console.error(`[song] Direction #${directionId} not found`);
    return null;
  }

  let suggestions: Suggestion[];
  try {
    suggestions = JSON.parse(direction.suggestions);
  } catch {
    console.error("[song] Failed to parse direction suggestions");
    return null;
  }

  // Step 1: Fetch recent releases from MusicBrainz
  console.error("[song] Fetching recent releases from MusicBrainz...");
  const releases = await fetchRecentReleases();

  if (releases.length === 0) {
    console.error("[song] No recent releases found on MusicBrainz");
    if (attemptLog) attemptLog.push({ releases_fetched: 0, spotify_found: false, error: "No MusicBrainz releases" });
    return null;
  }

  console.error(`[song] ${releases.length} total recent releases`);

  const pastTrackIds = getPastTrackIds();
  const pastSongs = getPastSongTitles();


  // Step 2: Ask Claude to pick from the real releases
  const MAX_ATTEMPTS = 2;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const log: AttemptLog = { releases_fetched: releases.length, spotify_found: false };

    try {
      const prompt = buildSongPrompt(suggestions, releases, pastSongs);
      const model = "claude-sonnet-4-6";
      const result = await generateTextWithUsage(prompt, undefined, {
        model,
        temperature: 0.8,
      });

      const cleaned = result.text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
      const pick = JSON.parse(cleaned) as { title: string; artist: string; reason: string };
      log.pick = pick;

      console.error(`[song] Claude picked: "${pick.title}" by ${pick.artist}`);

      // Find the MusicBrainz release to get exact title and date
      const mbMatch = releases.find((r) => {
        const mbArtist = r["artist-credit"]?.map((c) => c.name).join(", ") || "";
        return fullMBTitle(r) === pick.title && mbArtist === pick.artist;
      });
      const mbReleaseDate = mbMatch?.date ?? null;

      // Use the full MusicBrainz title (with disambiguation) for Spotify search
      const searchTitle = mbMatch ? fullMBTitle(mbMatch) : pick.title;

      // Step 3: Find on Spotify
      const track = await findOnSpotify(searchTitle, pick.artist);

      if (!track) {
        console.error(`[song] Not found on Spotify: "${pick.title}" by ${pick.artist}`);
        if (attemptLog) attemptLog.push(log);
        continue;
      }

      if (pastTrackIds.has(track.id)) {
        console.error(`[song] Already recommended: ${track.id}`);
        log.error = "Already recommended";
        if (attemptLog) attemptLog.push(log);
        continue;
      }

      log.spotify_found = true;
      if (attemptLog) attemptLog.push(log);

      // Step 4: Store — use MusicBrainz release date and Spotify URI (opens app)
      const albumArt = track.album.images.find((img) => img.width >= 200)?.url
        ?? track.album.images[0]?.url
        ?? null;

      const dbResult = db
        .prepare(
          `INSERT INTO direction_songs (direction_id, track_id, title, artist, album, release_date, spotify_url, album_art_url, reason, input_tokens, output_tokens, model_used)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          directionId,
          track.id,
          track.name,
          track.artists.map((a) => a.name).join(", "),
          track.album.name,
          mbReleaseDate,
          track.uri,
          albumArt,
          pick.reason,
          result.inputTokens,
          result.outputTokens,
          model
        );

      const song: StoredSong = {
        id: Number(dbResult.lastInsertRowid),
        direction_id: directionId,
        track_id: track.id,
        title: track.name,
        artist: track.artists.map((a) => a.name).join(", "),
        album: track.album.name,
        release_date: mbReleaseDate,
        spotify_url: track.uri,
        album_art_url: albumArt,
        reason: pick.reason,
        reaction: null,
        created_at: new Date().toISOString(),
      };

      console.error(`[song] Stored: "${song.title}" by ${song.artist} (released ${song.release_date})`);
      return song;
    } catch (err) {
      log.error = String(err);
      if (attemptLog) attemptLog.push(log);
      console.error(`[song] Attempt ${attempt} error:`, err);
    }
  }

  console.error("[song] All attempts exhausted, no song recommendation today");
  return null;
}
