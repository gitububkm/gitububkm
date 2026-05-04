export type SpotifyTrackJson = {
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

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function getClientCredentialsToken(): Promise<string> {
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

export async function getUserAccessFromRefresh(): Promise<string | null> {
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

export async function fetchNowPlaying(userToken: string): Promise<{
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

export async function fetchTrack(
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

export async function imageToDataUri(imageUrl: string): Promise<string> {
  const r = await fetch(imageUrl);
  if (!r.ok) throw new Error('cover');
  const buf = Buffer.from(await r.arrayBuffer());
  const ct = r.headers.get('content-type') || 'image/jpeg';
  return `data:${ct};base64,${buf.toString('base64')}`;
}

export function pickCoverUrl(track: SpotifyTrackJson): string | null {
  const imgs = track.album?.images;
  if (!imgs?.length) return null;
  const sorted = [...imgs].sort(
    (a, b) => (b.width ?? 0) - (a.width ?? 0),
  );
  return sorted[0]?.url ?? null;
}
