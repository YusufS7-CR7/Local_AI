import { ITool, ToolResult } from '../types.js';
import { memoryStore, MemoryFact } from '../../memory/memoryStore.js';

export const memoryRememberTool: ITool = {
  name: 'memory.remember',
  category: 'memory',
  description: 'Saves an important fact, user preference, contact, or note to long-term persistent memory so JARVIS remembers it in future interactions.',
  parameters: [
    {
      name: 'key',
      type: 'string',
      description: 'Short descriptive key or subject (e.g. "user_name", "favorite_music", "contact_mama", "project_deadline")',
      required: true,
    },
    {
      name: 'value',
      type: 'string',
      description: 'The fact, detail, or content to remember',
      required: true,
    },
    {
      name: 'category',
      type: 'string',
      description: 'Category of memory: "profile", "preference", "contact", "task", or "general"',
      enum: ['profile', 'preference', 'contact', 'task', 'general'],
      required: false,
    },
  ],
  dangerLevel: 'safe',
  async execute(params: { key: string; value: string; category?: string }): Promise<ToolResult> {
    try {
      const cat = (params.category as MemoryFact['category']) || 'general';
      const fact = memoryStore.remember(params.key, params.value, cat, 'tool_call');
      return {
        success: true,
        data: fact,
        message: `Запомнил: «${fact.key}» = «${fact.value}» [${fact.category}]`,
      };
    } catch (err: any) {
      return { success: false, error: `Не удалось сохранить в память: ${err.message}` };
    }
  },
};

export const memoryRecallTool: ITool = {
  name: 'memory.recall',
  category: 'memory',
  description: 'Searches long-term memory and history to recall stored facts, preferences, contacts, or past tasks.',
  parameters: [
    {
      name: 'query',
      type: 'string',
      description: 'Keyword, subject, or question to search memory for (e.g. "имя", "музыка", "мама", "пароль", "что делал")',
      required: true,
    },
  ],
  dangerLevel: 'safe',
  async execute(params: { query: string }): Promise<ToolResult> {
    try {
      const facts = memoryStore.recall(params.query, 6);
      const recentEpisodes = memoryStore.getRecentEpisodes(3);

      return {
        success: true,
        data: {
          factsFound: facts.length,
          facts,
          recentHistory: recentEpisodes,
        },
        message: facts.length > 0
          ? `Найдено ${facts.length} воспоминаний по запросу «${params.query}»:\n` +
            facts.map(f => `• ${f.key}: ${f.value}`).join('\n')
          : `В памяти пока нет точных совпадений по запросу «${params.query}».`,
      };
    } catch (err: any) {
      return { success: false, error: `Не удалось выполнить поиск в памяти: ${err.message}` };
    }
  },
};

export const memoryListTool: ITool = {
  name: 'memory.list',
  category: 'memory',
  description: 'Lists all stored facts and preferences in JARVIS long-term memory.',
  parameters: [
    {
      name: 'category',
      type: 'string',
      description: 'Optional category filter: "profile", "preference", "contact", "task", or "general"',
      enum: ['profile', 'preference', 'contact', 'task', 'general'],
      required: false,
    },
  ],
  dangerLevel: 'safe',
  async execute(params: { category?: string }): Promise<ToolResult> {
    try {
      let facts = memoryStore.getAllFacts();
      if (params.category) {
        facts = facts.filter(f => f.category === params.category);
      }

      return {
        success: true,
        data: { total: facts.length, facts },
        message: facts.length > 0
          ? `Всего воспоминаний в памяти (${facts.length}):\n` +
            facts.map(f => `• [${f.category}] ${f.key}: ${f.value}`).join('\n')
          : 'Память JARVIS пока пуста.',
      };
    } catch (err: any) {
      return { success: false, error: `Не удалось получить список памяти: ${err.message}` };
    }
  },
};

export const memoryForgetTool: ITool = {
  name: 'memory.forget',
  category: 'memory',
  description: 'Deletes a fact from long-term memory by key or subject.',
  parameters: [
    {
      name: 'key',
      type: 'string',
      description: 'The key or subject of the fact to forget',
      required: true,
    },
  ],
  dangerLevel: 'moderate',
  async execute(params: { key: string }): Promise<ToolResult> {
    try {
      const deleted = memoryStore.forget(params.key);
      return {
        success: deleted,
        message: deleted
          ? `Факт «${params.key}» успешно удален из памяти.`
          : `Факт «${params.key}» не найден в памяти.`,
      };
    } catch (err: any) {
      return { success: false, error: `Не удалось удалить из памяти: ${err.message}` };
    }
  },
};
