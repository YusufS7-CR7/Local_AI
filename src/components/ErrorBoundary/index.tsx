import { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    console.error('[JARVIS ErrorBoundary] Caught subsystem exception:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  handleReload = () => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="relative w-full h-full min-h-[300px] flex items-center justify-center p-6 bg-[#0a0512]/90 border border-red-500/40 rounded-lg text-white font-mono select-none overflow-hidden">
          {/* Subtle background tech grid */}
          <div 
            className="absolute inset-0 opacity-[0.05] pointer-events-none"
            style={{
              backgroundImage: `
                linear-gradient(rgba(239, 68, 68, 1) 1px, transparent 1px),
                linear-gradient(90deg, rgba(239, 68, 68, 1) 1px, transparent 1px)
              `,
              backgroundSize: '30px 30px'
            }}
          />

          <div className="relative z-10 max-w-lg w-full bg-[#140810]/95 border border-red-500/60 p-6 rounded-lg shadow-[0_0_40px_rgba(239,68,68,0.35)] space-y-4">
            {/* Header */}
            <div className="flex items-center space-x-3 border-b border-red-500/30 pb-3">
              <span className="text-2xl animate-pulse">⚠️</span>
              <div>
                <h3 className="text-sm font-bold tracking-widest text-red-400 uppercase">
                  {this.props.fallbackTitle || 'JARVIS SUBSYSTEM EXCEPTION'}
                </h3>
                <p className="text-[10px] text-red-300/70 uppercase">
                  {this.props.fallbackMessage || 'CRITICAL FAILURE IN GRAPHICS/INTERFACE CONTEXT'}
                </p>
              </div>
            </div>

            {/* Error Message */}
            <div className="bg-black/60 border border-red-500/30 rounded p-3 text-xs space-y-2">
              <div className="text-red-300 font-bold break-words">
                {this.state.error?.name || 'Error'}: {this.state.error?.message || 'Unknown runtime anomaly'}
              </div>

              {this.state.errorInfo?.componentStack && (
                <details className="mt-2 text-[10px] text-gray-400 font-mono">
                  <summary className="cursor-pointer text-red-400 hover:underline uppercase">
                    Показать стек компонентов
                  </summary>
                  <pre className="mt-1 p-2 bg-black/80 rounded max-h-36 overflow-auto text-[9px] text-gray-300 leading-tight">
                    {this.state.errorInfo.componentStack}
                  </pre>
                </details>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center space-x-3 pt-2">
              <button
                onClick={this.handleReset}
                className="flex-1 py-2 px-3 bg-red-600/30 hover:bg-red-600/50 border border-red-500 text-red-200 text-xs font-bold rounded uppercase tracking-wider transition-all shadow-[0_0_10px_rgba(239,68,68,0.3)]"
              >
                ПЕРЕЗАПУСТИТЬ БЛОК
              </button>
              <button
                onClick={this.handleReload}
                className="flex-1 py-2 px-3 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-200 text-xs font-bold rounded uppercase tracking-wider transition-all"
              >
                ПЕРЕЗАГРУЗИТЬ СИСТЕМУ
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
