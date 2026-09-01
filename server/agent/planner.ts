import { toolRegistry } from '../tools/registry.js';
import { brain } from '../router/brain.js';
import {
  cleanSearchQuery,
  cleanYouTubeQuery,
  cleanYouTubePlaylistQuery,
} from '../utils/queryCleaner.js';

export interface PlannedToolCall {
  name: string;
  parameters: Record<string, any>;
}

export interface PlanResult {
  thought: string;
  plan: string[];
  initialToolCalls?: PlannedToolCall[];
  initialToolCall?: PlannedToolCall;
  llmPlanned?: boolean;
}

export class TaskPlanner {
  /**
   * Sanitizes all planned tool parameters to ensure no conversational fluff,
   * filler words, or whole spoken sentences leak into URLs, search boxes, or app arguments.
   */
  private sanitizeToolCalls(toolCalls: PlannedToolCall[]): PlannedToolCall[] {
    return toolCalls.map((tc) => {
      const params = { ...(tc.parameters || {}) };

      if (tc.name === 'browser.youtube_play_playlist' && params.query) {
        params.query = cleanYouTubePlaylistQuery(params.query);
      }

      if (tc.name === 'browser.open' && params.url) {
        if (params.url.includes('youtube.com/results?search_query=')) {
          const raw = decodeURIComponent(params.url.split('search_query=')[1] || '');
          const clean = cleanYouTubeQuery(raw);
          params.url = `https://www.youtube.com/results?search_query=${encodeURIComponent(clean)}`;
        } else if (params.url.includes('google.com/search?q=')) {
          const raw = decodeURIComponent(params.url.split('?q=')[1] || '');
          const clean = cleanSearchQuery(raw);
          params.url = `https://www.google.com/search?q=${encodeURIComponent(clean)}`;
        }
      }

      if (tc.name === 'computer.open_app') {
        const app = (params.appName || '').toLowerCase();
        if (['chrome', 'browser', 'edge', 'yandex', 'гугл', 'хром', 'браузер'].includes(app) && params.args) {
          if (params.args.startsWith('http://') || params.args.startsWith('https://')) {
            if (params.args.includes('youtube.com/results?search_query=')) {
              const raw = decodeURIComponent(params.args.split('search_query=')[1] || '');
              const clean = cleanYouTubeQuery(raw);
              params.args = `https://www.youtube.com/results?search_query=${encodeURIComponent(clean)}`;
            } else if (params.args.includes('google.com/search?q=')) {
              const raw = decodeURIComponent(params.args.split('?q=')[1] || '');
              const clean = cleanSearchQuery(raw);
              params.args = `https://www.google.com/search?q=${encodeURIComponent(clean)}`;
            }
          } else {
            const clean = cleanSearchQuery(params.args);
            params.args = `https://www.google.com/search?q=${encodeURIComponent(clean)}`;
          }
        }
      }

      return {
        name: tc.name,
        parameters: params,
      };
    });
  }

  private extractTelegramMessage(prompt: string): string {
    const messageMatch = prompt.match(/(?:отправь|напиши|передай|сообщение|текст)\s+(?:мне\s+)?(?:в\s+избранное\s+)?(.+)$/i);
    const raw = messageMatch?.[1]?.replace(/^(?:сообщение|текст)\s+/i, '').trim() || prompt;
    return cleanSearchQuery(raw);
  }

  private extractTelegramChatAndMessage(prompt: string): { chat: string; message: string } | null {
    const match = prompt.match(/(?:чат|пользовател[ья]|контакт)\s+(.+?)\s+(?:и\s+)?(?:напиши|отправь|передай)\s+(?:ему|ей)?\s*(.+)$/i);
    if (match?.[1] && match[2]) {
      return { chat: match[1].trim(), message: match[2].trim() };
    }

    const fallback = prompt.match(/(?:найди|открой)\s+(.+?)\s+(?:и\s+)?(?:напиши|отправь)\s+(.+)$/i);
    return fallback?.[1] && fallback[2]
      ? { chat: fallback[1].trim(), message: fallback[2].trim() }
      : null;
  }

