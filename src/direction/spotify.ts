import { config } from "../config.js";
import { getDb } from "../db.js";
import { generateText } from "../lib/claude.js";
import type { Suggestion } from "./generator.js";

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
    console.error(`[spotify] Auth failed: ${res.status} — ${errBody}`);
    throw new Error(`Spotify auth failed: ${res.status} ${errBody}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  console.error(`[spotify] Auth OK, token expires in ${data.expires_in}s`);
  cachedToken = {
    access_token: data.access_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.access_token;
}

interface SpotifyTrack {
  id: string;
  name: string;
  artists: { name: string }[];
  album: {
    name: string;
    release_date: string;
    release_date_precision: string;
    images: { url: string; width: number }[];
  };
  external_urls: { spotify: string };
}

interface SearchResult {
  tracks: { items: SpotifyTrack[] };
}

async function spotifySearch(query: string): Promise<SpotifyTrack[]> {
  const token = await getAccessToken();
  const q = encodeURIComponent(query);
  const res = await fetch(`https://api.spotify.com/v1/search?q=${q}&type=track&limit=20`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`[spotify] Search failed: ${res.status} for query "${query}" — ${body}`);
    return [];
  }

  const data = (await res.json()) as SearchResult;
  return data.tracks.items;
}

async function searchTrack(title: string, artist: string): Promise<SpotifyTrack[]> {
  // Plain text search works much better than field prefixes (track:/artist:)
  // which are overly restrictive and miss many results

  // Try title + artist together
  const combined = await spotifySearch(`${title} ${artist}`);
  if (combined.length > 0) {
    console.error(`[spotify] Found ${combined.length} results for "${title} ${artist}"`);
    return combined;
  }

  // Fall back to artist-only to find any recent track by them
  console.error(`[spotify] No results for title+artist, trying artist-only: "${artist}"`);
  return spotifySearch(artist);
}

function isRecentRelease(releaseDate: string, precision: string): boolean {
  const now = new Date();
  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Parse based on precision
  let date: Date;
  if (precision === "day") {
    date = new Date(releaseDate + "T00:00:00Z");
  } else if (precision === "month") {
    // Use last day of month to be generous
    const [y, m] = releaseDate.split("-").map(Number);
    date = new Date(Date.UTC(y, m, 0)); // last day of month
  } else {
    // Year precision — too vague, skip
    return false;
  }

  return date >= cutoff;
}

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

