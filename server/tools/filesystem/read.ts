import { ITool, ToolResult } from '../types.js';
import fs from 'fs';
import { validatePath } from '../../utils/pathGuard.js';

export const filesystemReadTool: ITool = {
  name: 'filesystem.read',
  category: 'filesystem',
  description: 'Reads the text content of a file on the local computer.',
  parameters: [
    { name: 'filePath', type: 'string', description: 'Absolute or relative file path to read', required: true },
    { name: 'maxLines', type: 'number', description: 'Maximum lines to read (default: 300, max: 5000)', required: false },
  ],
  dangerLevel: 'safe',
  async execute(params: { filePath: string; maxLines?: number }): Promise<ToolResult> {
    const check = validatePath(params.filePath);
    if (!check.ok) return { success: false, error: check.reason };

    try {
      const stat = await fs.promises.stat(check.resolved!);
      if (!stat.isFile()) return { success: false, error: `Path "${check.resolved}" is not a regular file.` };

      // Cap max lines to prevent OOM on huge files
      const max = Math.min(Math.max(params.maxLines || 300, 1), 5000);
      const content = await fs.promises.readFile(check.resolved!, 'utf8');
      const lines = content.split('\n');
      const truncated = lines.slice(0, max).join('\n');

      return {
        success: true,
        data: { path: check.resolved, sizeBytes: stat.size, totalLines: lines.length, content: truncated },
        message: `Read ${Math.min(lines.length, max)} of ${lines.length} lines from "${check.resolved}":\n\n${truncated}`,
      };
    } catch (err: any) {
      return { success: false, error: `Failed to read file: ${err.message}` };
    }
  },
};

export const filesystemListDirTool: ITool = {
  name: 'filesystem.list_dir',
  category: 'filesystem',
  description: 'Lists all files and subdirectories inside a folder.',
  parameters: [
    { name: 'dirPath', type: 'string', description: 'Path of the directory to inspect', required: true },
  ],
  dangerLevel: 'safe',
  async execute(params: { dirPath: string }): Promise<ToolResult> {
    const check = validatePath(params.dirPath);
    if (!check.ok) return { success: false, error: check.reason };

    try {
      const entries = await fs.promises.readdir(check.resolved!, { withFileTypes: true });
      const items = entries.map(e => ({
        name: e.name,
        type: e.isDirectory() ? 'directory' : 'file',
        path: require('path').join(check.resolved!, e.name),
      }));

      return {
        success: true,
        data: { directory: check.resolved, items },
        message: `Directory contents of "${check.resolved}":\n${items.map(i => `[${i.type.toUpperCase()}] ${i.name}`).join('\n')}`,
      };
    } catch (err: any) {
      return { success: false, error: `Failed to list directory: ${err.message}` };
    }
  },
};