  /**
   * Analyzes the user's high-level command and creates a structured execution plan.
   * Primary engine: Intelligent AI LLM (Gemini / OpenRouter).
   * Secondary engine: Robust deterministic sanitizer fallback.
   */
  public async createPlan(prompt: string): Promise<PlanResult> {
    const toolsDoc = toolRegistry.getToolDocumentation();

    const systemPrompt = `You are JARVIS, an elite AI computer-use agent for Windows.
Your job is to analyze user directives and construct a precise, multi-step plan using the available tools.

CRITICAL UNDERSTANDING & QUERY CLEANING RULES:
1. NEVER copy conversational filler, UI phrasing, or user command prefixes into search queries, URLs, or text inputs.
   - User says: "открой новую вкладку в хроме зайди в ютуб и найди там плейлист из грустных песен и запусти этот ролик"
     -> MUST extract the pure topic: "грустные песни"
     -> Tool: browser.youtube_play_playlist with {"query": "грустные песни"}
   - User says: "открой хром и найди информацию про искусственный интеллект"
     -> Pure search query: "искусственный интеллект"
     -> Tool: computer.open_app with {"appName": "chrome", "args": "https://www.google.com/search?q=%D0%B8%D1%81%D0%BA%D1%83%D1%81%D1%81%D1%82%D0%B2%D0%B5%D0%BD%D0%BD%D1%8B%D0%B9+%D0%B8%D0%BD%D1%82%D0%B5%D0%BB%D0%BB%D0%B5%D0%BA%D1%82"}
   - User says: "открой блокнот и запиши что завтра в 5 встреча"
     -> Text to type: "Завтра в 17:00 встреча"
     -> Step 1: computer.open_app {"appName": "notepad"}
     -> Step 2: computer.type {"text": "Завтра в 17:00 встреча", "pressEnter": true}

2. YOUTUBE DIRECTIVES:
   - If user asks for a YouTube playlist / playlist playback, use browser.youtube_play_playlist with the cleaned playlist topic.
   - If user asks to search YouTube videos, use browser.open with "https://www.youtube.com/results?search_query=<cleaned_query>".

3. TELEGRAM DIRECTIVES:
   - To send a message or note into Telegram Saved Messages ("Избранное"):
     Use computer.telegram_send_message with {"chat": "Избранное", "message": "<cleaned_text>"}.
   - To send a message to a specific contact or chat:
     Use computer.telegram_send_message with {"chat": "<chat_name>", "message": "<cleaned_message>"}.

4. GENERAL CONVERSATION OR QUESTIONS:
   - If user asks a general question (not an OS action), return empty initialToolCalls: [] and plan: ["Ответить пользователю"].

AVAILABLE TOOLS:
${toolsDoc}

OUTPUT FORMAT: Return STRICT JSON ONLY (no markdown code fences):
{
  "thought": "Reasoning in Russian as JARVIS (1-2 sentences)",
  "plan": [
    "Шаг 1: ...",
    "Шаг 2: ..."
  ],
  "initialToolCalls": [
    { "name": "tool_name", "parameters": { ... } }
  ]
}`;

    // ── 1. Primary Engine: AI Neural Planner (Gemini / OpenRouter) ──
    try {
      const raw = await brain.generate({
        system: systemPrompt,
        prompt: `User Directive: "${prompt}"`,
        format: 'json',
        temperature: 0.1,
      });

      const cleanJson = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
      const parsed = JSON.parse(cleanJson);

      const rawToolCalls: PlannedToolCall[] = Array.isArray(parsed.initialToolCalls)
        ? parsed.initialToolCalls
        : parsed.initialToolCall
          ? [parsed.initialToolCall]
          : [];

      // Sanitize all parameters to guarantee no conversational leaks
      const sanitizedToolCalls = this.sanitizeToolCalls(rawToolCalls);

      if (sanitizedToolCalls.length > 0 || (Array.isArray(parsed.plan) && parsed.plan.length > 0)) {
        return {
          thought: parsed.thought || 'План сформирован.',
          plan: Array.isArray(parsed.plan) && parsed.plan.length > 0
            ? parsed.plan
            : [parsed.thought || 'Выполнить директиву'],
          initialToolCalls: sanitizedToolCalls,
          initialToolCall: sanitizedToolCalls[0],
          llmPlanned: true,
        };
      }
    } catch (err: any) {
      console.warn('[TaskPlanner] LLM planning error, engaging deterministic fallback:', err.message || err);
    }

    // ── 2. Secondary Engine: Robust Deterministic Rule-Based Fallback ──
    const lowerPrompt = prompt.toLowerCase();

    // 1. YouTube Playlist
    const isYouTubePlaylistRequest =
      (lowerPrompt.includes('ютуб') || lowerPrompt.includes('youtube')) &&
      (lowerPrompt.includes('плейлист') || lowerPrompt.includes('playlist')) &&
      (lowerPrompt.includes('найди') || lowerPrompt.includes('поищи') || lowerPrompt.includes('включ') || lowerPrompt.includes('постав') || lowerPrompt.includes('запуст'));

    if (isYouTubePlaylistRequest) {
      const query = cleanYouTubePlaylistQuery(prompt);
      return {
        thought: `Понял, сэр. Открываю YouTube, нахожу плейлист «${query}» и включаю его.`,
        plan: [
          'Открыть YouTube в Chrome',
          `Найти плейлист по запросу «${query}»`,
          'Открыть первый подходящий плейлист и включить воспроизведение',
        ],
        initialToolCalls: [
          { name: 'browser.youtube_play_playlist', parameters: { query } },
        ],
      };
    }

    // 2. YouTube Search
    const isYouTubeSearchRequest =
      (lowerPrompt.includes('ютуб') || lowerPrompt.includes('youtube')) &&
      (lowerPrompt.includes('найди') || lowerPrompt.includes('поищи') || lowerPrompt.includes('поиск') || lowerPrompt.includes('видео') || lowerPrompt.includes('ролик'));

    if (isYouTubeSearchRequest) {
      const query = cleanYouTubeQuery(prompt);
      const youtubeUrl = query
        ? `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
        : 'https://www.youtube.com';
      return {
        thought: query
          ? `Понял, сэр. Открываю YouTube и ищу «${query}».`
          : 'Понял, сэр. Открываю YouTube.',
        plan: query
          ? ['Открыть YouTube в Chrome', `Найти видео по запросу «${query}»`]
          : ['Открыть YouTube в Chrome'],
        initialToolCalls: [
          { name: 'browser.open', parameters: { url: youtubeUrl } },
        ],
      };
    }

    // 3. Telegram Message to contact
    const isTelegramSavedRequest =
      (lowerPrompt.includes('тг') || lowerPrompt.includes('телеграм') || lowerPrompt.includes('telegram')) &&
      (lowerPrompt.includes('избранн') || lowerPrompt.includes('saved messages') || lowerPrompt.includes('сохран'));
    const isTelegramMessageRequest =
      (lowerPrompt.includes('тг') || lowerPrompt.includes('телеграм') || lowerPrompt.includes('telegram')) &&
      (lowerPrompt.includes('напиш') || lowerPrompt.includes('отправ') || lowerPrompt.includes('сообщен'));

    if (isTelegramMessageRequest && !isTelegramSavedRequest) {
      const request = this.extractTelegramChatAndMessage(prompt);
      if (request) {
        return {
          thought: `Понял, сэр. Открываю Telegram, нахожу чат «${request.chat}» и отправляю сообщение.`,
          plan: [
            'Открыть Telegram и вывести окно на передний план',
            `Найти чат «${request.chat}»`,
            'Написать и отправить сообщение',
          ],
          initialToolCalls: [
            { name: 'computer.telegram_send_message', parameters: request },
          ],
        };
      }
    }

    // 4. Telegram Saved Messages
    if (isTelegramSavedRequest) {
      const snippet = this.extractTelegramMessage(prompt);
      return {
        thought: 'Понял, сэр. Открываю Telegram, нахожу чат «Избранное» и отправляю ваше сообщение.',
        plan: [
          'Открыть Telegram и вывести окно на передний план',
          'Найти чат «Избранное»',
          'Написать и отправить информацию',
        ],
        initialToolCalls: [
          { name: 'computer.telegram_send_message', parameters: { chat: 'Избранное', message: snippet } },
        ],
      };
    }

    // 5. Notepad Write
    if ((lowerPrompt.includes('блокнот') || lowerPrompt.includes('notepad')) &&
        (lowerPrompt.includes('напиш') || lowerPrompt.includes('запиш') || lowerPrompt.includes('встав') || lowerPrompt.includes('сохран'))) {
      const textToWrite = cleanSearchQuery(prompt);
      return {
        thought: 'Запускаю Блокнот и записываю текст.',
        plan: [
          'Открыть Блокнот',
          'Напечатать текст',
        ],
        initialToolCalls: [
          { name: 'computer.open_app', parameters: { appName: 'notepad' } },
          { name: 'computer.type', parameters: { text: textToWrite, pressEnter: true } },
        ],
      };
    }

    // 6. Web Search (Chrome / Browser)
    const isWebSearchRequest =
      !lowerPrompt.includes('тг') && !lowerPrompt.includes('телеграм') && !lowerPrompt.includes('telegram') &&
      (lowerPrompt.includes('хром') || lowerPrompt.includes('chrome') || lowerPrompt.includes('браузер') ||
        lowerPrompt.includes('найди') || lowerPrompt.includes('поищи') || lowerPrompt.includes('поиск') || lowerPrompt.includes('вкладк'));

    if (isWebSearchRequest) {
      const searchQuery = cleanSearchQuery(prompt);
      const searchUrl = searchQuery
        ? `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`
        : 'https://www.google.com';
      return {
        thought: 'Понял, сэр. Открываю Chrome и выполняю поиск.',
        plan: [`Открыть Google Chrome и выполнить поиск: «${searchQuery}»`],
        initialToolCalls: [
          { name: 'computer.open_app', parameters: { appName: 'chrome', args: searchUrl } },
        ],
      };
    }

    // 7. General Apps
    if (lowerPrompt.includes('телеграм') || lowerPrompt.includes('telegram') || lowerPrompt.includes('тг')) {
      return {
        thought: 'Вывожу Telegram Desktop на экран.',
        plan: ['Открыть приложение Telegram'],
        initialToolCalls: [{ name: 'computer.open_app', parameters: { appName: 'telegram' } }],
      };
    }

    if (lowerPrompt.includes('калькулятор') || lowerPrompt.includes('calc')) {
      return {
        thought: 'Запускаю Калькулятор.',
        plan: ['Открыть Калькулятор'],
        initialToolCalls: [{ name: 'computer.open_app', parameters: { appName: 'calc' } }],
      };
    }

    if (lowerPrompt.includes('код') || lowerPrompt.includes('vscode') || lowerPrompt.includes('vs code')) {
      return {
        thought: 'Запускаю Visual Studio Code.',
        plan: ['Открыть редактор VS Code'],
        initialToolCalls: [{ name: 'computer.open_app', parameters: { appName: 'code' } }],
      };
    }

    return {
      thought: `Анализирую директиву: "${prompt}"`,
      plan: [`Выполнить: ${prompt}`],
    };
  }
}

export const taskPlanner = new TaskPlanner();
