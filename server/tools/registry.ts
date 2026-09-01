import { ITool, ToolSchema, ToolResult, ToolExecutionContext } from './types.js';

const TOOL_ALIASES: Record<string, string> = {
  // App & Browser open aliases
  'computer.open_tab': 'computer.open_app',
  'computer.open_browser': 'computer.open_app',
  'computer.open': 'computer.open_app',
  'computer.launch': 'computer.open_app',
  'computer.launch_app': 'computer.open_app',
  'computer.run_app': 'computer.open_app',
  'computer.start_app': 'computer.open_app',
  'browser.search': 'computer.open_app',
  'browser.search_web': 'computer.open_app',
  'browser.open_url': 'computer.open_app',
  'open_app': 'computer.open_app',
  'open_browser': 'computer.open_app',
  'open_chrome': 'computer.open_app',
  'open_tab': 'computer.open_app',

  // Window management
  'list_windows': 'computer.list_windows',
  'list_apps': 'computer.list_windows',
  'computer.list_apps': 'computer.list_windows',
  'computer.get_windows': 'computer.list_windows',
  'computer.get_processes': 'computer.list_windows',
  'switch_window': 'computer.switch_window',
  'focus_window': 'computer.switch_window',

  // Screen capture
  'screenshot': 'computer.screenshot',
  'take_screenshot': 'computer.screenshot',
  'computer.take_screenshot': 'computer.screenshot',
  'screen.capture': 'computer.screenshot',

  // Visual Grounding & Locators
  'visual_click': 'computer.visual_click',
  'visual_locate': 'computer.visual_click',
  'computer.visual_locate': 'computer.visual_click',
  'click_element': 'computer.visual_click',
  'computer.click_element': 'computer.visual_click',
  'click_button': 'computer.visual_click',

  // Filesystem
  'search_files': 'filesystem.search',
  'find_files': 'filesystem.search',
  'filesystem.find': 'filesystem.search',
  'filesystem.find_files': 'filesystem.search',
  'read_file': 'filesystem.read',
  'write_file': 'filesystem.write',
  'delete_file': 'filesystem.delete',
};

/**
 * Central Tool Registry for JARVIS Agent.
 * Handles registration, schema generation, discovery, and execution dispatch.
 */
export class ToolRegistry {
  private tools = new Map<string, ITool>();

  public register(tool: ITool): void {
    if (this.tools.has(tool.name)) {
      console.warn(`[ToolRegistry] Overwriting existing tool: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  public get(name: string): ITool | undefined {
    const canonicalName = TOOL_ALIASES[name] || name;
    return this.tools.get(canonicalName);
  }

  public getAll(): ITool[] {
    return Array.from(this.tools.values());
  }

  public getByCategory(category: ITool['category']): ITool[] {
    return this.getAll().filter(t => t.category === category);
  }

  /**
   * Generates standard OpenAI/Ollama tool calling schemas
   */
  public getSchemas(): ToolSchema[] {
    return this.getAll().map(tool => {
      const properties: Record<string, { type: string; description: string; enum?: string[] }> = {};
      const required: string[] = [];

      for (const param of tool.parameters) {
        properties[param.name] = {
          type: param.type,
          description: param.description,
          ...(param.enum ? { enum: param.enum } : {}),
        };
        if (param.required) {
          required.push(param.name);
        }
      }

      return {
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: {
            type: 'object',
            properties,
            required,
          },
        },
      };
    });
  }

  /**
   * Formats a human-readable prompt listing all tools for models that don't support native tool-calling
   */
  public getToolDocumentation(): string {
    return this.getAll()
      .map(tool => {
        const params = tool.parameters
          .map(p => `    - ${p.name} (${p.type}${p.required ? ', required' : ''}): ${p.description}`)
          .join('\n');
        return `• ${tool.name} [${tool.dangerLevel.toUpperCase()}]\n  Description: ${tool.description}\n  Parameters:\n${params || '    None'}`;
      })
      .join('\n\n');
  }

  public async execute(
    name: string,
    params: Record<string, any>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const canonicalName = TOOL_ALIASES[name] || name;
    const tool = this.tools.get(canonicalName);

    if (!tool) {
      return {
        success: false,
        error: `Tool "${name}" not found in registry. Available tools: ${Array.from(this.tools.keys()).join(', ')}`,
      };
    }

    // Parameter normalization for common aliases
    const normalizedParams = { ...params };
    if (canonicalName === 'computer.open_app') {
      if (!normalizedParams.appName) {
        normalizedParams.appName = 'chrome';
      }
      if (['вкладка', 'вкладку', 'вкладки', 'browser', 'браузер', 'tab'].includes(normalizedParams.appName.toLowerCase())) {
        normalizedParams.appName = 'chrome';
      }
      if (normalizedParams.url && !normalizedParams.args) {
        normalizedParams.args = normalizedParams.url;
      }
      if (normalizedParams.query && !normalizedParams.args) {
        normalizedParams.args = normalizedParams.query;
      }
    }

    try {
      return await tool.execute(normalizedParams, context);
    } catch (err: any) {
      console.error(`[ToolRegistry] Error executing ${canonicalName}:`, err);
      return {
        success: false,
        error: `Execution error in ${canonicalName}: ${err.message || String(err)}`,
      };
    }
  }
}

export const toolRegistry = new ToolRegistry();
