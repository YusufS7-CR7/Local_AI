import { ITool, ToolResult } from '../types.js';
import { screenshotTool } from './screenshot.js';
import { brain } from '../../router/brain.js';

export const readScreenTool: ITool = {
  name: 'computer.read_screen',
  category: 'computer',
  description: 'Takes a screenshot and uses the Vision AI Model to analyze the screen content, find UI elements, buttons, text, and active windows.',
  parameters: [
    {
      name: 'prompt',
      type: 'string',
      description: 'Specific question about the screen (e.g. "Find the coordinates of the Submit button", "What is written in the main window?", "Describe the screen layout")',
      required: false,
    },
  ],
  dangerLevel: 'safe',
  async execute(params: { prompt?: string }): Promise<ToolResult> {
    try {
      // 1. Capture screen
      const screenRes = await screenshotTool.execute({ resizeWidth: 1024 });
      if (!screenRes.success || !screenRes.screenshot) {
        return { success: false, error: 'Could not capture screen for vision analysis.' };
      }

      // Extract raw base64 data
      const base64Data = screenRes.screenshot.replace(/^data:image\/\w+;base64,/, '');

      const userPrompt = params.prompt || 'Describe what application is currently open on the screen, what UI elements and text are visible, and list any buttons or links.';

      // 2. Query Vision Model
      const visionResponse = await brain.generateWithVision({
        prompt: `You are JARVIS screen vision. Analyze this Windows desktop screenshot carefully and answer in Russian unless the user asked in English.\n${userPrompt}`,
        images: [base64Data],
      });

      return {
        success: true,
        data: {
          analysis: visionResponse,
        },
        screenshot: screenRes.screenshot,
        message: visionResponse,
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Vision screen analysis failed: ${err.message}`,
      };
    }
  },
};
