import { chromium, Browser, BrowserContext, Page } from 'playwright';

/**
 * Singleton Browser Session Manager for JARVIS.
 * Keeps an interactive Chrome instance open, tracks tabs, and manages automation lifecycle.
 */
export class BrowserSessionManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private pages: Page[] = [];
  private activePageIndex: number = 0;

  public async getOrLaunchBrowser(headless: boolean = false): Promise<BrowserContext> {
    if (this.context && this.browser && this.browser.isConnected()) {
      return this.context;
    }

    // Launch Chromium with user-friendly desktop viewport and stealth arguments
    this.browser = await chromium.launch({
      headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--start-maximized',
      ],
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1440, height: 900 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    });

    const defaultPage = await this.context.newPage();
    this.pages = [defaultPage];
    this.activePageIndex = 0;

    return this.context;
  }

  public async getActivePage(): Promise<Page> {
    if (!this.context || this.pages.length === 0) {
      await this.getOrLaunchBrowser(false);
    }
    const page = this.pages[this.activePageIndex] || this.pages[0];
    return page;
  }

  public async newTab(url?: string): Promise<Page> {
    const ctx = await this.getOrLaunchBrowser(false);
    const page = await ctx.newPage();
    if (url) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    }
    this.pages.push(page);
    this.activePageIndex = this.pages.length - 1;
    return page;
  }

  public async closeTab(index?: number): Promise<boolean> {
    const idx = index !== undefined ? index : this.activePageIndex;
    if (this.pages[idx]) {
      await this.pages[idx].close().catch(() => {});
      this.pages.splice(idx, 1);
      this.activePageIndex = Math.max(0, this.pages.length - 1);
      return true;
    }
    return false;
  }

  public async switchTab(index: number): Promise<Page | null> {
    if (this.pages[index]) {
      this.activePageIndex = index;
      await this.pages[index].bringToFront().catch(() => {});
      return this.pages[index];
    }
    return null;
  }

  public async listTabs(): Promise<{ index: number; url: string; title: string; isActive: boolean }[]> {
    const results = [];
    for (let i = 0; i < this.pages.length; i++) {
      const p = this.pages[i];
      results.push({
        index: i,
        url: p.url(),
        title: await p.title().catch(() => 'Untitled'),
        isActive: i === this.activePageIndex,
      });
    }
    return results;
  }

  public async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
      this.context = null;
      this.pages = [];
      this.activePageIndex = 0;
    }
  }

  public isRunning(): boolean {
    return !!this.browser && this.browser.isConnected();
  }
}

export const browserSession = new BrowserSessionManager();
