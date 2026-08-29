import { ITool, ToolResult } from '../types.js';
import { glob } from 'glob';
import os from 'os';
import path from 'path';
import { isPathTraversal } from '../../safety/rules.js';

export const filesystemSearchTool: ITool = {
  name: 'filesystem.search',
  category: 'filesystem',
  description: 'Searches for files and directories matching a name, glob pattern, or extension across user folders (Desktop, Documents, Downloads, or custom directory).',
  parameters: [
    {
      name: 'query',
      type: 'string',
      description: 'Search query or glob pattern (e.g. "*.pdf", "budget*", "project*", "*.png")',
      required: true,
    },
    {
      name: 'directory',
      type: 'string',
      description: 'Directory to search within (e.g. "Desktop", "Documents", "Downloads", or an absolute path). Default is User Home.',
      required: false,
    },
    {
      name: 'maxResults',
      type: 'number',
      description: 'Maximum number of results to return (default: 25, max: 200)',
      required: false,
    },
  ],
  dangerLevel: 'safe',
  async execute(params: { query: string; directory?: string; maxResults?: number }): Promise<ToolResult> {
    if (typeof params.query !== 'string' || !params.query.trim()) {
      return { success: false, error: 'query must be a non-empty string' };
    }

    // Block traversal in the search query itself (e.g. "../../etc/passwd")
    if (isPathTraversal(params.query)) {
      return { success: false, error: 'query contains path traversal sequence' };
    }

    const home = os.homedir();
    let searchRoot = home;

    if (params.directory) {
      const lower = params.directory.toLowerCase();
      if (lower === 'desktop') searchRoot = path.join(home, 'Desktop');
      else if (lower === 'documents' || lower === 'docs') searchRoot = path.join(home, 'Documents');
      else if (lower === 'downloads') searchRoot = path.join(home, 'Downloads');
      else searchRoot = path.resolve(params.directory);

      // Reject traversal attempts in custom directories
      if (isPathTraversal(params.directory)) {
        return { success: false, error: 'directory parameter contains path traversal sequence' };
      }
    }

    try {
      const pattern = params.query.includes('*') ? params.query : `*${params.query}*`;
      const matches = await glob(`**/${pattern}`, {
        cwd: searchRoot,
        nodir: false,
        maxDepth: 5,
        ignore: ['**/node_modules/**', '**/.git/**', '**/AppData/**', '**/Windows/**', '**/Program Files/**'],
      });

      const max = Math.min(Math.max(params.maxResults || 25, 1), 200);
      const results = matches.slice(0, max).map(m => path.join(searchRoot, m));

      return {
        success: true,
        data: { count: results.length, matches: results, searchRoot },
        message: results.length > 0
          ? `Found ${results.length} item(s):\n${results.map(r => `• ${r}`).join('\n')}`
          : `No files found matching "${params.query}" in ${searchRoot}`,
      };
    } catch (err: any) {
      return { success: false, error: `Search failed: ${err.message}` };
    }
  },
};
