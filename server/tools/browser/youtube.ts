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
      const playlistLink = page.locator('a[href*="/playlist?list="]:visible').first();
      await playlistLink.waitFor({ state: 'visible', timeout: 15000 });
      const playlistTitle = (await playlistLink.getAttribute('title').catch(() => null))
        || (await playlistLink.textContent().catch(() => null))
        || 'найденный плейлист';

      await playlistLink.click();
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      await page.locator('button.ytp-play-button').first().click({ timeout: 15000 });

      return {
        success: true,
        data: { query, playlistTitle: playlistTitle.trim(), url: page.url() },
        message: `На YouTube найден плейлист "${playlistTitle.trim()}" и запущено воспроизведение.`,
      };
    } catch (err: any) {
      return { success: false, error: `Не удалось найти или включить плейлист на YouTube: ${err.message}` };
    }
  },
};
