import { ITool, ToolResult } from '../types.js';
import { screenshotTool } from './screenshot.js';
import { mouseClickTool, mouseMoveTool } from './mouse.js';
import { brain } from '../../router/brain.js';
import { runPowerShell } from '../../utils/powershell.js';
import sharp from 'sharp';

export const visualLocateAndClickTool: ITool = {
  name: 'computer.visual_click',
  category: 'computer',
  description: 'Visually scans the screen in real-time using Vision AI, locates the exact button, icon, text field, or UI element by its description, and clicks on it with pixel accuracy.',
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
      const { stdout: resOut } = await runPowerShell(
        `Add-Type -AssemblyName System.Windows.Forms; $s = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; Write-Output ($s.Width.ToString() + 'x' + $s.Height.ToString())`
      );
      const [screenWidth, screenHeight] = (resOut.trim() || '1920x1080').split('x').map(n => parseInt(n) || 1080);

      // 2. Capture native desktop frame
      const screenRes = await screenshotTool.execute({});
      if (!screenRes.success || !screenRes.screenshot) {
        return { success: false, error: 'Не удалось захватить кадр экрана для визуального поиска.' };
      }

      const imageBase64 = screenRes.screenshot.replace(/^data:image\/\w+;base64,/, '');
      const buf = Buffer.from(imageBase64, 'base64');
      const meta = await sharp(buf).metadata();
      const imgW = meta.width || screenWidth;
      const imgH = meta.height || screenHeight;

      const scaleX = screenWidth / imgW;
      const scaleY = screenHeight / imgH;

      // 3. Vision Grounding Model: identify coordinates with bounding box support
      const prompt = `Ты — высокоточная система визуального позиционирования JARVIS.
На этом скриншоте экрана Windows (разрешение изображения: ${imgW}x${imgH} пикселей, реальный экран: ${screenWidth}x${screenHeight}) найди элемент: "${description}".

Определи точный центр этого элемента в пикселях скриншота (x: 0..${imgW}, y: 0..${imgH}).
Если это строка или список, выбери именно указанный элемент, а не первый попавшийся сверху.
Ответь строго JSON (без Markdown и без кавычек вокруг):
{
  "found": true,
  "x": число_x_в_пикселях,
  "y": число_y_в_пикселях,
  "box": { "ymin": число, "xmin": число, "ymax": число, "xmax": число },
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

      if (!parsed.found || (typeof parsed.x !== 'number' && !parsed.box)) {
        return {
          success: false,
          error: `Элемент «${description}» не найден на текущем экране: ${parsed.explanation || 'элемент отсутствует в видимой области'}.`,
        };
      }

      let targetX = typeof parsed.x === 'number' ? parsed.x : 0;
      let targetY = typeof parsed.y === 'number' ? parsed.y : 0;

      if (parsed.box && typeof parsed.box.ymin === 'number' && typeof parsed.box.ymax === 'number') {
        let bYmin = parsed.box.ymin;
        let bYmax = parsed.box.ymax;
        let bXmin = typeof parsed.box.xmin === 'number' ? parsed.box.xmin : targetX;
        let bXmax = typeof parsed.box.xmax === 'number' ? parsed.box.xmax : targetX;

        if (bYmax <= 1000 && imgH > 1000 && bYmin <= 1000) {
          bYmin = (bYmin / 1000) * imgH;
          bYmax = (bYmax / 1000) * imgH;
          bXmin = (bXmin / 1000) * imgW;
          bXmax = (bXmax / 1000) * imgW;
        }

        targetY = Math.round((bYmin + bYmax) / 2);
        targetX = Math.round((bXmin + bXmax) / 2);
      }

      // Convert to real screen bounds
      const finalX = Math.max(0, Math.min(screenWidth, Math.round(targetX * scaleX)));
      const finalY = Math.max(0, Math.min(screenHeight, Math.round(targetY * scaleY)));

      // 4. Move and Click
      await mouseMoveTool.execute({ x: finalX, y: finalY });
      const clickRes = await mouseClickTool.execute({ x: finalX, y: finalY, button: btn });
      if (!clickRes.success) {
        return {
          success: false,
          error: `Не удалось нажать на найденный элемент: ${clickRes.error}`,
        };
      }

      return {
        success: true,
        data: {
          x: finalX,
          y: finalY,
          element: parsed.elementName || description,
          confidence: parsed.confidence,
        },
        message: `Элемент «${parsed.elementName || description}» найден на экране в точке (${finalX}, ${finalY}) и нажат (${btn} клик).`,
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Ошибка визуального поиска: ${err.message || String(err)}`,
      };
    }
  },
};
