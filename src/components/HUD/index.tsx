import React, { useState } from 'react';
import { CoreState, VoiceState, AgentState } from '../../types';
import { StatusIndicator } from './StatusIndicator';

interface HUDProps {
  coreState: CoreState;
  voiceState: VoiceState;
  agentState: AgentState;
  onActivateMic: () => void;
  onTriggerWake: () => void;
  onExecuteCommand: (cmd: string) => void;
  onApproveAction: (id: string) => void;
  onRejectAction: (id: string) => void;
}

export const HUD: React.FC<HUDProps> = ({
  coreState,
  voiceState,
  agentState,
  onActivateMic,
  onTriggerWake,
  onExecuteCommand,
  onApproveAction,
  onRejectAction,
}) => {
  const [inputText, setInputText] = useState('');

  const formatStepParameters = (toolName?: string, parameters?: Record<string, unknown>) => {
    if (toolName === 'computer.open_app' && parameters?.appName === 'chrome' && parameters.args) {
      return JSON.stringify({ appName: 'chrome', args: 'поисковый запрос' });
    }
    return JSON.stringify(parameters || {});
  };

  const handleInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim()) {
      onExecuteCommand(inputText.trim());
      setInputText('');
    }
  };

  const getStatusText = () => {
    switch (coreState.mode) {
      case 'listening': return 'СЛУШАЮ ВАШУ КОМАНДУ...';
      case 'thinking': return 'АНАЛИЗ И ПЛАНИРОВАНИЕ...';
      case 'planning': return 'СОСТАВЛЕНИЕ ПЛАНА ДЕЙСТВИЙ...';
      case 'executing': return `ВЫПОЛНЕНИЕ: ${agentState.currentStep?.toolName || 'ДЕЙСТВИЕ'}`;
      case 'awaiting_confirmation': return 'БЕЗОПАСНОСТЬ: ТРЕБУЕТСЯ ПОДТВЕРЖДЕНИЕ';
      case 'speaking': return 'ГОЛОСОВОЙ ОТВЕТ...';
      case 'error': return 'ОШИБКА ВЫПОЛНЕНИЯ';
      default: return voiceState.isMicActive ? 'ОЖИДАНИЕ: СКАЖИТЕ «JARVIS»' : 'ГОТОВ К РАБОТЕ (КЛИКНИТЕ ДЛЯ АКТИВАЦИИ)';
    }
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-50 overflow-hidden text-[#00d4ff]">
      {/* Decorative Grid & Lines */}
      <div className="absolute top-8 left-0 right-0 h-[1px] bg-[#00d4ff] opacity-20" />
      <div className="absolute bottom-8 left-0 right-0 h-[1px] bg-[#00d4ff] opacity-20" />

      {/* Decorative Corners */}
      <div className="absolute top-4 left-4 w-8 h-8 border-t-2 border-l-2 border-[#00d4ff] opacity-50" />
      <div className="absolute top-4 right-4 w-8 h-8 border-t-2 border-r-2 border-[#00d4ff] opacity-50" />
      <div className="absolute bottom-4 left-4 w-8 h-8 border-b-2 border-l-2 border-[#00d4ff] opacity-50" />
      <div className="absolute bottom-4 right-4 w-8 h-8 border-b-2 border-r-2 border-[#00d4ff] opacity-50" />

      {/* Scanline overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(0,212,255,0.02)_50%)] bg-[length:100%_4px] opacity-30 animate-[scanline_8s_linear_infinite]" />

      {/* Top Left: Title & System Controls */}
      <div className="absolute top-12 left-12 space-y-2">
        <div>
          <h1 className="hud-text text-3xl font-light tracking-widest uppercase m-0">JARVIS</h1>
          <div className="text-[10px] tracking-[0.2em] opacity-60 uppercase mt-1">COMPUTER USE AGENT v0.5</div>
        </div>
        
        {/* Controls & Badges */}
        <div className="flex items-center space-x-2 pointer-events-auto pt-1 font-mono uppercase">
          <button
            onClick={onActivateMic}
            className={`flex items-center space-x-2 px-3 py-1.5 text-xs border rounded transition-all duration-300 ${
              voiceState.isMicActive
                ? 'border-[#00e5ff] bg-[#00e5ff]/15 text-[#00e5ff] shadow-[0_0_12px_rgba(0,229,255,0.4)]'
                : 'border-yellow-500 bg-yellow-500/20 text-yellow-300 animate-pulse'
            }`}
          >
            <span className={`w-2.5 h-2.5 rounded-full ${voiceState.isMicActive ? 'bg-[#00e5ff] animate-ping' : 'bg-yellow-400'}`} />
            <span>{voiceState.isMicActive ? 'МИКРОФОН АКТИВЕН' : 'ВКЛЮЧИТЬ МИКРОФОН'}</span>
          </button>

          <button
            onClick={onTriggerWake}
            className="px-2.5 py-1.5 text-[10px] border border-[#00d4ff]/40 bg-[#00d4ff]/10 hover:bg-[#00d4ff]/25 text-[#00d4ff] rounded transition-all"
            title="Симулировать фразу «Джарвис»"
          >
            ⚡ ТЕСТ «JARVIS»
          </button>
        </div>

        {/* Live Audio Transcript */}
        {voiceState.transcript && (
          <div className="text-xs text-[#00e5ff] bg-[#001830]/90 border border-[#00e5ff]/40 px-3.5 py-2 rounded-md max-w-md shadow-[0_0_15px_rgba(0,229,255,0.2)]">
            <span className="opacity-60 text-[10px] font-mono uppercase mr-1">РАСПОЗНАНО:</span>
            <span className="font-medium text-white">«{voiceState.transcript}»</span>
          </div>
        )}
      </div>

      {/* Top Right: System Diagnostics */}
      <div className="absolute top-12 right-12 flex flex-col items-end space-y-2 font-mono uppercase">
        <StatusIndicator 
          label="AGENT BACKEND" 
          value={agentState.serverConnected ? 'ONLINE (29 TOOLS)' : 'RECONNECTING...'} 
          active={agentState.serverConnected} 
        />
        <StatusIndicator label="AGENT STATUS" value={getStatusText()} active={coreState.mode !== 'idle'} />
        <StatusIndicator label="CORE STATE" value={coreState.mode.toUpperCase()} active={coreState.mode !== 'idle'} />
      </div>

      {/* Live Agent Action Feed (Left Center) */}
      {(agentState.currentStep || agentState.history.length > 0 || agentState.plan.length > 0) && (
        <div className="absolute top-44 left-12 max-w-lg backdrop-blur-md bg-[#001020]/95 border border-[#00d4ff]/40 p-4 rounded-lg shadow-[0_0_30px_rgba(0,212,255,0.2)] space-y-3 pointer-events-auto animate-[fadeIn_0.3s_ease]">
          <div className="flex items-center justify-between border-b border-[#00d4ff]/20 pb-2">
            <span className="text-xs font-bold text-[#00d4ff] tracking-wider font-mono uppercase">AUTONOMOUS OS LOG</span>
            <span className="text-[10px] text-emerald-400 font-mono animate-pulse">● ACTIVE</span>
          </div>

          {/* Current Plan */}
          {agentState.plan.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] opacity-60 font-mono uppercase">ПЛАН ДЕЙСТВИЙ:</div>
              <div className="text-xs space-y-1 text-white/90">
                {agentState.plan.map((p, i) => (
                  <div key={i} className="flex items-start space-x-1.5">
                    <span className="text-[#00d4ff] font-mono font-bold">{i + 1}.</span>
                    <span className="leading-snug">{p}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Current Executing Step */}
          {agentState.currentStep && (
            <div className="bg-[#002244]/70 border border-[#00e5ff]/30 p-2.5 rounded text-xs space-y-1.5">
              <div className="text-[10px] text-[#00e5ff] font-bold font-mono uppercase">
                ТЕКУЩЕЕ ДЕЙСТВИЕ [ШАГ {agentState.currentStep.stepIndex}]:
              </div>
              <div className="text-white font-mono text-[11px] bg-black/50 p-2 rounded break-all">
                ⚡ {agentState.currentStep.toolName}({formatStepParameters(agentState.currentStep.toolName, agentState.currentStep.parameters)})
              </div>
              {agentState.currentStep.observation && (
                <div className="text-[11px] text-emerald-300 leading-relaxed pt-0.5">
                  <span className="font-mono text-[10px] uppercase text-emerald-400 font-bold mr-1">РЕЗУЛЬТАТ:</span>
                  {agentState.currentStep.observation}
                </div>
              )}
            </div>
          )}

          {/* Final Response */}
          {voiceState.lastAiResponse && (
            <div className="text-xs border-t border-[#00d4ff]/20 pt-2.5">
              <span className="text-pink-400 font-bold font-mono">JARVIS: </span>
              <span className="text-white/95 leading-relaxed font-sans text-[13px]">
                {voiceState.lastAiResponse}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Safety Confirmation Modal (Screen Center Overlay) */}
      {agentState.pendingConfirmation && (
        <div className="absolute inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center pointer-events-auto z-[100]">
          <div className="max-w-lg w-full bg-[#150a0a] border-2 border-red-500/80 p-6 rounded-lg shadow-[0_0_50px_rgba(239,68,68,0.5)] space-y-4">
            <div className="flex items-center space-x-3 text-red-400 border-b border-red-500/30 pb-3">
              <span className="text-2xl animate-pulse">⚠️</span>
              <div>
                <div className="text-sm font-bold tracking-widest font-mono uppercase">ПРОТОКОЛ БЕЗОПАСНОСТИ: ТРЕБУЕТСЯ РАЗРЕШЕНИЕ</div>
                <div className="text-[10px] text-red-300/80 uppercase">ОБНАРУЖЕНО ПОТЕНЦИАЛЬНО ОПАСНОЕ ДЕЙСТВИЕ</div>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div>
                <span className="text-gray-400 font-mono">ДЕЙСТВИЕ: </span>
                <span className="text-white font-mono font-bold bg-red-950/60 px-2 py-0.5 rounded border border-red-500/30">
                  {agentState.pendingConfirmation.toolName}
                </span>
              </div>
              <div>
                <span className="text-gray-400 font-mono">ПРИЧИНА: </span>
                <span className="text-red-200">{agentState.pendingConfirmation.reason}</span>
              </div>
              <div>
                <span className="text-gray-400 font-mono">ПАРАМЕТРЫ:</span>
                <pre className="text-[10px] text-yellow-200 bg-black/60 p-2 rounded mt-1 overflow-x-auto border border-yellow-500/20 font-mono">
                  {JSON.stringify(agentState.pendingConfirmation.parameters, null, 2)}
                </pre>
              </div>
            </div>

            <div className="flex space-x-3 pt-2 font-mono uppercase">
              <button
                onClick={() => onApproveAction(agentState.pendingConfirmation!.id)}
                className="flex-1 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded shadow-[0_0_15px_rgba(239,68,68,0.6)] transition-all"
              >
                ✓ РАЗРЕШИТЬ
              </button>
              <button
                onClick={() => onRejectAction(agentState.pendingConfirmation!.id)}
                className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-bold rounded border border-gray-600 transition-all"
              >
                ✕ ОТКЛОНИТЬ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Center: Interactive Input Bar */}
      <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-auto w-full max-w-xl px-4">
        {/* State description banner */}
        <div className="text-sm font-bold tracking-widest text-[#00e5ff] drop-shadow-[0_0_8px_rgba(0,229,255,0.8)] mb-2 font-mono uppercase">
          {getStatusText()}
        </div>

        {/* Command Form */}
        <form onSubmit={handleInputSubmit} className="w-full flex items-center space-x-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Введите команду (например: «Открой хром и найди инфу про ИИ», «Список окон»)..."
            className="flex-1 bg-[#001020]/90 border border-[#00d4ff]/50 focus:border-[#00e5ff] text-white text-xs px-4 py-2.5 rounded outline-none shadow-[0_0_15px_rgba(0,212,255,0.15)] placeholder-[#00d4ff]/40"
          />
          <button
            type="submit"
            className="px-4 py-2.5 bg-[#00d4ff]/20 hover:bg-[#00d4ff]/40 border border-[#00d4ff] text-[#00d4ff] text-xs font-bold rounded transition-all shadow-[0_0_10px_rgba(0,212,255,0.3)] font-mono uppercase"
          >
            ОТПРАВИТЬ
          </button>
        </form>
      </div>

      {/* Bottom Right: Quick Test Directives */}
      <div className="absolute bottom-12 right-12 flex flex-col items-end space-y-1.5 pointer-events-auto">
        <div className="text-[9px] opacity-50 mb-0.5 font-mono uppercase">БЫСТРЫЕ КОМАНДЫ:</div>
        <button
          onClick={() => onExecuteCommand('Открой Chrome и найди информацию про искусственный интеллект')}
          className="text-[11px] px-2.5 py-1 border border-[#00d4ff]/30 bg-[#00d4ff]/5 hover:bg-[#00d4ff]/20 text-[#00d4ff] rounded transition-all"
        >
          «Chrome: поиск про ИИ»
        </button>
        <button
          onClick={() => onExecuteCommand('Открой Telegram')}
          className="text-[11px] px-2.5 py-1 border border-[#00d4ff]/30 bg-[#00d4ff]/5 hover:bg-[#00d4ff]/20 text-[#00d4ff] rounded transition-all"
        >
          «Открыть Telegram»
        </button>
        <button
          onClick={() => onExecuteCommand('Посмотри какие окна сейчас открыты')}
          className="text-[11px] px-2.5 py-1 border border-[#00d4ff]/30 bg-[#00d4ff]/5 hover:bg-[#00d4ff]/20 text-[#00d4ff] rounded transition-all"
        >
          «Посмотреть открытые окна»
        </button>
      </div>

      {/* Bottom Left: Keyboard Shortcuts */}
      <div className="absolute bottom-12 left-12 flex flex-col text-[10px] opacity-40 font-mono uppercase">
        <div>ГОЛОС: СКАЖИТЕ «JARVIS»</div>
        <div>[1] IDLE | [2] LISTENING | [3] THINKING</div>
        <div>[4] PLANNING | [5] EXECUTING | [SPACE] МЕНЮ</div>
      </div>
    </div>
  );
};
