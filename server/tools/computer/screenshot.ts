import { ITool, ToolResult } from '../types.js';
import screenshot from 'screenshot-desktop';
import sharp from 'sharp';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

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
      let imageBuffer: Buffer;

      try {
        // Try screenshot-desktop library
        imageBuffer = await screenshot({ format: 'png' });
      } catch (screenshotErr) {
        // Windows PowerShell fallback via .NET System.Drawing
        const tempPath = path.join(os.tmpdir(), `jarvis_screen_${Date.now()}.png`);
        const psScript = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$Screen = [System.Windows.Forms.Screen]::PrimaryScreen
$Bounds = $Screen.Bounds
$Bitmap = New-Object System.Drawing.Bitmap $Bounds.Width, $Bounds.Height
$Graphics = [System.Drawing.Graphics]::FromImage($Bitmap)
$Graphics.CopyFromScreen($Bounds.Location, [System.Drawing.Point]::Empty, $Bounds.Size)
$Bitmap.Save('${tempPath.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png)
$Graphics.Dispose()
$Bitmap.Dispose()
`;
        await execAsync(`powershell -ExecutionPolicy Bypass -Command "${psScript.replace(/\n/g, '; ')}"`);
        imageBuffer = await fs.promises.readFile(tempPath);
        fs.promises.unlink(tempPath).catch(() => {});
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
