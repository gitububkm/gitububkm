import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  fetchNowPlaying,
  fetchTrack,
  getClientCredentialsToken,
  getUserAccessFromRefresh,
  imageToDataUri,
  pickCoverUrl,
  type SpotifyTrackJson,
} from '../lib/spotify-common';
import { renderCard } from '../lib/readme-spotify-card';

const DEFAULT_FEATURED_ID = '5rgy6ghBq1eRApCkeUdJXf';

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