function getRecentSongFeedback(): { title: string; artist: string; reaction: string }[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT title, artist, reaction FROM direction_songs
       WHERE reaction IS NOT NULL AND created_at > datetime('now', '-30 days')
       ORDER BY created_at DESC LIMIT 20`
    )
    .all() as { title: string; artist: string; reaction: string }[];
}

function buildSongPrompt(suggestions: Suggestion[], pastSongs: string[], feedback: { title: string; artist: string; reaction: string }[]): string {
  const todayStr = new Date().toISOString().slice(0, 10);

  let prompt = `You are recommending a NEW music release for Robin Cannon based on today's daily direction content. Today is ${todayStr}.

CRITICAL: You must suggest a song released in ${new Date().getFullYear()}. Your training data is not current — you do NOT know what songs are out right now. Instead, suggest an artist who is ACTIVELY RELEASING MUSIC and name a plausible recent single or album track by them. Think of artists who release frequently: indie artists, electronic producers, hip-hop artists, singer-songwriters with active output. The system will verify via Spotify that the track exists and was released recently.

Requirements:
1. The artist must be someone who releases music regularly (not a legacy act with rare releases)
2. Name a specific track title — your best guess at a recent single or album track by that artist
3. The song should have a thematic, emotional, or conceptual connection to today's direction content
4. Must be on Spotify

Today's direction suggestions:
${suggestions.map((s) => `- "${s.title}": ${s.body}`).join("\n")}
`;

  if (pastSongs.length > 0) {
    prompt += `\nDo NOT suggest any of these previously recommended songs:\n${pastSongs.map((s) => `- ${s}`).join("\n")}\n`;
  }

  if (feedback.length > 0) {
    prompt += `\nPast song feedback (learn from this):\n`;
    for (const f of feedback) {
      prompt += `- "${f.title}" by ${f.artist} → ${f.reaction === "up" ? "liked" : "disliked"}\n`;
    }
    prompt += `Lean toward styles/genres that were liked, away from those disliked.\n`;
  }

  prompt += `\nRespond with ONLY a JSON object (no markdown, no explanation):
{"title": "Song Title", "artist": "Artist Name", "reason": "One sentence explaining the connection to today's direction"}`;

  return prompt;
}

interface SongSuggestion {
  title: string;
  artist: string;
  reason: string;
}

function parseSongResponse(raw: string): SongSuggestion {
  const cleaned = raw.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
  const parsed = JSON.parse(cleaned);
  return {
    title: String(parsed.title),
    artist: String(parsed.artist),
    reason: String(parsed.reason),
  };
}

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
  attempt: number;
  artist: string;
  title: string;
  tracks_found: number;
  recent_tracks: number;
  sample_dates: string[];
  error?: string;
}

export async function generateSongRecommendation(directionId: number, attemptLogs?: AttemptLog[]): Promise<StoredSong | null> {
  if (!config.spotifyClientId || !config.spotifyClientSecret) {
    console.error("[spotify] Missing credentials, skipping song recommendation");
    return null;
  }

  const db = getDb();
  const direction = db
    .prepare("SELECT suggestions FROM daily_directions WHERE id = ?")
    .get(directionId) as { suggestions: string } | undefined;

  if (!direction) {
    console.error(`[spotify] Direction #${directionId} not found`);
    return null;
  }

  let suggestions: Suggestion[];
  try {
    suggestions = JSON.parse(direction.suggestions);
  } catch {
    console.error("[spotify] Failed to parse direction suggestions");
    return null;
  }

  const pastTrackIds = getPastTrackIds();
  const pastSongs = getPastSongTitles();
  const feedback = getRecentSongFeedback();
  const prompt = buildSongPrompt(suggestions, pastSongs, feedback);

  const MAX_ATTEMPTS = 3;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const raw = await generateText(prompt, undefined, {
        model: "claude-sonnet-4-6",
        temperature: 1.0,
      });
      const suggestion = parseSongResponse(raw);
      console.error(`[spotify] Attempt ${attempt}: "${suggestion.title}" by ${suggestion.artist}`);

      const tracks = await searchTrack(suggestion.title, suggestion.artist);

      const recentTracks = tracks.filter(
        (t) => !pastTrackIds.has(t.id) && isRecentRelease(t.album.release_date, t.album.release_date_precision)
      );

      if (attemptLogs) {
        attemptLogs.push({
          attempt,
          artist: suggestion.artist,
          title: suggestion.title,
          tracks_found: tracks.length,
          recent_tracks: recentTracks.length,
          sample_dates: tracks.slice(0, 5).map((t) => `${t.name} (${t.album.release_date})`),
        });
      }

      for (const track of recentTracks) {

        // Found a valid recent track
        const albumArt = track.album.images.find((img) => img.width >= 200)?.url
          ?? track.album.images[0]?.url
          ?? null;

        const result = db
          .prepare(
            `INSERT INTO direction_songs (direction_id, track_id, title, artist, album, release_date, spotify_url, album_art_url, reason)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            directionId,
            track.id,
            track.name,
            track.artists.map((a) => a.name).join(", "),
            track.album.name,
            track.album.release_date,
            track.external_urls.spotify,
            albumArt,
            suggestion.reason
          );

        const song: StoredSong = {
          id: Number(result.lastInsertRowid),
          direction_id: directionId,
          track_id: track.id,
          title: track.name,
          artist: track.artists.map((a) => a.name).join(", "),
          album: track.album.name,
          release_date: track.album.release_date,
          spotify_url: track.external_urls.spotify,
          album_art_url: albumArt,
          reason: suggestion.reason,
          reaction: null,
          created_at: new Date().toISOString(),
        };

        console.error(`[spotify] Stored song: "${song.title}" by ${song.artist} (released ${song.release_date})`);
        return song;
      }

      console.error(`[spotify] Attempt ${attempt}: No recent tracks found for "${suggestion.title}" by ${suggestion.artist}`);
    } catch (err) {
      console.error(`[spotify] Attempt ${attempt} error:`, err);
    }
  }

  console.error("[spotify] All attempts exhausted, no song recommendation today");
  return null;
}
