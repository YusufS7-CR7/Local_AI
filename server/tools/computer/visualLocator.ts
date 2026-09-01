import { ITool, ToolResult } from '../types.js';
import { screenshotTool } from './screenshot.js';
import { mouseClickTool, mouseMoveTool } from './mouse.js';
import { brain } from '../../router/brain.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const visualLocateAndClickTool: ITool = {
  name: 'computer.visual_click',
  category: 'computer',
  description: 'Visually scans the screen in real-time using Vision AI, locates the exact button, icon, text field, or UI element by its description, and clicks on it.',
  parameters: [
    {
      name: 'elementDescription',
      type: 'string',
      description: 'Clear description of the UI element, button, link, or icon to find on screen (e.g. "YouTube play button", "Search input field", "Chat with name Alex", "Send button", "Close icon")',
      required: true,
    },
    {
      name: 'button',
      type: 'string',
      description: 'Mouse button to click: "left" (default), "right", or "double"',
      enum: ['left', 'right', 'double'],
      required: false,
    },
  ],
  dangerLevel: 'moderate',
  async execute(params: { elementDescription: string; button?: 'left' | 'right' | 'double' }): Promise<ToolResult> {
    const description = params.elementDescription.trim();
    const btn = params.button || 'left';

    try {
      // 1. Get primary screen resolution from Windows
      const { stdout: resOut } = await execAsync(`powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; $s = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; Write-Output ('{0}x{1}' -f $s.Width, $s.Height)"`);
      const [screenWidth, screenHeight] = (resOut.trim() || '1920x1080').split('x').map(n => parseInt(n) || 1080);

      // 2. Capture desktop frame directly in RAM
      const screenRes = await screenshotTool.execute({ resizeWidth: 1024 });
      if (!screenRes.success || !screenRes.screenshot) {
        return { success: false, error: 'Не удалось захватить кадр экрана для визуального поиска.' };
      }

      const imageBase64 = screenRes.screenshot.replace(/^data:image\/\w+;base64,/, '');

      // 3. Vision Grounding Model: identify coordinates normalized to 1000x1000 grid or pixel space
      const prompt = `Ты — система компьютерного зрения JARVIS.
На этом скриншоте экрана Windows (разрешение ${screenWidth}x${screenHeight}) найди элемент: "${description}".

Определи точный центр этого элемента (x и y в пикселях от верхнего левого угла экрана [0..${screenWidth}], [0..${screenHeight}]).
Ответь строго JSON (без Markdown и без кавычек вокруг):
{
  "found": true или false,
  "x": число (пиксель по горизонтали),
  "y": число (пиксель по вертикали),
  "elementName": "описание найденного элемента",
  "confidence": число от 0.0 до 1.0,
  "explanation": "почему выбран этот элемент / где он расположен"
}`;

      const response = await brain.generateWithVision({
        prompt,
        images: [imageBase64],
      });

      const cleanJson = response.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
      const parsed = JSON.parse(cleanJson);

      if (!parsed.found || typeof parsed.x !== 'number' || typeof parsed.y !== 'number') {
        return {
          success: false,
          error: `Элемент «${description}» не найден на текущем экране: ${parsed.explanation || 'элемент отсутствует в видимой области'}.`,
        };
      }

      // Clamp coordinates to screen bounds
      const targetX = Math.max(0, Math.min(screenWidth, Math.round(parsed.x)));
      const targetY = Math.max(0, Math.min(screenHeight, Math.round(parsed.y)));

      // 4. Move and Click
      await mouseMoveTool.execute({ x: targetX, y: targetY });
      await mouseClickTool.execute({ x: targetX, y: targetY, button: btn });

      return {
        success: true,
        data: {
          x: targetX,
          y: targetY,
          element: parsed.elementName || description,
          confidence: parsed.confidence,
        },
        message: `Элемент «${parsed.elementName || description}» найден на экране в точке (${targetX}, ${targetY}) и нажат (${btn} клик).`,
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Ошибка визуального поиска и клика: ${err.message || String(err)}`,
      };
    }
  },
};
