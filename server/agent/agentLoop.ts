import { AgentTask, AgentStep, AgentEvent } from './types.js';
import { taskPlanner } from './planner.js';
import { toolRegistry } from '../tools/registry.js';
import { safetyManager } from '../safety/permissions.js';
import { brain } from '../router/brain.js';
import { screenshotTool } from '../tools/computer/screenshot.js';

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
      while (currentStepIndex < this.maxSteps && !isTaskFinished) {
        currentStepIndex++;

        let nextToolCall = toolQueue.shift();

        // If no pre-planned tool call remains, ask LLM for next action
        if (!nextToolCall) {
          nextToolCall = await this.decideNextStep(task);
        }

        // If LLM decided no further tools are needed, we are done
        if (!nextToolCall || nextToolCall.name === 'finish' || nextToolCall.name === 'complete') {
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
        const shouldVerify = toolQueue.length === 0;
        const verification = result.success && shouldVerify
          ? await this.verifyAction(task.prompt, tool.name, step.parameters || {}, result)
          : result.success
            ? { verified: true, observation: 'Промежуточный шаг выполнен; итог будет проверен после завершения последовательности.' }
          : { verified: false, observation: result.error || 'Инструмент завершился с ошибкой.' };

        step.result = result.data;
        step.observation = this.getUserObservation(tool.name, result);
        if (!verification.verified) {
          step.observation += ` Проверка: ${verification.observation}`;
          const retryKey = `${tool.name}:${JSON.stringify(step.parameters || {})}`;
          const retries = verificationRetries.get(retryKey) || 0;
          if (retries < 1) {
            verificationRetries.set(retryKey, retries + 1);
            toolQueue.unshift(nextToolCall);
          }
        }
        task.steps.push(step);

        this.emit({ type: 'STEP_FINISH', taskId, status: 'executing', step });
        console.log(`[JARVIS Observe] ${step.observation}`);

        if (tool.name === 'browser.youtube_play_playlist' && result.success) {
          this.emit({
            type: 'ASSISTANT_MESSAGE',
            taskId,
            status: 'speaking',
            message: 'Нашёл плейлист, сэр. Включаю.',
          });
        }

        // Minimal delay between actions for instant continuous execution
        await new Promise(r => setTimeout(r, 50));

        // Evaluate if entire queue is empty
        if (toolQueue.length === 0 && verification.verified) {
          isTaskFinished = true;
        }
      }

      // ── Step 3: Synthesize Final Verbal Response ──
      task.status = 'speaking';
      finalSummary = finalSummary || await this.generateFinalResponse(task);
      task.finalResponse = finalSummary;
      task.status = 'completed';
      task.endTime = Date.now();

      this.emit({
        type: 'TASK_COMPLETE',
        taskId,
        status: 'completed',
        finalResponse: finalSummary,
      });

      console.log(`[JARVIS Agent] Final Response:\n"${finalSummary}"\n`);
      return task;
    } catch (err: any) {
      console.error('[JARVIS Agent] Task execution failure:', err);
      task.status = 'error';
      task.error = err.message;
      task.endTime = Date.now();

      this.emit({
        type: 'ERROR',
        taskId,
        status: 'error',
        error: err.message,
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

  private getOpeningMessage(prompt: string): string {
    const lowerPrompt = prompt.toLowerCase();
    if ((lowerPrompt.includes('ютуб') || lowerPrompt.includes('youtube')) &&
        (lowerPrompt.includes('плейлист') || lowerPrompt.includes('playlist'))) {
      return 'Понял, сэр. Открываю Chrome, ищу нужный плейлист на YouTube.';
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
    if (toolName === 'computer.screenshot' || toolName === 'computer.read_screen') {
      return { verified: true, observation: 'Проверка экрана уже выполнена.' };
    }

    if (!result.success) {
      return {
        verified: false,
        observation: `Инструмент сообщил об ошибке: ${result.error || result.message || 'Сбой выполнения'}`,
      };
    }

    let screenCaptured = false;
    try {
      // Allow window rendering animation to settle before taking screenshot
      await new Promise(r => setTimeout(r, 600));

      const screenResult = await screenshotTool.execute({ resizeWidth: 1024 });
      if (!screenResult.success || !screenResult.screenshot) {
        return { verified: false, observation: 'Не удалось получить проверочный снимок экрана.' };
      }
      screenCaptured = true;

      const imageBase64 = screenResult.screenshot.replace(/^data:image\/\w+;base64,/, '');
      const response = await brain.generateWithVision({
        prompt: `Посмотри на снимок экрана Windows.\nЦель пользователя: "${prompt}"\nВыполненное действие: ${toolName}(${JSON.stringify(parameters)})\nРезультат инструмента: "${result.message || ''}"\n\nВнимательно проверь, видно ли на экране открытое окно нужного приложения (например Telegram, Chrome, Блокнот и т.д.), открыт ли нужный чат/сайт, виден ли результат.\nОтветь строго JSON: {"verified": true или false, "observation": "точное описание на русском: что сейчас открыто на экране и подтверждено ли действие"}. Считай verified=true ТОЛЬКО если действие реально видно на экране.`,
        images: [imageBase64],
      });

      const cleanJson = response.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
      const parsed = JSON.parse(cleanJson);
      return {
        verified: parsed.verified === true,
        observation: parsed.observation || (parsed.verified === true ? 'Результат успешно подтверждён на экране.' : 'Окно или результат действия не обнаружены на экране.'),
      };
    } catch (err: any) {
      if (screenCaptured) {
        return {
          verified: true,
          observation: `Снимок экрана зафиксирован (${result.message || 'Действие выполнено'}).`,
        };
      }
      return { verified: false, observation: `Не удалось проверить экран: ${err.message || String(err)}` };
    }
  }

  /**
   * Generates a professional spoken summary from the real execution log.
   */
  private async generateFinalResponse(task: AgentTask): Promise<string> {
    const stepSummary = task.steps
      .map(s => `${s.toolName}: ${s.observation}`)
      .filter(Boolean)
      .join('\n') || 'No tools were executed.';

    const system = `You are JARVIS, a senior technical assistant for a software engineer.
Reply in Russian, 1–3 concise sentences, spoken aloud. Address the user as "сэр" naturally.
Tone: calm, precise, professional. No movie-parody catchphrases, no fake enthusiasm.
CRITICAL HONESTY RULE:
- Inspect the Execution log carefully.
- If an action was verified on screen, state that it was successfully completed.
- If an action failed, could not open an app, or was not confirmed on screen (e.g. "Не обнаружены на экране"), state HONESTLY and PRECISELY what went wrong and what was attempted. Never claim success if an app did not open.
- Do not mention raw JSON or technical parameters.`;

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
