import { ITool, ToolResult } from '../types.js';
import { browserSession } from './browserSession.js';

export const browserOpenTool: ITool = {
  name: 'browser.open',
  category: 'browser',
  description: 'Launches or connects to the interactive Chrome browser and optionally opens an initial URL.',
  parameters: [
    {
      name: 'url',
      type: 'string',
      description: 'Initial URL to navigate to (e.g. "https://google.com", "https://youtube.com")',
      required: false,
    },
  ],
  dangerLevel: 'safe',
  async execute(params: { url?: string }): Promise<ToolResult> {
    try {
      await browserSession.getOrLaunchBrowser(false);
      const page = await browserSession.getActivePage();
      if (params.url) {
        let fullUrl = params.url;
        if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
          fullUrl = `https://${fullUrl}`;
        }
        await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        const title = await page.title().catch(() => '');
        return {
          success: true,
          data: { url: page.url(), title },
          message: `Browser opened and navigated to "${fullUrl}" (Title: ${title})`,
        };
      }

      return {
        success: true,
        message: 'Browser window launched successfully.',
      };
    } catch (err: any) {
      return { success: false, error: `Failed to open browser: ${err.message}` };
    }
  },
};

export const browserNavigateTool: ITool = {
  name: 'browser.navigate',
  category: 'browser',
  description: 'Navigates the active browser tab to a specific URL.',
  parameters: [
    {
      name: 'url',
      type: 'string',
      description: 'The URL to navigate to',
      required: true,
    },
  ],
  dangerLevel: 'safe',
  async execute(params: { url: string }): Promise<ToolResult> {
    try {
      const page = await browserSession.getActivePage();
      let fullUrl = params.url;
      if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
        fullUrl = `https://${fullUrl}`;
      }
      await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const title = await page.title().catch(() => '');
      return {
        success: true,
        data: { url: page.url(), title },
        message: `Navigated to ${fullUrl} (Title: "${title}")`,
      };
    } catch (err: any) {
      return { success: false, error: `Navigation failed: ${err.message}` };
    }
  },
};

export const browserNewTabTool: ITool = {
  name: 'browser.new_tab',
  category: 'browser',
  description: 'Opens a new browser tab with an optional URL.',
  parameters: [
    {
      name: 'url',
      type: 'string',
      description: 'Optional URL to open in the new tab',
      required: false,
    },
  ],
  dangerLevel: 'safe',
  async execute(params: { url?: string }): Promise<ToolResult> {
    try {
      const page = await browserSession.newTab(params.url);
      const title = await page.title().catch(() => 'New Tab');
      return {
        success: true,
        data: { url: page.url(), title },
        message: `Opened new tab: ${params.url || 'about:blank'}`,
      };
    } catch (err: any) {
      return { success: false, error: `Failed to open new tab: ${err.message}` };
    }
  },
};

export const browserCloseTabTool: ITool = {
  name: 'browser.close_tab',
  category: 'browser',
  description: 'Closes the current active browser tab or a specified tab index.',
  parameters: [
    {
      name: 'index',
      type: 'number',
      description: 'Tab index to close (default: active tab)',
      required: false,
    },
  ],
  dangerLevel: 'safe',
  async execute(params: { index?: number }): Promise<ToolResult> {
    try {
      const closed = await browserSession.closeTab(params.index);
      return {
        success: closed,
        message: closed ? 'Tab closed successfully.' : 'Tab not found.',
      };
    } catch (err: any) {
      return { success: false, error: `Failed to close tab: ${err.message}` };
    }
  },
};

export const browserListTabsTool: ITool = {
  name: 'browser.list_tabs',
  category: 'browser',
  description: 'Lists all open browser tabs with their titles and URLs.',
  parameters: [],
  dangerLevel: 'safe',
  async execute(): Promise<ToolResult> {
    try {
      const tabs = await browserSession.listTabs();
      return {
        success: true,
        data: { tabs },
        message: `Found ${tabs.length} open tab(s).`,
      };
    } catch (err: any) {
      return { success: false, error: `Failed to list tabs: ${err.message}` };
    }
  },
};

export const browserSwitchTabTool: ITool = {
  name: 'browser.switch_tab',
  category: 'browser',
  description: 'Switches the active browser tab by tab index.',
  parameters: [
    {
      name: 'index',
      type: 'number',
      description: 'Zero-based index of the tab to switch to',
      required: true,
    },
  ],
  dangerLevel: 'safe',
  async execute(params: { index: number }): Promise<ToolResult> {
    try {
      const page = await browserSession.switchTab(params.index);
      if (page) {
        return {
          success: true,
          message: `Switched to tab ${params.index}: "${await page.title().catch(() => '')}"`,
        };
      }
      return { success: false, error: `Tab index ${params.index} not found.` };
    } catch (err: any) {
      return { success: false, error: `Failed to switch tab: ${err.message}` };
    }
  },
};
