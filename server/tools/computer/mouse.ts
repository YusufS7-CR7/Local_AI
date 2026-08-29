import { ITool, ToolResult } from '../types.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Windows User32 Mouse Automation Helper
 */
async function runMouseAction(actionCode: string): Promise<string> {
  const script = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class WinMouse {
    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int X, int Y);

    [DllImport("user32.dll")]
    public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);

    public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    public const uint MOUSEEVENTF_LEFTUP = 0x0004;
    public const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
    public const uint MOUSEEVENTF_RIGHTUP = 0x0010;
    public const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
    public const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
    public const uint MOUSEEVENTF_WHEEL = 0x0800;

    public static void Click(int x, int y, string button) {
        SetCursorPos(x, y);
        System.Threading.Thread.Sleep(50);
        if (button == "left") {
            mouse_event(MOUSEEVENTF_LEFTDOWN, (uint)x, (uint)y, 0, 0);
            System.Threading.Thread.Sleep(50);
            mouse_event(MOUSEEVENTF_LEFTUP, (uint)x, (uint)y, 0, 0);
        } else if (button == "right") {
            mouse_event(MOUSEEVENTF_RIGHTDOWN, (uint)x, (uint)y, 0, 0);
            System.Threading.Thread.Sleep(50);
            mouse_event(MOUSEEVENTF_RIGHTUP, (uint)x, (uint)y, 0, 0);
        } else if (button == "double") {
            mouse_event(MOUSEEVENTF_LEFTDOWN, (uint)x, (uint)y, 0, 0);
            mouse_event(MOUSEEVENTF_LEFTUP, (uint)x, (uint)y, 0, 0);
            System.Threading.Thread.Sleep(100);
            mouse_event(MOUSEEVENTF_LEFTDOWN, (uint)x, (uint)y, 0, 0);
            mouse_event(MOUSEEVENTF_LEFTUP, (uint)x, (uint)y, 0, 0);
        }
    }

    public static void Scroll(int amount) {
        mouse_event(MOUSEEVENTF_WHEEL, 0, 0, (uint)amount, 0);
    }
}
"@
${actionCode}
`;
  const { stdout } = await execAsync(`powershell -ExecutionPolicy Bypass -Command "${script.replace(/\r?\n/g, ' ')}"`);
  return stdout;
}

export const mouseMoveTool: ITool = {
  name: 'computer.mouse_move',
  category: 'computer',
  description: 'Moves the mouse cursor to absolute screen coordinates (x, y).',
  parameters: [
    { name: 'x', type: 'number', description: 'X screen coordinate in pixels (from top-left)', required: true },
    { name: 'y', type: 'number', description: 'Y screen coordinate in pixels (from top-left)', required: true },
  ],
  dangerLevel: 'safe',
  async execute(params: { x: number; y: number }): Promise<ToolResult> {
    try {
      await runMouseAction(`[WinMouse]::SetCursorPos(${Math.round(params.x)}, ${Math.round(params.y)})`);
      return { success: true, message: `Mouse moved to (${params.x}, ${params.y})` };
    } catch (err: any) {
      return { success: false, error: `Failed to move mouse: ${err.message}` };
    }
  },
};

export const mouseClickTool: ITool = {
  name: 'computer.click',
  category: 'computer',
  description: 'Clicks the mouse at specified coordinates (x, y) or at current cursor position.',
  parameters: [
    { name: 'x', type: 'number', description: 'X coordinate to click (optional)', required: false },
    { name: 'y', type: 'number', description: 'Y coordinate to click (optional)', required: false },
    {
      name: 'button',
      type: 'string',
      description: 'Mouse button to click: "left" (default), "right", or "double"',
      enum: ['left', 'right', 'double'],
      required: false,
    },
  ],
  dangerLevel: 'safe',
  async execute(params: { x?: number; y?: number; button?: 'left' | 'right' | 'double' }): Promise<ToolResult> {
    const btn = params.button || 'left';
    const x = params.x !== undefined ? Math.round(params.x) : 0;
    const y = params.y !== undefined ? Math.round(params.y) : 0;

    try {
      if (params.x !== undefined && params.y !== undefined) {
        await runMouseAction(`[WinMouse]::Click(${x}, ${y}, "${btn}")`);
      } else {
        await runMouseAction(`
$pos = [System.Windows.Forms.Cursor]::Position
[WinMouse]::Click($pos.X, $pos.Y, "${btn}")
`);
      }
      return { success: true, message: `${btn.toUpperCase()} click executed at (${x}, ${y})` };
    } catch (err: any) {
      return { success: false, error: `Click failed: ${err.message}` };
    }
  },
};

export const mouseScrollTool: ITool = {
  name: 'computer.scroll',
  category: 'computer',
  description: 'Scrolls the mouse wheel up or down.',
  parameters: [
    {
      name: 'direction',
      type: 'string',
      description: 'Direction to scroll: "up" or "down"',
      enum: ['up', 'down'],
      required: true,
    },
    {
      name: 'amount',
      type: 'number',
      description: 'Number of scroll steps (default 3)',
      required: false,
    },
  ],
  dangerLevel: 'safe',
  async execute(params: { direction: 'up' | 'down'; amount?: number }): Promise<ToolResult> {
    const steps = params.amount || 3;
    const wheelUnits = (params.direction === 'up' ? 120 : -120) * steps;

    try {
      await runMouseAction(`[WinMouse]::Scroll(${wheelUnits})`);
      return { success: true, message: `Scrolled ${params.direction} by ${steps} units.` };
    } catch (err: any) {
      return { success: false, error: `Scroll failed: ${err.message}` };
    }
  },
};
