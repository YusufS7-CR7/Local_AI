import { describe, expect, it } from 'vitest';
import { TaskPlanner } from '../agent/planner.js';

describe('TaskPlanner YouTube commands', () => {
  it('creates a playlist search and playback action from a natural Russian request', async () => {
    const result = await new TaskPlanner().createPlan(
      'Джарвис, открой в хроме ютуб и найди там плейлист из грустных песен и поставь его',
    );

    expect(result.initialToolCalls).toEqual([
      {
        name: 'browser.youtube_play_playlist',
        parameters: { query: 'грустных песен' },
      },
    ]);
    expect(result.plan).toHaveLength(3);
    expect(result.plan[2]).toContain('включить воспроизведение');
  });

  it('opens YouTube instead of Google for a video search command', async () => {
    const result = await new TaskPlanner().createPlan(
      'Открой YouTube в Хроме и найди там видеоролик',
    );

    expect(result.initialToolCalls).toEqual([
      {
        name: 'browser.open',
        parameters: { url: 'https://www.youtube.com' },
      },
    ]);
  });

  it('creates one reliable Telegram chat message action', async () => {
    const result = await new TaskPlanner().createPlan(
      'Джарвис, открой Telegram, найди чат Алексей и напиши ему Привет, как дела?',
    );

    expect(result.thought).toContain('Понял, сэр');
    expect(result.initialToolCalls).toEqual([
      {
        name: 'computer.telegram_send_message',
        parameters: { chat: 'Алексей', message: 'Привет, как дела?' },
      },
    ]);
  });

  it('keeps the servant-like wording for browser and app opening actions', async () => {
    const result = await new TaskPlanner().createPlan(
      'Открой Chrome и найди информацию про React',
    );

    expect(result.thought).toContain('Понял, сэр');
    expect(result.thought).toContain('Chrome');
  });

  it('uses the reliable action for Telegram Saved Messages', async () => {
    const result = await new TaskPlanner().createPlan(
      'Открой Telegram и отправь в Избранное сообщение проверь это',
    );

    expect(result.initialToolCalls?.[0]).toEqual({
      name: 'computer.telegram_send_message',
      parameters: { chat: 'Избранное', message: 'проверь это' },
    });
  });
});
