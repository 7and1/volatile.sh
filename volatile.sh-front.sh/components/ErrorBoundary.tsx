import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
    // Reload the page to reset the application state
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-term-bg text-term-green font-mono p-4 sm:p-8 flex flex-col items-center justify-center">
          <div className="w-full max-w-3xl border-2 border-red-500 bg-red-900/10 p-8 glow-border shadow-red-500/20">
            <div className="flex items-center gap-3 mb-6 text-red-500">
              <AlertCircle className="w-12 h-12" aria-hidden="true" />
              <h1 className="text-3xl font-bold glow-text">SYSTEM ERROR</h1>
            </div>

            <div className="space-y-4 mb-6">
              <p className="text-red-400">&gt; An unexpected error occurred in the application.</p>
              <p className="text-red-400 text-sm">
                &gt; The error has been logged. Please try refreshing the page.
              </p>

              {this.state.error && (
                <details className="mt-4 border border-red-500/30 p-4 bg-black">
                  <summary className="cursor-pointer text-red-500 font-bold mb-2">
                    Error Details (Technical)
                  </summary>
                  <pre className="text-xs text-red-400 overflow-auto max-h-40">
                    {this.state.error.toString()}
                    {this.state.errorInfo && this.state.errorInfo.componentStack}
                  </pre>
                </details>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={this.handleReset}
                className="flex items-center justify-center gap-2 px-6 py-3 min-h-[44px] border-2 border-term-green bg-term-green text-black font-bold uppercase tracking-wider hover:bg-term-green-dim transition-colors focus:outline-none focus:ring-2 focus:ring-term-green"
                aria-label="Reload the application"
              >
                <RefreshCw size={20} aria-hidden="true" />
                RELOAD_APPLICATION
              </button>
              <a
                href="/"
                className="flex items-center justify-center px-6 py-3 min-h-[44px] border-2 border-term-green text-term-green font-bold uppercase tracking-wider hover:bg-term-green/10 transition-colors focus:outline-none focus:ring-2 focus:ring-term-green"
                aria-label="Return to home page"
              >
                [ RETURN_TO_HOME ]
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
