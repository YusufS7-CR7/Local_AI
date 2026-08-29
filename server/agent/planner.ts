import { toolRegistry } from '../tools/registry.js';
import { brain } from '../router/brain.js';

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
   * Generates helpful, accurate AI information text for topics requested by user.
   */
  private generateTopicSnippet(prompt: string): string {
    const p = prompt.toLowerCase();
    if (p.includes('openai') || p.includes('опенеай') || p.includes('опен аи')) {
      return 'OpenAI — ведущая американская научно-исследовательская лаборатория в сфере искусственного интеллекта. Разработчик всемирно известных моделей ChatGPT, GPT-4o, DALL-E, Whisper и видеогенератора Sora.';
    }
    if (p.includes('ии') || p.includes('искусственн') || p.includes('нейросет')) {
      return 'Искусственный интеллект (ИИ) — технология создания интеллектуальных систем, способных решать творческие, аналитические и практические задачи, распознавать образы и генерировать текст и код.';
    }
    if (p.includes('react') || p.includes('реакт')) {
      return 'React — самая популярная JavaScript-библиотека с открытым исходным кодом для разработки интерактивных пользовательских интерфейсов и веб-приложений.';
    }
    if (p.includes('python') || p.includes('питон')) {
      return 'Python — высокоуровневый язык программирования с чистым синтаксисом, являющийся стандартом в сфере Data Science, машинного обучения и веб-разработки.';
    }
    return prompt;
  }

  private extractSearchQuery(prompt: string): string {
    const normalized = prompt.replace(/[!?.,;:]+$/g, '').trim();
    const topicMatch = normalized.match(/(?:\bпро\b|\bоб\b|\bо\b|\bнасч[её]т\b|\bна тему\b|\bпо теме\b)\s+(.+)$/i);
    if (topicMatch?.[1]) {
      return topicMatch[1].trim();
    }

    return normalized
      .replace(/^(?:открой|запусти|открыть)\s+(?:новое\s+)?(?:окно\s+)?(?:в\s+)?(?:хроме|chrome|браузере)\s*/i, '')
      .replace(/^(?:и\s+)?(?:найди|поищи|ищи|поиск)\s+/i, '')
      .replace(/^(?:информацию|инфу|инфа|сведения)\s+/i, '')
      .trim();
  }

  private extractTelegramMessage(prompt: string): string {
    const topic = this.extractSearchQuery(prompt);
    if (/\b(ии|искусственн|нейросет|openai|react|python)\b/i.test(topic)) {
      return this.generateTopicSnippet(prompt);
    }

    const messageMatch = prompt.match(/(?:отправь|напиши|передай|сообщение|текст)\s+(?:мне\s+)?(?:в\s+избранное\s+)?(.+)$/i);
    return messageMatch?.[1]?.replace(/^(?:сообщение|текст)\s+/i, '').trim() || prompt;
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

  private extractYouTubePlaylistQuery(prompt: string): string {
    const query = prompt
      .replace(/[!?.,;:]+$/g, '')
      .replace(/^\s*(?:джарвис|jarvis)[,\s:]*/i, '')
      .replace(/(?:открой|запусти|перейди|зайди)\s+(?:в\s+)?(?:хроме|chrome|браузере)?\s*/i, '')
      .replace(/(?:ютуб|youtube|видео на ютубе)\s*/i, '')
      .replace(/(?:и\s+)?(?:найди|поищи|ищи)\s+(?:там\s+)?/i, '')
      .replace(/\s+(?:и\s+)?(?:поставь|включи|запусти)(?:\s+его|\s+ее|\s+плейлист)?\s*$/i, '')
      .replace(/^\s*(?:плейлист|плейлиста|playlist)\s+(?:из|про|на тему)\s+/i, '')
      .replace(/\b(?:плейлист|плейлиста|playlist)\b/gi, '')
      .replace(/\s+и\s*$/i, '')
      .trim();

    return query || 'грустные песни';
  }

  private extractYouTubeQuery(prompt: string): string {
    const query = prompt
      .replace(/[!?.,;:]+$/g, '')
      .replace(/^\s*(?:джарвис|jarvis)[,\s:]*/i, '')
      .replace(/^(?:открой|запусти|перейди|зайди)\s+/i, '')
      .replace(/(?:ютуб|youtube|видео на ютубе)\s*/i, '')
      .replace(/(?:в\s+)?(?:хроме|chrome|браузере)\s*/i, '')
      .replace(/(?:и\s+)?(?:найди|поищи|ищи|поиск)\s+(?:там\s+)?/i, '')
      .replace(/(?:^|\s)(?:видеоролик|видео|ролик)(?=\s|$)/gi, ' ')
      .replace(/\s+и\s*$/i, '')
      .trim();

    return query;
  }

  /**
   * Analyzes the user's high-level command and creates a structured execution plan.
   */
  public async createPlan(prompt: string): Promise<PlanResult> {
    const toolsDoc = toolRegistry.getToolDocumentation();
    const lowerPrompt = prompt.toLowerCase();
    const isYouTubePlaylistRequest =
      (lowerPrompt.includes('ютуб') || lowerPrompt.includes('youtube')) &&
      (lowerPrompt.includes('плейлист') || lowerPrompt.includes('playlist')) &&
      (lowerPrompt.includes('найди') || lowerPrompt.includes('поищи') || lowerPrompt.includes('включ') || lowerPrompt.includes('постав'));
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

    if (isYouTubePlaylistRequest) {
      const query = this.extractYouTubePlaylistQuery(prompt);
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

    const isYouTubeSearchRequest =
      (lowerPrompt.includes('ютуб') || lowerPrompt.includes('youtube')) &&
      (lowerPrompt.includes('найди') || lowerPrompt.includes('поищи') || lowerPrompt.includes('поиск'));

    if (isYouTubeSearchRequest) {
      const query = this.extractYouTubeQuery(prompt);
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

    // Keep Telegram Saved Messages navigation deterministic; chat search is timing-sensitive.
    if (isTelegramSavedRequest) {
      const snippet = this.extractTelegramMessage(prompt);
      return {
        thought: 'Понял, сэр. Открываю Telegram, нахожу чат «Избранное» и отправляю ваше сообщение.',
        plan: [
          'Открыть Telegram и вывести окно на передний план',
          'Найти чат «Избранное»',
          'Написать и отправить сообщение',
        ],
        initialToolCalls: [
          { name: 'computer.telegram_send_message', parameters: { chat: 'Избранное', message: snippet } },
        ],
      };
    }

    const isWebSearchRequest =
      !lowerPrompt.includes('тг') && !lowerPrompt.includes('телеграм') && !lowerPrompt.includes('telegram') &&
      (lowerPrompt.includes('хром') || lowerPrompt.includes('chrome') || lowerPrompt.includes('браузер') ||
        lowerPrompt.includes('найди') || lowerPrompt.includes('поищи') || lowerPrompt.includes('поиск'));

    if (isWebSearchRequest) {
      const searchQuery = this.extractSearchQuery(prompt);
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
      return {
        thought: 'Понял, сэр. Открываю Chrome и сразу выполняю поиск по вашему запросу.',
        plan: ['Открыть Google Chrome и выполнить поиск по запросу'],
        initialToolCalls: [
          { name: 'computer.open_app', parameters: { appName: 'chrome', args: searchUrl } },
        ],
      };
    }

    const systemPrompt = `You are JARVIS, a professional Windows computer-use agent.
Break the user request into an accurate, executable plan using only the listed tools.
Do not invent completed work. If the request is a question or conversation (not a desktop action), return an empty initialToolCalls array and a short plan like ["Ответить пользователю"].
Tone in "thought": precise, adult, Russian.

AVAILABLE TOOLS:
${toolsDoc}

MULTI-STEP IN-APP AUTOMATION RULES:
1. When user asks to open Telegram and send a message or save information in "Избранное" / Saved Messages:
   Step 1: computer.open_app with {"appName": "telegram"}
   Step 2: computer.key with {"key": "escape"}
   Step 3: computer.key with {"key": "ctrl+f"}
  Step 4: computer.type with {"text": "Избранное"}
  Step 5: computer.key with {"key": "enter"}
  Step 6: computer.type with {"text": "<information or message>"}
  Step 7: computer.key with {"key": "enter"}

2. When user asks to open Notepad and write text:
   Step 1: computer.open_app with {"appName": "notepad"}
   Step 2: computer.type with {"text": "<text to write>", "pressEnter": true}

3. When user asks to search the web in Chrome:
   Step 1: computer.open_app with {"appName": "chrome", "args": "https://www.google.com/search?q=<query>"}

4. When user asks to open an app (e.g. calculator, discord, code, telegram):
   Step 1: computer.open_app with {"appName": "<name>"}

OUTPUT FORMAT: Return STRICT JSON ONLY (no markdown code fences):
{
  "thought": "Reasoning in Russian as JARVIS",
  "plan": [
    "Шаг 1: Запустить Telegram Desktop",
    "Шаг 2: Перейти в чат Избранное",
    "Шаг 3: Напечатать и отправить сообщение"
  ],
  "initialToolCalls": [
    { "name": "computer.open_app", "parameters": { "appName": "telegram" } },
    { "name": "computer.key", "parameters": { "key": "escape" } },
    { "name": "computer.key", "parameters": { "key": "ctrl+f" } },
    { "name": "computer.type", "parameters": { "text": "Избранное" } },
    { "name": "computer.key", "parameters": { "key": "enter" } },
    { "name": "computer.type", "parameters": { "text": "Информация..." } },
    { "name": "computer.key", "parameters": { "key": "enter" } }
  ]
}`;

    try {
      const raw = await brain.generate({
        system: systemPrompt,
        prompt: `User Directive: "${prompt}"`,
        format: 'json',
        temperature: 0.1,
      });

      const cleanJson = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
      const parsed = JSON.parse(cleanJson);

      const toolCalls = Array.isArray(parsed.initialToolCalls)
        ? parsed.initialToolCalls
        : parsed.initialToolCall
          ? [parsed.initialToolCall]
          : [];

      return {
        thought: parsed.thought || 'План готов.',
        plan: Array.isArray(parsed.plan) && parsed.plan.length > 0
          ? parsed.plan
          : [parsed.thought || 'Ответить пользователю'],
        initialToolCalls: toolCalls,
        initialToolCall: toolCalls[0],
        llmPlanned: true,
      };
    } catch {}

    // ── Smart Deterministic Multi-Step Fallbacks ──
    const p = prompt.toLowerCase();

    // 1. Telegram + Saved Messages / Messaging
    if ((p.includes('тг') || p.includes('телеграм') || p.includes('telegram')) &&
        (p.includes('избранн') || p.includes('отправ') || p.includes('напиш') || p.includes('сохран') || p.includes('сообщен'))) {
      
      const snippet = this.extractTelegramMessage(prompt);

      return {
        thought: 'Открываю Telegram, перехожу в чат «Избранное» и отправляю запрошенную информацию.',
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

    // 2. Notepad + Write / Save
    if ((p.includes('блокнот') || p.includes('notepad')) &&
        (p.includes('напиш') || p.includes('запиш') || p.includes('встав') || p.includes('сохран'))) {
      const textToWrite = this.generateTopicSnippet(prompt);
      return {
        thought: 'Запускаю Блокнот и записываю текст.',
        plan: [
          'Открыть Блокнот',
          'Напечатать текст'
        ],
        initialToolCalls: [
          { name: 'computer.open_app', parameters: { appName: 'notepad' } },
          { name: 'computer.type', parameters: { text: textToWrite, pressEnter: true } },
        ],
      };
    }

    // 3. Web Search / Chrome
    if (p.includes('хром') || p.includes('chrome') || p.includes('браузер') || p.includes('найди') || p.includes('поищи') || p.includes('вкладк')) {
      return {
        thought: 'Запускаю Google Chrome и выполняю поиск.',
        plan: ['Открыть Google Chrome и выполнить поиск'],
        initialToolCalls: [
          { name: 'computer.open_app', parameters: { appName: 'chrome', args: prompt } },
        ],
      };
    }

    // 4. Telegram (just open)
    if (p.includes('телеграм') || p.includes('telegram') || p.includes('тг')) {
      return {
        thought: 'Вывожу Telegram Desktop на экран.',
        plan: ['Открыть приложение Telegram'],
        initialToolCalls: [
          { name: 'computer.open_app', parameters: { appName: 'telegram' } },
        ],
      };
    }

    // 5. General apps
    if (p.includes('калькулятор') || p.includes('calc')) {
      return {
        thought: 'Запускаю Калькулятор.',
        plan: ['Открыть Калькулятор'],
        initialToolCalls: [{ name: 'computer.open_app', parameters: { appName: 'calc' } }],
      };
    }

    if (p.includes('код') || p.includes('vscode') || p.includes('vs code')) {
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
