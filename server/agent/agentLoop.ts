import { AgentTask, AgentStep, AgentEvent } from './types.js';
import { taskPlanner } from './planner.js';
import { toolRegistry } from '../tools/registry.js';
import { safetyManager } from '../safety/permissions.js';
import { brain } from '../router/brain.js';
import { screenshotTool } from '../tools/computer/screenshot.js';
import { memoryStore } from '../memory/memoryStore.js';
import { memoryExtractor } from '../memory/extractor.js';

export type EventListener = (event: AgentEvent) => void;

export class AgentLoop {
  private activeTask: AgentTask | null = null;
  private listeners: Set<EventListener> = new Set();
  private maxSteps: number = 20;

  public addListener(fn: EventListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(event: AgentEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[AgentLoop] Listener error:', err);
      }
    }
  }

  public getActiveTask(): AgentTask | null {
    return this.activeTask;
  }

  /**
   * Main entry point to run an autonomous task.
   */
  public async runTask(prompt: string): Promise<AgentTask> {
    const taskId = `task_${Date.now()}`;
    const task: AgentTask = {
      id: taskId,
      prompt,
      status: 'thinking',
      plan: [],
      steps: [],
      startTime: Date.now(),
    };
    this.activeTask = task;

    console.log(`\n========================================`);
    console.log(`[JARVIS Agent] New Directive: "${prompt}" (ID: ${taskId})`);
    console.log(`========================================`);

    // Immediate extraction of user profile/preferences facts
    try {
      memoryExtractor.extractImmediateFacts(prompt);
    } catch (e) {
      console.warn('[AgentLoop] Immediate fact extraction error:', e);
    }

    this.emit({ type: 'STATUS_CHANGE', taskId, status: 'thinking' });
    this.emit({
      type: 'ASSISTANT_MESSAGE',
      taskId,
      status: 'thinking',
      message: this.getOpeningMessage(prompt),
    });

    try {
      // ── Step 1: Planning ──
      task.status = 'planning';
      this.emit({ type: 'STATUS_CHANGE', taskId, status: 'planning' });

      const planResult = await taskPlanner.createPlan(prompt);
      task.plan = planResult.plan;
      this.emit({ type: 'PLAN_READY', taskId, status: 'planning', plan: task.plan });

      console.log(`[JARVIS Agent] Formulated Plan:\n${task.plan.map((p, i) => `  ${i + 1}. ${p}`).join('\n')}`);

      let currentStepIndex = 0;
      const toolQueue = [...(planResult.initialToolCalls || (planResult.initialToolCall ? [planResult.initialToolCall] : []))];
      const verificationRetries = new Map<string, number>();
      let isTaskFinished = planResult.llmPlanned === true && toolQueue.length === 0;
      let finalSummary = '';

      // ── Step 2: ReAct Execution Loop ──
      // Tools that are critical and must ALWAYS be verified on screen
      const ALWAYS_VERIFY_TOOLS = new Set([
        'computer.open_app',
        'computer.telegram_send_message',
        'browser.open',
        'browser.navigate',
        'browser.new_tab',
        'computer.switch_window',
        'filesystem.write',
        'filesystem.delete',
      ]);

      while (currentStepIndex < this.maxSteps && !isTaskFinished) {
        currentStepIndex++;

        let nextToolCall = toolQueue.shift();

        // If no pre-planned tool call remains, ask LLM for next action
        if (!nextToolCall) {
          nextToolCall = await this.decideNextStep(task);
        }

        // If LLM decided no further tools are needed, we are done
        if (!nextToolCall) {
          // LLM returned nothing — likely an API error or context overflow
          console.warn('[JARVIS Agent] decideNextStep returned undefined — LLM could not decide next action.');
          task.errorDiagnostics = {
            errorCode: 'ERR_LLM_DECISION_FAILED',
            reason: 'AI не смог определить следующее действие (возможна перегрузка API или недостаточность контекста).',
            suggestedFix: 'Попробуйте переформулировать команду или проверьте соединение с AI провайдером.',
          };
          break;
        }

        if (nextToolCall.name === 'finish' || nextToolCall.name === 'complete') {
          isTaskFinished = true;
          break;
        }

        const tool = toolRegistry.get(nextToolCall.name);
        if (!tool) {
          console.warn(`[JARVIS Agent] Tool "${nextToolCall.name}" not found. Ending steps.`);
          break;
        }

        const planStepDescription = task.plan[currentStepIndex - 1] || `Выполняю ${tool.name}`;
        const step: AgentStep = {
          stepIndex: currentStepIndex,
          thought: planStepDescription,
          toolName: tool.name,
          parameters: nextToolCall.parameters || {},
          timestamp: Date.now(),
        };

        // ── Step Spoken Progress ──
        const stepAnnouncement = this.getStepSpokenProgress(tool.name, step.parameters, planStepDescription);
        if (stepAnnouncement) {
          this.emit({
            type: 'ASSISTANT_MESSAGE',
            taskId,
            status: 'speaking',
            message: stepAnnouncement,
          });
        }

        // ── Safety & Permission Check ──
        const safetyCheck = safetyManager.requiresConfirmation(tool, step.parameters || {});
        if (safetyCheck.required) {
          task.status = 'awaiting_confirmation';
          this.emit({
            type: 'CONFIRMATION_REQUIRED',
            taskId,
            status: 'awaiting_confirmation',
            step,
            payload: { reason: safetyCheck.reason },
          });

          console.log(`[Safety] Action "${tool.name}" requires user approval: ${safetyCheck.reason}`);
          const approved = await safetyManager.requestApproval(tool, step.parameters || {}, safetyCheck.reason || 'Dangerous action');

          if (!approved) {
            step.observation = 'User rejected permission for this action.';
            task.steps.push(step);
            this.emit({ type: 'STEP_FINISH', taskId, status: 'executing', step });
            finalSummary = `Директива остановлена: действие ${tool.name} было отклонено, сэр.`;
            break;
          }
        }

        // ── Execute Action ──
        task.status = 'executing';
        this.emit({ type: 'STEP_START', taskId, status: 'executing', step });

        console.log(`[JARVIS Act] Step ${currentStepIndex}: ${tool.name}(${JSON.stringify(step.parameters)})`);
        const result = await toolRegistry.execute(tool.name, step.parameters || {});
        // Verify immediately for critical tools OR when queue is empty (final step)
        const isCriticalTool = ALWAYS_VERIFY_TOOLS.has(tool.name);
        const isLastStep = toolQueue.length === 0;
        const shouldVerify = isCriticalTool || isLastStep;
        const verification = result.success && shouldVerify
          ? await this.verifyAction(task.prompt, tool.name, step.parameters || {}, result)
          : result.success
            ? { verified: true, observation: 'Промежуточный вспомогательный шаг выполнен.' }
          : { verified: false, observation: result.error || 'Инструмент завершился с ошибкой.' };

        step.result = result.data;
        step.observation = this.getUserObservation(tool.name, result);
        // Enrich observation with what Vision AI actually saw on screen
        if (verification.observation && verification.observation !== 'Промежуточный вспомогательный шаг выполнен.') {
          step.observation += ` [Экран: ${verification.observation}]`;
        }

        if (!result.success || !verification.verified) {
          const errorCode = !result.success
            ? (tool.name.includes('telegram') ? 'ERR_TELEGRAM_ACTION_FAILED' : tool.name.includes('app') ? 'ERR_APP_FOCUS_FAILED' : 'ERR_TOOL_EXECUTION_FAILED')
            : 'ERR_SCREEN_VERIFICATION_FAILED';

          const errorDiag = {
            errorCode,
            failedStepIndex: currentStepIndex,
            failedTool: tool.name,
            parameters: step.parameters,
            reason: result.error || verification.observation || 'Не удалось подтвердить выполнение на экране',
            systemDetails: result.data || undefined,
            suggestedFix: tool.name.includes('telegram')
              ? 'Убедитесь, что Telegram Desktop запущен или установлен в стандартную директорию AppData.'
              : 'Проверьте, не блокирует ли стороннее приложение вывод окна на передний план.',
          };
          step.diagnostics = errorDiag;
          task.errorDiagnostics = errorDiag;

          if (!verification.verified && result.success) {
            const retryKey = `${tool.name}:${JSON.stringify(step.parameters || {})}`;
            const retries = verificationRetries.get(retryKey) || 0;
            if (retries < 1) {
              console.log(`[JARVIS Verify] Verification failed for ${tool.name}, scheduling retry in 1500ms...`);
              verificationRetries.set(retryKey, retries + 1);
              // Extra delay before retry so OS has more time to render
              await new Promise(r => setTimeout(r, 1500));
              toolQueue.unshift(nextToolCall);
            } else {
              console.warn(`[JARVIS Verify] Retry limit reached for ${tool.name}. Marking as failed.`);
            }
          }
        }

        task.steps.push(step);
        this.emit({ 
          type: 'STEP_FINISH', 
          taskId, 
          status: 'executing', 
          step,
          errorDiagnostics: step.diagnostics,
        });
        console.log(`[JARVIS Observe] ${step.observation}`);

        if (tool.name === 'browser.youtube_play_playlist' && result.success) {
          this.emit({
            type: 'ASSISTANT_MESSAGE',
            taskId,
            status: 'speaking',
            message: 'Нашёл плейлист, сэр. Включаю.',
          });
        }

        // Minimal delay between actions for smooth continuous execution
        await new Promise(r => setTimeout(r, 80));

        // Evaluate if entire queue is empty
        if (toolQueue.length === 0 && verification.verified) {
          isTaskFinished = true;
        }
      }

      // ── Step 3: Synthesize Final Verbal Response ──
      task.status = 'speaking';
      finalSummary = finalSummary || await this.generateFinalResponse(task);
      task.finalResponse = finalSummary;
      task.status = task.errorDiagnostics && !isTaskFinished ? 'error' : 'completed';
      task.endTime = Date.now();

      // Record episode & extract background facts into persistent memory
      try {
        const executedTools = task.steps.map(s => s.toolName).filter((name): name is string => typeof name === 'string' && name.length > 0);
        memoryStore.recordEpisode(task.prompt, executedTools, finalSummary);
        memoryExtractor.extractBackgroundFacts(task.prompt, finalSummary).catch(() => {});
      } catch (e) {
        console.warn('[AgentLoop] Memory record error:', e);
      }

      this.emit({
        type: task.status === 'error' ? 'ERROR' : 'TASK_COMPLETE',
        taskId,
        status: task.status,
        finalResponse: finalSummary,
        error: task.errorDiagnostics?.reason,
        errorDiagnostics: task.errorDiagnostics,
      });

      console.log(`[JARVIS Agent] Final Response:\n"${finalSummary}"\n`);
      return task;
    } catch (err: any) {
      console.error('[JARVIS Agent] Task execution failure:', err);
      task.status = 'error';
      task.error = err.message;
      task.errorDiagnostics = {
        errorCode: 'ERR_AGENT_CRITICAL_FAILURE',
        reason: err.message || String(err),
        suggestedFix: 'Проверьте сетевое подключение к LLM и права доступа PowerShell.',
      };
      task.endTime = Date.now();

      try {
        const executedTools = task.steps.map(s => s.toolName).filter((name): name is string => typeof name === 'string' && name.length > 0);
        memoryStore.recordEpisode(task.prompt, executedTools, `Ошибка: ${err.message}`);
      } catch {}

      this.emit({
        type: 'ERROR',
        taskId,
        status: 'error',
        error: err.message,
        errorDiagnostics: task.errorDiagnostics,
      });

      return task;
    }
  }

  /**
   * Uses Multimodal Vision AI to decide the next step based on live screen state and observations.
   */
  private async decideNextStep(task: AgentTask): Promise<{ name: string; parameters: Record<string, any> } | undefined> {
    const toolsDoc = toolRegistry.getToolDocumentation();

    const history = task.steps.map(s =>
      `Step ${s.stepIndex}: Tool ${s.toolName} -> Result: ${s.observation}`
    ).join('\n');

    const prompt = `Goal: "${task.prompt}"
Plan: ${task.plan.join(', ')}

Execution History:
${history || 'No steps executed yet.'}

Look at the live Windows screen image and execution history.
Determine the next single tool action to take, or finish if goal is fully accomplished.
Return STRICT JSON ONLY:
{
  "thought": "Reasoning for next step based on visible screen state",
  "toolCall": {
    "name": "tool.name (or 'finish' if done)",
    "parameters": {}
  }
}`;

    // 1. Try Vision-enabled decision (sees live desktop state)
    try {
      const screenRes = await screenshotTool.execute({ resizeWidth: 1024 });
      if (screenRes.success && screenRes.screenshot) {
        const imageBase64 = screenRes.screenshot.replace(/^data:image\/\w+;base64,/, '');
        const raw = await brain.generateWithVision({
          prompt: `You are JARVIS, an autonomous visual computer-use agent.\nAvailable Tools:\n${toolsDoc}\n\n${prompt}`,
          images: [imageBase64],
        });
        const clean = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
        const parsed = JSON.parse(clean);
        if (parsed?.toolCall) {
          return parsed.toolCall;
        }
      }
    } catch {}

    // 2. Text-only fallback decision
    try {
      const raw = await brain.generate({
        prompt,
        system: `You are JARVIS, a professional computer-use engine. Pick the next real tool call, or finish if the goal is done.\nAvailable Tools:\n${toolsDoc}`,
        format: 'json',
        temperature: 0.1,
      });

      const clean = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
      const parsed = JSON.parse(clean);
      return parsed.toolCall;
    } catch {
      return undefined;
    }
  }

  private getUserObservation(toolName: string, result: { success: boolean; message?: string; error?: string }): string {
    if (toolName === 'computer.open_app' && result.success && /google\.com\/search\?q=/i.test(result.message || '')) {
      return 'Открыл Chrome и выполнил поиск по вашему запросу.';
    }

    return result.message || (result.success ? 'Действие выполнено.' : `Ошибка: ${result.error}`);
  }

  private getStepSpokenProgress(toolName: string, parameters?: Record<string, any>, planStep?: string): string {
    const params = parameters || {};
    
    if (toolName === 'computer.open_app') {
      const app = (params.appName || '').toLowerCase();
      if (app.includes('telegram') || app.includes('тг')) {
        return 'Вывожу Telegram на передний план...';
      }
      if (app.includes('chrome') || app.includes('браузер') || app.includes('хром')) {
        return 'Запускаю браузер Chrome...';
      }
      if (app.includes('notepad') || app.includes('блокнот')) {
        return 'Открываю Блокнот...';
      }
      if (app.includes('code') || app.includes('vscode')) {
        return 'Открываю Visual Studio Code...';
      }
      if (app.includes('calc')) {
        return 'Запускаю Калькулятор...';
      }
      return `Открываю приложение ${params.appName || 'на ПК'}...`;
    }

    if (toolName === 'computer.telegram_send_message') {
      const chat = params.chat || 'Избранное';
      return `Открываю чат «${chat}» в Telegram и отправляю сообщение...`;
    }

    if (toolName === 'browser.youtube_play_playlist') {
      return `Ищу плейлист «${params.query || ''}» на YouTube и включаю...`;
    }

    if (toolName === 'computer.switch_window') {
      return `Переключаюсь на окно «${params.query || ''}»...`;
    }

    if (toolName === 'computer.type') {
      return 'Ввожу текст в активное окно...';
    }

    if (toolName === 'computer.screenshot' || toolName === 'computer.read_screen') {
      return 'Проверяю состояние экрана...';
    }

    if (planStep) {
      return `${planStep}...`;
    }

    return 'Выполняю следующий шаг, сэр...';
  }

  private getOpeningMessage(prompt: string): string {
    const lowerPrompt = prompt.toLowerCase();
    if ((lowerPrompt.includes('ютуб') || lowerPrompt.includes('youtube')) &&
        (lowerPrompt.includes('плейлист') || lowerPrompt.includes('playlist'))) {
      return 'Понял, сэр. Открываю Chrome, ищу нужный плейлист на YouTube.';
    }
    if (lowerPrompt.includes('telegram') || lowerPrompt.includes('телеграм') || lowerPrompt.includes('тг')) {
      return 'Принято, сэр. Занимаюсь Telegram.';
    }
    return 'Понял, сэр. Выполняю вашу команду.';
  }

  /**
   * Confirms the visible result of a desktop action by capturing a real screenshot
   * and verifying with the Vision AI model.
   */
  private async verifyAction(
    prompt: string,
    toolName: string,
    parameters: Record<string, any>,
    result: { message?: string; data?: any; success?: boolean; error?: string }
  ): Promise<{ verified: boolean; observation: string }> {
    // Screenshot / screen-read tools are self-verifying
    if (toolName === 'computer.screenshot' || toolName === 'computer.read_screen') {
      return { verified: true, observation: 'Проверка экрана уже выполнена.' };
    }

    if (!result.success) {
      return {
        verified: false,
        observation: `Инструмент сообщил об ошибке: ${result.error || result.message || 'Сбой выполнения'}`,
      };
    }

    try {
      // Allow window rendering animation to settle before taking screenshot
      await new Promise(r => setTimeout(r, 700));

      const screenResult = await screenshotTool.execute({ resizeWidth: 1024 });
      if (!screenResult.success || !screenResult.screenshot) {
        return { verified: false, observation: 'Не удалось получить проверочный снимок экрана.' };
      }

      const imageBase64 = screenResult.screenshot.replace(/^data:image\/\w+;base64,/, '');

      // Build a precise, tool-specific verification question for Vision AI
      let verificationQuestion = '';
      if (toolName === 'computer.telegram_send_message') {
        const chat = parameters.chat || '?';
        const msg = (parameters.message || '').slice(0, 60);
        verificationQuestion = `Проверь: открыт ли в Telegram чат «${chat}»? Видно ли в нём только что отправленное сообщение «${msg}...»? Verified=true ТОЛЬКО если чат открыт И сообщение отправлено (видно в ленте сообщений).`;
      } else if (toolName === 'computer.open_app' || toolName === 'browser.open' || toolName === 'browser.navigate') {
        const app = parameters.appName || parameters.url || '?';
        verificationQuestion = `Проверь: видно ли на экране окно приложения «${app}» или открытый сайт? Это должно быть активное окно на переднем плане, а не просто кнопка в панели задач. Verified=true ТОЛЬКО если окно реально открыто и занимает экран.`;
      } else if (toolName === 'computer.switch_window') {
        verificationQuestion = `Проверь: переключилось ли активное окно на «${parameters.query || '?'}»? Verified=true ТОЛЬКО если это окно сейчас на переднем плане.`;
      } else if (toolName === 'filesystem.write') {
        verificationQuestion = `Проверь: был ли файл успешно записан? Verified=true если инструмент не сообщил об ошибке и результат: «${result.message}».`;
      } else {
        verificationQuestion = `Проверь, выполнено ли действие ${toolName} для цели «${prompt}». Verified=true ТОЛЬКО если результат действия реально виден на экране.`;
      }

      const response = await brain.generateWithVision({
        prompt: `Ты — система автоматической верификации компьютерного агента JARVIS. Смотри на снимок экрана Windows.

Цель задачи: "${prompt}"
Выполненное действие: ${toolName}(${JSON.stringify(parameters)})
Отчёт инструмента: "${result.message || ''}"

${verificationQuestion}

ОТВЕТЬ СТРОГО JSON без лишних слов:
{"verified": true|false, "observation": "точное описание на русском что сейчас видно на экране"}`,
        images: [imageBase64],
      });

      const cleanJson = response.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();

      // Strict JSON parse — do NOT silently assume verified=true on failure
      let parsed: any;
      try {
        parsed = JSON.parse(cleanJson);
      } catch (parseErr: any) {
        console.warn(`[Verify] JSON parse failed for tool ${toolName}:`, parseErr.message, '| Raw:', cleanJson.slice(0, 200));
        return {
          verified: false,
          observation: `Не удалось разобрать ответ Vision AI. Считаем шаг НЕ подтверждённым. Raw: ${cleanJson.slice(0, 120)}`,
        };
      }

      return {
        verified: parsed.verified === true,
        observation: parsed.observation || (parsed.verified === true
          ? 'Результат успешно подтверждён на экране.'
          : 'Окно или результат действия не обнаружены на экране.'),
      };
    } catch (err: any) {
      return { verified: false, observation: `Ошибка верификации: ${err.message || String(err)}` };
    }
  }

  /**
   * Generates a professional spoken summary from the real execution log.
   */
  private async generateFinalResponse(task: AgentTask): Promise<string> {
    const stepSummary = task.steps
      .map(s => `${s.toolName}: ${s.observation}`)
      .filter(Boolean)
      .join('\n') || (task.plan.length > 0 ? `Plan: ${task.plan.join(' | ')}` : 'No tools were executed.');

    const memoryContext = memoryStore.formatContext(task.prompt);

    const system = `You are JARVIS, a senior technical assistant for a software engineer.
Reply in Russian, 1–3 concise sentences, spoken aloud. Address the user as "сэр" naturally.
Tone: calm, precise, professional. No movie-parody catchphrases, no fake enthusiasm.
CRITICAL HONESTY & MEMORY RULES:
- If the user asks a question about themselves (name, preferences, habits, contacts) or past tasks, answer DIRECTLY using the provided Memory context.
- Inspect the Execution log carefully.
- If an action was verified on screen, state that it was successfully completed.
- If an action failed, could not open an app, or was not confirmed on screen (e.g. "Не обнаружены на экране"), state HONESTLY and PRECISELY what went wrong and what was attempted. Never claim success if an app did not open.
- Do not mention raw JSON or technical parameters.
${memoryContext ? `\n${memoryContext}\n` : ''}`;

    try {
      const response = await brain.generate({
        system,
        prompt: `User request: "${task.prompt}"\nPlan: ${task.plan.join(' | ')}\nExecution log:\n${stepSummary}`,
        temperature: 0.35,
      });

      const clean = response.trim();
      if (clean.startsWith('{')) {
        try {
          const parsed = JSON.parse(clean);
          return parsed.thought || parsed.response || parsed.finalResponse || clean;
        } catch {
          return clean;
        }
      }

      return clean || 'Готово.';
    } catch {
      return 'Не удалось сформировать ответ модели. Задача зафиксирована в логе.';
    }
  }
}

export const agentLoop = new AgentLoop();
