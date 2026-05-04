import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  escapeXml,
  getUserAccessFromRefresh,
  imageToDataUri,
  pickCoverUrl,
  type SpotifyTrackJson,
} from '../lib/spotify-common';

const VALID_RANGES = new Set(['short_term', 'medium_term', 'long_term']);

const RANGE_LABEL: Record<string, string> = {
  short_term: 'последние ~4 недели',
  medium_term: 'последние ~6 месяцев',
  long_term: 'за всё время',
};

async function fetchTopTracks(
  accessToken: string,
  timeRange: string,
): Promise<{ items: SpotifyTrackJson[]; status: number }> {
  const url = new URL('https://api.spotify.com/v1/me/top/tracks');
  url.searchParams.set('limit', '3');
  url.searchParams.set('time_range', timeRange);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    return { items: [], status: res.status };
  }
  const data = (await res.json()) as { items?: SpotifyTrackJson[] };
  return { items: data.items ?? [], status: res.status };
}

function placeholderSvg(message: string, sub?: string): string {
  const w = 800;
  const h = 200;
  const subline = sub
    ? `<text x="400" y="118" fill="#B3B3B3" text-anchor="middle" font-family="system-ui, Segoe UI, Helvetica, Arial, sans-serif" font-size="14">${escapeXml(sub)}</text>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="tbg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1a1a1a"/>
      <stop offset="100%" stop-color="#0d0d0d"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" rx="18" fill="url(#tbg)" stroke="#282828" stroke-width="2"/>
  <text x="400" y="88" fill="#FFFFFF" text-anchor="middle" font-family="system-ui, Segoe UI, Helvetica, Arial, sans-serif" font-size="18" font-weight="600">${escapeXml(message)}</text>
  ${subline}
</svg>`;
}

function renderTop3(opts: {
  tracks: SpotifyTrackJson[];
  covers: string[];
  rangeKey: string;
}): string {
  const { tracks, covers, rangeKey } = opts;
  const w = 800;
  const h = 268;
  const label = RANGE_LABEL[rangeKey] ?? rangeKey;

  const clipDefs = tracks
    .map((_, i) => {
      const y = 86 + i * 58;
      return `<clipPath id="ct${i}"><rect x="52" y="${y - 2}" width="52" height="52" rx="8"/></clipPath>`;
    })
    .join('');

  const rows = tracks
    .map((track, i) => {
      const y = 86 + i * 58;
      const rank = String(i + 1);
      const title =
        track.name.length > 42 ? `${track.name.slice(0, 40)}…` : track.name;
      const artists =
        track.artists?.map((a) => a.name).join(', ') || '—';
      const art =
        artists.length > 48 ? `${artists.slice(0, 46)}…` : artists;
      const cover = covers[i] ?? '';
      return `
  <rect x="12" y="${y - 10}" width="776" height="54" rx="12" fill="#181818" stroke="#282828"/>
  <circle cx="32" cy="${y + 24}" r="14" fill="#1DB954"/>
  <text x="32" y="${y + 29}" fill="#121212" text-anchor="middle" font-family="system-ui, Segoe UI, Helvetica, Arial, sans-serif" font-size="14" font-weight="700">${rank}</text>
  <image clip-path="url(#ct${i})" href="${cover}" x="52" y="${y - 2}" width="52" height="52" preserveAspectRatio="xMidYMid slice"/>
  <text x="120" y="${y + 14}" fill="#FFFFFF" font-family="system-ui, Segoe UI, Helvetica, Arial, sans-serif" font-size="16" font-weight="600">${escapeXml(title)}</text>
  <text x="120" y="${y + 36}" fill="#B3B3B3" font-family="system-ui, Segoe UI, Helvetica, Arial, sans-serif" font-size="13">${escapeXml(art)}</text>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Top 3 tracks">
  <title>Top 3 tracks</title>
  <defs>
    <linearGradient id="tbgm" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1a1a1a"/>
      <stop offset="100%" stop-color="#0d0d0d"/>
    </linearGradient>
    ${clipDefs}
  </defs>
  <rect width="${w}" height="${h}" rx="18" fill="url(#tbgm)" stroke="#282828" stroke-width="2"/>
  <text x="24" y="40" fill="#FFFFFF" font-family="system-ui, Segoe UI, Helvetica, Arial, sans-serif" font-size="20" font-weight="700">Топ-3 треков</text>
  <text x="24" y="62" fill="#B3B3B3" font-family="system-ui, Segoe UI, Helvetica, Arial, sans-serif" font-size="13">${escapeXml(label)} · обновляется при открытии профиля</text>
  ${rows}
  <text x="24" y="${h - 14}" fill="#1DB954" font-family="system-ui, Segoe UI, Helvetica, Arial, sans-serif" font-size="12" font-weight="600">SPOTIFY</text>
</svg>`;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  const q = req.query.range;
  const fromQuery =
    typeof q === 'string' && VALID_RANGES.has(q) ? q : undefined;
  const fromEnv = process.env.SPOTIFY_TOP_TIME_RANGE;
  const rangeKey =
    fromQuery ??
    (fromEnv && VALID_RANGES.has(fromEnv) ? fromEnv : 'short_term');

  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader(
    'Cache-Control',
    'public, s-maxage=1800, stale-while-revalidate=3600',
  );

  try {
    const token = await getUserAccessFromRefresh();
    if (!token) {
      const svg = placeholderSvg(
        'Топ-3: нужен SPOTIFY_REFRESH_TOKEN',
        'Добавьте refresh token со scope user-top-read (Vercel → Environment Variables).',
      );
      return res.status(200).send(svg);
    }

    const { items: tracks, status: topStatus } = await fetchTopTracks(
      token,
      rangeKey,
    );
    if (!tracks.length) {
      const sub =
        topStatus === 403
          ? 'Нет scope user-top-read — заново авторизуйтесь и обновите SPOTIFY_REFRESH_TOKEN в Vercel.'
          : 'Проверьте scope user-top-read и историю прослушиваний в Spotify.';
      const svg = placeholderSvg('Не удалось загрузить топ', sub);
      return res.status(200).send(svg);
    }

    const covers: string[] = [];
    for (const t of tracks) {
      const url = pickCoverUrl(t);
      if (!url) {
        covers.push(
          'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
        );
        continue;
      }
      covers.push(await imageToDataUri(url));
    }

    const svg = renderTop3({ tracks, covers, rangeKey });
    return res.status(200).send(svg);
  } catch (e) {
    console.error(e);
    const svg = placeholderSvg('Ошибка Spotify top API', 'См. логи Vercel → Functions.');
    return res.status(200).send(svg);
  }
}
