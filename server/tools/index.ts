import { toolRegistry } from './registry.js';

// Computer Tools
import { screenshotTool } from './computer/screenshot.js';
import { mouseMoveTool, mouseClickTool, mouseScrollTool } from './computer/mouse.js';
import { keyboardTypeTool, keyboardKeyTool } from './computer/keyboard.js';
import { listWindowsTool, switchWindowTool } from './computer/window.js';
import { openAppTool, closeAppTool } from './computer/app.js';
import { executeCommandTool } from './computer/command.js';
import { readScreenTool } from './computer/screen.js';
import { telegramSendMessageTool } from './computer/telegram.js';

// Browser Tools
import { browserOpenTool, browserNavigateTool, browserNewTabTool, browserCloseTabTool, browserListTabsTool, browserSwitchTabTool } from './browser/navigation.js';
import { browserClickTool, browserTypeTool, browserScrollTool } from './browser/interact.js';
import { browserReadPageTool, browserScreenshotTool } from './browser/read.js';
import { youtubePlayPlaylistTool } from './browser/youtube.js';

// Filesystem Tools
import { filesystemSearchTool } from './filesystem/search.js';
import { filesystemReadTool, filesystemListDirTool } from './filesystem/read.js';
import { filesystemOpenTool, filesystemWriteTool, filesystemDeleteTool } from './filesystem/manage.js';

export function initializeTools(): void {
  // Register Computer Tools
  toolRegistry.register(screenshotTool);
  toolRegistry.register(mouseMoveTool);
  toolRegistry.register(mouseClickTool);
  toolRegistry.register(mouseScrollTool);
  toolRegistry.register(keyboardTypeTool);
  toolRegistry.register(keyboardKeyTool);
  toolRegistry.register(listWindowsTool);
  toolRegistry.register(switchWindowTool);
  toolRegistry.register(openAppTool);
  toolRegistry.register(closeAppTool);
  toolRegistry.register(executeCommandTool);
  toolRegistry.register(readScreenTool);
  toolRegistry.register(telegramSendMessageTool);

  // Register Browser Tools
  toolRegistry.register(browserOpenTool);
  toolRegistry.register(browserNavigateTool);
  toolRegistry.register(browserNewTabTool);
  toolRegistry.register(browserCloseTabTool);
  toolRegistry.register(browserListTabsTool);
  toolRegistry.register(browserSwitchTabTool);
  toolRegistry.register(browserClickTool);
  toolRegistry.register(browserTypeTool);
  toolRegistry.register(browserScrollTool);
  toolRegistry.register(browserReadPageTool);
  toolRegistry.register(browserScreenshotTool);
  toolRegistry.register(youtubePlayPlaylistTool);

  // Register Filesystem Tools
  toolRegistry.register(filesystemSearchTool);
  toolRegistry.register(filesystemReadTool);
  toolRegistry.register(filesystemListDirTool);
  toolRegistry.register(filesystemOpenTool);
  toolRegistry.register(filesystemWriteTool);
  toolRegistry.register(filesystemDeleteTool);

  console.log(`[ToolRegistry] Successfully initialized ${toolRegistry.getAll().length} tools across Computer, Browser, and Filesystem categories.`);
}

export { toolRegistry };
