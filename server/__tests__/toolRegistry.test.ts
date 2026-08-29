import { describe, it, expect, beforeEach } from 'vitest';
import { ToolRegistry } from '../tools/registry.js';
import { ITool } from '../tools/types.js';

describe('Tool Registry', () => {
  let registry: ToolRegistry;

  const sampleTool: ITool = {
    name: 'computer.open_app',
    category: 'computer',
    description: 'Launches or activates a desktop application',
    dangerLevel: 'safe',
    parameters: [
      { name: 'appName', type: 'string', description: 'Name of the app', required: true },
      { name: 'args', type: 'string', description: 'Command line arguments', required: false },
    ],
    execute: async (params) => {
      return { success: true, data: { launched: params.appName, args: params.args } };
    },
  };

  beforeEach(() => {
    registry = new ToolRegistry();
    registry.register(sampleTool);
  });

  it('should register and retrieve tools by canonical name', () => {
    const tool = registry.get('computer.open_app');
    expect(tool).toBeDefined();
    expect(tool?.name).toBe('computer.open_app');
  });

  it('should resolve tool aliases to canonical names', () => {
    expect(registry.get('open_chrome')?.name).toBe('computer.open_app');
    expect(registry.get('open_browser')?.name).toBe('computer.open_app');
    expect(registry.get('computer.open')?.name).toBe('computer.open_app');
    expect(registry.get('computer.open_tab')?.name).toBe('computer.open_app');
  });

  it('should generate OpenAI-compatible tool calling schemas', () => {
    const schemas = registry.getSchemas();
    expect(schemas.length).toBe(1);
    expect(schemas[0].type).toBe('function');
    expect(schemas[0].function.name).toBe('computer.open_app');
    expect(schemas[0].function.parameters.properties.appName).toBeDefined();
    expect(schemas[0].function.parameters.required).toContain('appName');
  });

  it('should generate human-readable documentation', () => {
    const doc = registry.getToolDocumentation();
    expect(doc).toContain('• computer.open_app [SAFE]');
    expect(doc).toContain('appName (string, required)');
  });

  it('should execute tool and normalize alias parameters', async () => {
    const result = await registry.execute('open_tab', { appName: 'browser', url: 'https://example.com' });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      launched: 'chrome',
      args: 'https://example.com',
    });
  });

  it('should return error for unknown tool execution', async () => {
    const result = await registry.execute('non_existent_tool', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found in registry');
  });
});
