import { ITool, ToolResult } from '../types.js';
import { browserSession } from './browserSession.js';

export const browserReadPageTool: ITool = {
  name: 'browser.read_page',
  category: 'browser',
  description: 'Extracts the visible text content, headings, links, and forms from the active webpage.',
  parameters: [
    {
      name: 'maxLength',
      type: 'number',
      description: 'Maximum characters of text to return (default: 4000)',
      required: false,
    },
  ],
  dangerLevel: 'safe',
  async execute(params: { maxLength?: number }): Promise<ToolResult> {
    try {
      const page = await browserSession.getActivePage();
      const title = await page.title().catch(() => '');
      const url = page.url();

      const pageData = await page.evaluate(() => {
        // Extract visible text cleanly
        const bodyText = document.body ? document.body.innerText : '';
        
        // Extract key interactive elements
        const links = Array.from(document.querySelectorAll('a[href]'))
          .slice(0, 15)
          .map(a => ({ text: a.textContent?.trim(), href: (a as HTMLAnchorElement).href }))
          .filter(l => l.text);

        const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
          .slice(0, 10)
          .map(h => h.textContent?.trim())
          .filter(Boolean);

        return { bodyText, links, headings };
      });

      const max = params.maxLength || 4000;
      const truncatedText = pageData.bodyText.length > max
        ? pageData.bodyText.slice(0, max) + '\n... [Content truncated]'
        : pageData.bodyText;

      return {
        success: true,
        data: {
          title,
          url,
          headings: pageData.headings,
          links: pageData.links,
          content: truncatedText,
        },
        message: `Page: "${title}" (${url})\nContent:\n${truncatedText}`,
      };
    } catch (err: any) {
      return { success: false, error: `Failed to read page: ${err.message}` };
    }
  },
};

export const browserScreenshotTool: ITool = {
  name: 'browser.screenshot_page',
  category: 'browser',
  description: 'Takes a screenshot of the currently active browser page/tab.',
  parameters: [
    {
      name: 'fullPage',
      type: 'boolean',
      description: 'Whether to take a full scrollable page screenshot (default: false)',
      required: false,
    },
  ],
  dangerLevel: 'safe',
  async execute(params: { fullPage?: boolean }): Promise<ToolResult> {
    try {
      const page = await browserSession.getActivePage();
      const buffer = await page.screenshot({
        fullPage: params.fullPage || false,
        type: 'png',
      });

      const base64 = buffer.toString('base64');
      return {
        success: true,
        screenshot: `data:image/png;base64,${base64}`,
        message: 'Browser page screenshot captured.',
      };
    } catch (err: any) {
      return { success: false, error: `Failed to capture browser screenshot: ${err.message}` };
    }
  },
};
