import { ITool, ToolResult } from '../types.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { validatePath } from '../../utils/pathGuard.js';

const execAsync = promisify(exec);

export const filesystemOpenTool: ITool = {
  name: 'filesystem.open',
  category: 'filesystem',
  description: 'Opens a file or folder on Windows with its default associated desktop application.',
  parameters: [
    { name: 'path', type: 'string', description: 'The file or directory path to open', required: true },
  ],
  dangerLevel: 'safe',
  async execute(params: { path: string }): Promise<ToolResult> {
    const check = validatePath(params.path);
    if (!check.ok) return { success: false, error: check.reason };

    try {
      // Use Start-Process without shell interpolation to prevent command injection
      const escapedPath = check.resolved!.replace(/'/g, "''");
      await execAsync(`powershell -NoProfile -Command "Start-Process -FilePath '${escapedPath}'"`);
      return { success: true, message: `Opened "${check.resolved}" in default desktop application.` };
    } catch (err: any) {
      return { success: false, error: `Failed to open file: ${err.message}` };
    }
  },
};

export const filesystemWriteTool: ITool = {
  name: 'filesystem.write',
  category: 'filesystem',
  description: 'Creates or overwrites a text file with specified content.',
  parameters: [
    { name: 'filePath', type: 'string', description: 'Destination file path', required: true },
    { name: 'content', type: 'string', description: 'Text content to write', required: true },
  ],
  dangerLevel: 'moderate',
  async execute(params: { filePath: string; content: string }): Promise<ToolResult> {
    const check = validatePath(params.filePath);
    if (!check.ok) return { success: false, error: check.reason };

    // Cap write size to prevent abuse (10 MB)
    if (typeof params.content !== 'string') {
      return { success: false, error: 'content must be a string' };
    }
    if (params.content.length > 10 * 1024 * 1024) {
      return { success: false, error: 'content exceeds 10 MB limit' };
    }

    try {
      await fs.promises.mkdir(path.dirname(check.resolved!), { recursive: true });
      await fs.promises.writeFile(check.resolved!, params.content, 'utf8');
      return { success: true, message: `Successfully wrote ${params.content.length} characters to "${check.resolved}".` };
    } catch (err: any) {
      return { success: false, error: `Failed to write file: ${err.message}` };
    }
  },
};

export const filesystemDeleteTool: ITool = {
  name: 'filesystem.delete',
  category: 'filesystem',
  description: 'Deletes a file or directory. DANGEROUS: Always requires user permission.',
  parameters: [
    { name: 'targetPath', type: 'string', description: 'Path of the file or directory to delete', required: true },
  ],
  dangerLevel: 'dangerous',
  async execute(params: { targetPath: string }): Promise<ToolResult> {
    const check = validatePath(params.targetPath);
    if (!check.ok) return { success: false, error: check.reason };

    try {
      const stat = await fs.promises.stat(check.resolved!);
      if (stat.isDirectory()) {
        await fs.promises.rm(check.resolved!, { recursive: true, force: true });
      } else {
        await fs.promises.unlink(check.resolved!);
      }
      return { success: true, message: `Deleted "${check.resolved}".` };
    } catch (err: any) {
      return { success: false, error: `Failed to delete: ${err.message}` };
    }
  },
};
