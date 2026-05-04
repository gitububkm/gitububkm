import { escapeXml, type SpotifyTrackJson } from './spotify-common';

export function barHeights(
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

export function renderCard(opts: {
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
