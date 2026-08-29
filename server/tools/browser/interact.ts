import { ITool, ToolResult } from '../types.js';
import { browserSession } from './browserSession.js';

export const browserClickTool: ITool = {
  name: 'browser.click_element',
  category: 'browser',
  description: 'Clicks an interactive HTML element on the page using a CSS/XPath selector or visible text (e.g. "button:has-text(\'Sign In\')", "input[type=\'submit\']", "text=\'Next\'").',
  parameters: [
    {
      name: 'selector',
      type: 'string',
      description: 'CSS selector, text selector (e.g. "text=Search"), or XPath',
      required: true,
    },
    {
      name: 'timeoutMs',
      type: 'number',
      description: 'Timeout in milliseconds to wait for element (default: 8000)',
      required: false,
    },
  ],
  dangerLevel: 'safe',
  async execute(params: { selector: string; timeoutMs?: number }): Promise<ToolResult> {
    try {
      const page = await browserSession.getActivePage();
      const timeout = params.timeoutMs || 8000;
      await page.click(params.selector, { timeout });
      return {
        success: true,
        message: `Clicked element "${params.selector}" successfully.`,
      };
    } catch (err: any) {
      return { success: false, error: `Failed to click "${params.selector}": ${err.message}` };
    }
  },
};

export const browserTypeTool: ITool = {
  name: 'browser.type_text',
  category: 'browser',
  description: 'Fills or types text into an input field or textarea on the active webpage.',
  parameters: [
    {
      name: 'selector',
      type: 'string',
      description: 'CSS selector of the input element (e.g. "textarea[name=\'q\']", "input[name=\'search\']", "#search-input")',
      required: true,
    },
    {
      name: 'text',
      type: 'string',
      description: 'The text to type',
      required: true,
    },
    {
      name: 'pressEnter',
      type: 'boolean',
      description: 'Whether to press Enter after typing to submit form (default: false)',
      required: false,
    },
  ],
  dangerLevel: 'moderate',
  async execute(params: { selector: string; text: string; pressEnter?: boolean }): Promise<ToolResult> {
    try {
      const page = await browserSession.getActivePage();
      await page.fill(params.selector, params.text, { timeout: 8000 });
      if (params.pressEnter) {
        await page.press(params.selector, 'Enter');
      }
      return {
        success: true,
        message: `Typed "${params.text}" into "${params.selector}"${params.pressEnter ? ' and pressed Enter' : ''}.`,
      };
    } catch (err: any) {
      return { success: false, error: `Failed to type in "${params.selector}": ${err.message}` };
    }
  },
};

export const browserScrollTool: ITool = {
  name: 'browser.scroll_page',
  category: 'browser',
  description: 'Scrolls the active browser webpage up or down.',
  parameters: [
    {
      name: 'direction',
      type: 'string',
      description: 'Direction to scroll: "up" or "down"',
      enum: ['up', 'down'],
      required: true,
    },
    {
      name: 'pixels',
      type: 'number',
      description: 'Amount in pixels to scroll (default: 600)',
      required: false,
    },
  ],
  dangerLevel: 'safe',
  async execute(params: { direction: 'up' | 'down'; pixels?: number }): Promise<ToolResult> {
    try {
      const page = await browserSession.getActivePage();
      const amount = (params.pixels || 600) * (params.direction === 'up' ? -1 : 1);
      await page.evaluate((y) => window.scrollBy(0, y), amount);
      return {
        success: true,
        message: `Scrolled webpage ${params.direction} by ${Math.abs(amount)}px.`,
      };
    } catch (err: any) {
      return { success: false, error: `Scroll failed: ${err.message}` };
    }
  },
};
