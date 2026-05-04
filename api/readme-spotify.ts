import type { VercelRequest, VercelResponse } from '@vercel/node';

const DEFAULT_FEATURED_ID = '5rgy6ghBq1eRApCkeUdJXf';

type SpotifyTrackJson = {
  id: string;
  name: string;
  external_urls?: { spotify?: string };
  artists?: { name: string }[];
  album?: {
    name?: string;
    images?: { url: string; height?: number; width?: number }[];
  };
  duration_ms?: number;
};

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function getClientCredentialsToken(): Promise<string> {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error('SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET');
  }
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    throw new Error(`client_credentials ${res.status}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

async function getUserAccessFromRefresh(): Promise<string | null> {
  const refresh = process.env.SPOTIFY_REFRESH_TOKEN;
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!refresh || !id || !secret) return null;
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refresh,
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token?: string };
  return data.access_token ?? null;
}

async function fetchNowPlaying(userToken: string): Promise<{
  item: SpotifyTrackJson | null;
  is_playing: boolean;
  progress_ms: number;
} | null> {
  const res = await fetch(
    'https://api.spotify.com/v1/me/player/currently-playing',
    { headers: { Authorization: `Bearer ${userToken}` } },
  );
  if (res.status === 204) {
    return { item: null, is_playing: false, progress_ms: 0 };
  }
  if (!res.ok) return null;
  return res.json() as Promise<{
    item: SpotifyTrackJson | null;
    is_playing: boolean;
    progress_ms: number;
  }>;
}

async function fetchTrack(
  token: string,
  trackId: string,
): Promise<SpotifyTrackJson> {
  const res = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`track ${res.status}`);
  }
  return res.json() as Promise<SpotifyTrackJson>;
}

async function imageToDataUri(imageUrl: string): Promise<string> {
  const r = await fetch(imageUrl);
  if (!r.ok) throw new Error('cover');
  const buf = Buffer.from(await r.arrayBuffer());
  const ct = r.headers.get('content-type') || 'image/jpeg';
  return `data:${ct};base64,${buf.toString('base64')}`;
}

function pickCoverUrl(track: SpotifyTrackJson): string | null {
  const imgs = track.album?.images;
  if (!imgs?.length) return null;
  const sorted = [...imgs].sort(
    (a, b) => (b.width ?? 0) - (a.width ?? 0),
  );
  return sorted[0]?.url ?? null;
}

function barHeights(
  count: number,
  progress: number,
  duration: number,
  trackId: string,
): number[] {
  const seed =
    trackId.split('').reduce((a, c) => a + c.charCodeAt(0), 0) +
    Math.floor(progress / 2000) +
    Math.floor(duration / 1000);
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const t = Math.sin(seed * 0.11 + i * 0.9) * 0.5 + 0.5;
    out.push(10 + Math.round(t * 38));
  }
  return out;
}

function renderCard(opts: {
  headline: string;
  track: SpotifyTrackJson;
  coverDataUri: string;
  isPlaying: boolean;
  progress: number;
  duration: number;
}): string {
  const { headline, track, coverDataUri, isPlaying, progress, duration } =
    opts;
  const artists =
    track.artists?.map((a) => a.name).join(', ') || 'Unknown artist';
  const title = track.name;
  const w = 800;
  const h = 212;
  const barW = 5;
  const gap = 4;
  const bars = barHeights(12, progress, duration, track.id);
  const barTotal = bars.length * barW + (bars.length - 1) * gap;
  const barStartX = w - 24 - barTotal;
  const barBaseY = h - 36;
  const barsSvg = bars
    .map((height, i) => {
      const x = barStartX + i * (barW + gap);
      const y = barBaseY - height;
      const fill = isPlaying ? '#1DB954' : '#535353';
      return `<rect x="${x}" y="${y}" width="${barW}" height="${height}" rx="2" fill="${fill}"/>`;
    })
    .join('');

  const dur = Math.max(duration, 1);
  const prog = Math.min(Math.max(progress, 0), dur);
  const pct = (prog / dur) * 100;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeXml(title)}">
  <title>${escapeXml(title)}</title>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1a1a1a"/>
      <stop offset="100%" stop-color="#0d0d0d"/>
    </linearGradient>
    <clipPath id="coverClip">
      <rect x="14" y="14" width="184" height="184" rx="10"/>
    </clipPath>
  </defs>
  <rect width="${w}" height="${h}" rx="18" fill="url(#bg)"/>
  <rect width="${w}" height="${h}" rx="18" fill="none" stroke="#282828" stroke-width="2"/>
  <image clip-path="url(#coverClip)" href="${coverDataUri}" x="14" y="14" width="184" height="184" preserveAspectRatio="xMidYMid slice"/>
  <text x="220" y="46" fill="#FFFFFF" font-family="system-ui, Segoe UI, Helvetica, Arial, sans-serif" font-size="14" font-weight="600">${escapeXml(headline)}</text>
  <text x="220" y="88" fill="#FFFFFF" font-family="system-ui, Segoe UI, Helvetica, Arial, sans-serif" font-size="26" font-weight="700">${escapeXml(title.length > 40 ? `${title.slice(0, 38)}…` : title)}</text>
  <text x="220" y="124" fill="#B3B3B3" font-family="system-ui, Segoe UI, Helvetica, Arial, sans-serif" font-size="18">${escapeXml(artists.length > 52 ? `${artists.slice(0, 50)}…` : artists)}</text>
  <rect x="220" y="156" width="420" height="6" rx="3" fill="#282828"/>
  <rect x="220" y="156" width="${(420 * pct) / 100}" height="6" rx="3" fill="#1DB954"/>
  ${barsSvg}
  <text x="220" y="198" fill="#1DB954" font-family="system-ui, Segoe UI, Helvetica, Arial, sans-serif" font-size="13" font-weight="600">SPOTIFY</text>
</svg>`;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  const openRedirect = typeof req.query.open !== 'undefined';
  const featuredId =
    process.env.SPOTIFY_FEATURED_TRACK_ID || DEFAULT_FEATURED_ID;

  try {
    let headline = 'Featured track';
    let track: SpotifyTrackJson | null = null;
    let isPlaying = false;
    let progress = 0;
    let duration = 250000;

    const userTok = await getUserAccessFromRefresh();
    if (userTok) {
      const np = await fetchNowPlaying(userTok);
      if (np?.item) {
        track = np.item;
        isPlaying = np.is_playing;
        progress = np.progress_ms ?? 0;
        duration = np.item.duration_ms ?? duration;
        headline = isPlaying ? 'Listening to' : 'Last on Spotify';
      }
    }

    if (!track) {
      headline = 'Favorite track';
      const cc = await getClientCredentialsToken();
      track = await fetchTrack(cc, featuredId);
      isPlaying = false;
      progress = 0;
      duration = track.duration_ms ?? duration;
    }

    const spotifyOpen = track.external_urls?.spotify;
    if (openRedirect && spotifyOpen) {
      res.writeHead(302, { Location: spotifyOpen });
      return res.end();
    }

    const coverUrl = pickCoverUrl(track);
    if (!coverUrl) {
      return res.status(500).send('No cover URL');
    }
    const coverDataUri = await imageToDataUri(coverUrl);

    const svg = renderCard({
      headline,
      track,
      coverDataUri,
      isPlaying,
      progress,
      duration,
    });

    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader(
      'Cache-Control',
      'public, s-maxage=120, stale-while-revalidate=300',
    );
    return res.status(200).send(svg);
  } catch (e) {
    console.error(e);
    return res.status(500).send('Spotify readme API error');
  }
}
