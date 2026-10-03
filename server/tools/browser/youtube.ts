import { ITool, ToolResult } from '../types.js';
import { browserSession } from './browserSession.js';
import { cleanYouTubePlaylistQuery } from '../../utils/queryCleaner.js';

export const youtubePlayPlaylistTool: ITool = {
  name: 'browser.youtube_play_playlist',
  category: 'browser',
  description: 'Opens YouTube, searches for a playlist, opens the first matching playlist, and starts playback.',
  parameters: [
    {
      name: 'query',
      type: 'string',
      description: 'Playlist topic to search for on YouTube',
      required: true,
    },
  ],
  dangerLevel: 'safe',
  async execute(params: { query: string }): Promise<ToolResult> {
    try {
      const page = await browserSession.getActivePage();
      const rawQuery = params.query.trim();
      const cleanTopic = cleanYouTubePlaylistQuery(rawQuery);
      const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${cleanTopic} плейлист`)}`;

      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // 1. Try finding a direct playlist watch link from search results (fastest & most reliable)
      const directWatchLink = page.locator('a[href*="/watch?v="][href*="list="]:visible').first();
      if (await directWatchLink.isVisible({ timeout: 3000 }).catch(() => false)) {
        const title = (await directWatchLink.textContent().catch(() => null)) || 'найденный плейлист';
        await directWatchLink.click({ timeout: 5000 });
        await page.waitForTimeout(1200);

        // Ensure playback
        await page.evaluate(() => {
          const v = document.querySelector('video');
          if (v && v.paused) v.play();
        }).catch(() => {});

        return {
          success: true,
          data: { query: rawQuery, playlistTitle: title.trim(), url: page.url() },
          message: `На YouTube найден плейлист "${title.trim()}" и запущено воспроизведение.`,
        };
      }

      // 2. Otherwise open the playlist overview page
      const playlistLink = page.locator('a[href*="/playlist?list="]:visible').first();
      await playlistLink.waitFor({ state: 'visible', timeout: 15000 });
      const playlistTitle = (await playlistLink.getAttribute('title').catch(() => null))
        || (await playlistLink.textContent().catch(() => null))
        || 'найденный плейлист';

      await playlistLink.click();
      await page.waitForLoadState('domcontentloaded').catch(() => {});

      // 3. On the playlist overview page, start playback via first video or Play all button
      const playButtons = [
        'ytd-playlist-header-renderer a[href*="watch"]',
        'a[href*="/watch?v="][href*="list="]',
        'button[aria-label*="Воспроизвести все" i]',
        'button[aria-label*="Play all" i]',
        'a[aria-label*="Воспроизвести все" i]',
        'button:has-text("Воспроизвести все")',
        'button:has-text("Play all")',
        'ytd-playlist-video-renderer a#thumbnail',
        'ytd-playlist-video-renderer a#video-title',
        'button.ytp-play-button',
      ];

      for (const sel of playButtons) {
        try {
          const btn = page.locator(sel).first();
          if (await btn.isVisible({ timeout: 1500 })) {
            await btn.click({ timeout: 4000 });
            break;
          }
        } catch {}
      }

      // 4. Ensure video playback is unpaused
      await page.waitForTimeout(1000);
      await page.evaluate(() => {
        const v = document.querySelector('video');
        if (v && v.paused) v.play();
      }).catch(() => {});

      return {
        success: true,
        data: { query: rawQuery, playlistTitle: playlistTitle.trim(), url: page.url() },
        message: `На YouTube найден плейлист "${playlistTitle.trim()}" и запущено воспроизведение.`,
      };
    } catch (err: any) {
      return { success: false, error: `Не удалось найти или включить плейлист на YouTube: ${err.message}` };
    }
  },
};
