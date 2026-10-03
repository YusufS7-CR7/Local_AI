import { memoryStore } from './memoryStore.js';
import { brain } from '../router/brain.js';

export class MemoryExtractor {
  /**
   * Fast synchronous pattern extractor for immediate conversational facts.
   * Runs instantly on every user prompt.
   */
  public extractImmediateFacts(prompt: string): boolean {
    const text = prompt.trim();
    let foundAny = false;

    // 1. Name: "меня зовут Ваня", "моё имя Алекс"
    const nameMatch = text.match(/(?:меня\s+зовут|мо[её]\s+имя)\s+([A-ZА-Я][a-zа-яA-ZА-Я0-9_-]+)/i);
    if (nameMatch?.[1]) {
      memoryStore.remember('user_name', nameMatch[1], 'profile', 'user_statement');
      foundAny = true;
    }

    // 2. City: "я живу в Москве", "мой город Казань"
    const cityMatch = text.match(/(?:я\s+живу\s+в|мой\s+город)\s+([A-ZА-Я][a-zа-яA-ZА-Я0-9_-]+)/i);
    if (cityMatch?.[1]) {
      memoryStore.remember('user_city', cityMatch[1], 'profile', 'user_statement');
      foundAny = true;
    }

    // 3. Explicit "Запомни": "запомни, что Мама это контакт ...", "запомни: я люблю слушать рок"
    const rememberMatch = text.match(/^(?:джарвис|jarvis,?)?\s*(?:запомни|сохрани(?:\s+в\s+память)?)\s*[:,\s]+(.+)$/i);
    if (rememberMatch?.[1]) {
      const factText = rememberMatch[1].trim();
      const parts = factText.split(/\s*[-—:]\s*|\s+(?:это|равно|равен)\s+/i);
      if (parts.length >= 2) {
        memoryStore.remember(parts[0].trim(), parts.slice(1).join(' ').trim(), 'general', 'explicit_remember');
      } else {
        memoryStore.remember(`note_${Date.now()}`, factText, 'general', 'explicit_remember');
      }
      foundAny = true;
    }

    // 4. Favorites: "мой любимый исполнитель - Eminem", "моя любимая песня - ..."
    const favMatch = text.match(/мо[яеёй]\s+любим(?:ый|ая|ое|ые)\s+([a-zа-яA-ZА-Я0-9_\s]{2,20})\s*[-—:]?\s*(?:это\s+)?(.+)$/i);
    if (favMatch?.[1] && favMatch[2]) {
      const categoryName = `favorite_${favMatch[1].trim().replace(/\s+/g, '_')}`;
      memoryStore.remember(categoryName, favMatch[2].trim(), 'preference', 'user_statement');
      foundAny = true;
    }

    return foundAny;
  }

  /**
   * Background AI-powered memory extractor.
   * Runs non-blockingly after a task completes to discover nuanced user preferences,
   * habits, names, contacts, or instructions.
   */
  public async extractBackgroundFacts(prompt: string, response: string): Promise<void> {
    try {
      // Skip very short generic prompts to save API calls
      if (prompt.length < 8 || /^(да|нет|отмена|стоп|ок|хорошо|спасибо)$/i.test(prompt)) {
        return;
      }

      const extractionPrompt = `Ты — модуль долгосрочной памяти AI-ассистента JARVIS.
Проанализируй диалог пользователя и ассистента:

ПОЛЬЗОВАТЕЛЬ: "${prompt}"
АССИСТЕНТ: "${response}"

Задача: извлеки ДЛИТЕЛЬНО ПОЛЕЗНЫЕ факты о пользователе (имя, предпочтения, любимые вещи, контакты, привычки, важные заметки), которые помогут ассистенту в БУДУЩЕМ.
НЕ сохраняй разовые действия (например "открыл хром").

Верни СТРОГО JSON-массив без markdown:
[
  {
    "key": "краткий_ключ_на_латинице (например: user_name, favorite_band, contact_mama, work_title)",
    "value": "значение факта",
    "category": "profile" | "preference" | "contact" | "task" | "general"
  }
]
Если полезных фактов нет — верни пустой массив [].`;

      const raw = await brain.generate({
        prompt: extractionPrompt,
        temperature: 0.1,
        format: 'json',
      });

      const clean = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
      const items = JSON.parse(clean);

      if (Array.isArray(items)) {
        for (const item of items) {
          if (item.key && item.value && typeof item.key === 'string' && typeof item.value === 'string') {
            const cat = ['profile', 'preference', 'contact', 'task', 'general'].includes(item.category)
              ? item.category
              : 'general';
            memoryStore.remember(item.key, item.value, cat, 'ai_extracted');
          }
        }
      }
    } catch {
      // Background extraction errors are non-critical and should not disrupt user tasks
    }
  }
}

export const memoryExtractor = new MemoryExtractor();
