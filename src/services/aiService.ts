/**
 * Modular AI Service Layer for JARVIS Core.
 * Easily switchable between Mock Generator and Local LLM (Ollama, LM Studio, vLLM).
 */

export interface IAIService {
  processCommand(prompt: string): Promise<string>;
}

/**
 * Intelligent Mock AI Service with authentic JARVIS responses.
 */
export class MockAIService implements IAIService {
  public async processCommand(prompt: string): Promise<string> {
    // Simulate realistic AI generation latency
    await new Promise((resolve) => setTimeout(resolve, 1400));

    const clean = prompt.toLowerCase().trim();

    // 1. Ideas for programming videos (explicitly mentioned in user request)
    if (clean.includes('видео') || clean.includes('ролик') || clean.includes('идеи') || clean.includes('youtube')) {
      const ideas = [
        'Создание собственного AI-ассистента на React и Three.js с нуля.',
        'Локальные нейросети: запуск Llama 3 на личном компьютере без облака.',
        'Сравнение производительности Rust и Go в высоконагруженных микросервисах.',
        'Как устроены 3D шейдеры в веб-приложениях: от математики до рендера.'
      ];
      return `Сэр, я подобрал актуальные темы для роликов: ${ideas.join(' ')} Могу составить подробный сценарий для любой из них.`;
    }

    // 2. Programming questions
    if (clean.includes('код') || clean.includes('программир') || clean.includes('typescript') || clean.includes('python') || clean.includes('react')) {
      return 'Сэр, анализ завершен. Рекомендую использовать модульную архитектуру с типизированными интерфейсами и WebGL-акселерацией для максимальной производительности.';
    }

    // 3. System status / diagnostics
    if (clean.includes('систем') || clean.includes('статус') || clean.includes('состояни') || clean.includes('диагностик')) {
      return 'Все подсистемы JARVIS Core функционируют штатно. Графический конвейер 3D-ядра стабилен, аудио-интерфейс готов к приёму директив.';
    }

    // 4. Greetings / Who are you
    if (clean.includes('привет') || clean.includes('здравствуй') || clean.includes('кто ты') || clean.includes('ты кто')) {
      return 'Здравствуйте, сэр. Я JARVIS — ваш персональный автономный интеллект. Все протоколы активированы и готовы к работе.';
    }

    // 5. General search / web query
    if (clean.includes('найди') || clean.includes('поиск') || clean.includes('гугл') || clean.includes('интернет')) {
      return `Принято. Инициирую глобальный поиск по запросу: «${prompt}». Данные агрегированы и структурированы.`;
    }

    // 6. Default response in JARVIS tone
    return `Директива «${prompt}» успешно обработана, сэр. Все сопутствующие расчеты выполнены. Жду дальнейших указаний.`;
  }
}

/**
 * Ready-to-use Local LLM Service (e.g. Ollama or LM Studio running locally).
 * To switch to a local model, simply instantiate this class below.
 */
export class LocalLLMService implements IAIService {
  constructor(
    private endpoint: string = 'http://localhost:11434/api/generate',
    private modelName: string = 'llama3'
  ) {}

  public async processCommand(prompt: string): Promise<string> {
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.modelName,
          prompt: `Ты — AI-ассистент JARVIS. Отвечай кратко, вежливо (обращаясь "сэр"), точно и по делу в стиле футуристического ассистента.\nПользователь: ${prompt}\nJARVIS:`,
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`LLM Error: ${response.statusText}`);
      }

      const data = await response.json();
      return data.response || 'Ответ не получен, сэр.';
    } catch {
      // Fallback to Mock if local LLM server is not running
      const fallback = new MockAIService();
      return fallback.processCommand(prompt);
    }
  }
}

// Active AI Service Instance (Mock by default, easily swapped with LocalLLMService)
export const aiService: IAIService = new MockAIService();
