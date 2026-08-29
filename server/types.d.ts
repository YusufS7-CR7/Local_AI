declare module 'screenshot-desktop' {
  interface ScreenshotOptions {
    format?: 'png' | 'jpeg';
    screen?: number | string;
    filename?: string;
  }
  function screenshot(options?: ScreenshotOptions): Promise<Buffer>;
  namespace screenshot {
    function listDisplays(): Promise<Array<{ id: string; name: string }>>;
  }
  export default screenshot;
}
