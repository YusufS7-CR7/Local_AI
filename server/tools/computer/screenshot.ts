import { ITool, ToolResult } from '../types.js';
import screenshot from 'screenshot-desktop';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runPowerShell } from '../../utils/powershell.js';

export const screenshotTool: ITool = {
  name: 'computer.screenshot',
  category: 'computer',
  description: 'Takes a screenshot of the entire desktop screen or active window and returns it as a Base64-encoded PNG image.',
  parameters: [
    {
      name: 'resizeWidth',
      type: 'number',
      description: 'Optional width to resize the screenshot for faster AI vision analysis (e.g. 1024). Default is original.',
      required: false,
    },
    {
      name: 'format',
      type: 'string',
      description: 'Output format: "base64" (default) or "file".',
      enum: ['base64', 'file'],
      required: false,
    },
  ],
  dangerLevel: 'safe',
  async execute(params: { resizeWidth?: number; format?: 'base64' | 'file' }): Promise<ToolResult> {
    try {
      let imageBuffer: Buffer | null = null;

      // 1. Try screenshot-desktop native library
      try {
        imageBuffer = await screenshot({ format: 'png' });
        if (imageBuffer && imageBuffer.length < 500) {
          imageBuffer = null; // empty or corrupt
        }
      } catch {
        imageBuffer = null;
      }

      // 2. High-reliability DPI-aware Windows .NET fallback
      if (!imageBuffer) {
        const tempPath = path.join(os.tmpdir(), `jarvis_screen_${Date.now()}.png`);
        const escapedTemp = tempPath.replace(/\\/g, '\\\\');
        const psScript = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class DpiUtil {
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
"@ -ErrorAction SilentlyContinue
[DpiUtil]::SetProcessDPIAware() | Out-Null

Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue
Add-Type -AssemblyName System.Drawing -ErrorAction SilentlyContinue

$Screen = [System.Windows.Forms.Screen]::PrimaryScreen
$Bounds = $Screen.Bounds
$Bitmap = New-Object System.Drawing.Bitmap $Bounds.Width, $Bounds.Height
$Graphics = [System.Drawing.Graphics]::FromImage($Bitmap)
$Graphics.CopyFromScreen($Bounds.Location, [System.Drawing.Point]::Empty, $Bounds.Size)
$Bitmap.Save('${escapedTemp}', [System.Drawing.Imaging.ImageFormat]::Png)
$Graphics.Dispose()
$Bitmap.Dispose()
`;
        await runPowerShell(psScript, 8000);
        if (fs.existsSync(tempPath)) {
          imageBuffer = await fs.promises.readFile(tempPath);
          fs.promises.unlink(tempPath).catch(() => {});
        }
      }

      if (!imageBuffer || imageBuffer.length === 0) {
        return {
          success: false,
          error: 'Не удалось захватить изображение рабочего стола (пустой буфер).',
        };
      }

      // Resize if requested
      if (params.resizeWidth && params.resizeWidth > 0) {
        imageBuffer = await sharp(imageBuffer)
          .resize({ width: params.resizeWidth, withoutEnlargement: true })
          .png()
          .toBuffer();
      }

      const base64 = imageBuffer.toString('base64');
      const dataUri = `data:image/png;base64,${base64}`;

      if (params.format === 'file') {
        const savedPath = path.join(os.tmpdir(), `jarvis_screen_latest.png`);
        await fs.promises.writeFile(savedPath, imageBuffer);
        return {
          success: true,
          data: { filePath: savedPath },
          screenshot: dataUri,
          message: `Screenshot saved to ${savedPath}`,
        };
      }

      return {
        success: true,
        data: {
          width: params.resizeWidth || 'native',
          sizeBytes: imageBuffer.length,
        },
        screenshot: dataUri,
        message: 'Screenshot captured successfully.',
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Failed to capture screenshot: ${err.message || String(err)}`,
      };
    }
  },
};
