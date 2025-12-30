import React from "react";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  text?: string;
  className?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = "md",
  text,
  className = "",
}) => {
  const sizeClasses = {
    sm: "w-4 h-4 border-2",
    md: "w-8 h-8 border-2",
    lg: "w-12 h-12 border-[3px]",
  };

  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 ${className}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div
        className={`${sizeClasses[size]} border-term-green border-t-transparent rounded-full animate-spin`}
        aria-hidden="true"
      />
      {text && (
        <p className="text-term-green text-sm font-mono animate-pulse">
          {text}
          <span className="animate-blink">_</span>
        </p>
      )}
      <span className="sr-only">Loading...</span>
    </div>
  );
};

interface ProgressBarProps {
  progress: number; // 0-100
  label?: string;
  showPercentage?: boolean;
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  label,
  showPercentage = true,
  className = "",
}) => {
  const clampedProgress = Math.min(Math.max(progress, 0), 100);

  return (
    <div
      className={`space-y-2 ${className}`}
      role="progressbar"
      aria-valuenow={clampedProgress}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {(label || showPercentage) && (
        <div className="flex justify-between items-center text-xs font-mono">
          {label && <span className="text-term-green">{label}</span>}
          {showPercentage && (
            <span className="text-term-green/70">{clampedProgress.toFixed(0)}%</span>
          )}
        </div>
      )}
      <div className="w-full h-2 bg-black border border-term-green/50 overflow-hidden">
        <div
          className="h-full bg-term-green transition-all duration-300 ease-out glow-border"
          style={{ width: `${clampedProgress}%` }}
        />
      </div>
    </div>
  );
};

interface LoadingOverlayProps {
  text?: string;
  progress?: number;
  showProgress?: boolean;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  text = "PROCESSING...",
  progress,
  showProgress = false,
}) => {
  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="loading-title"
    >
      <div className="bg-term-bg border-2 border-term-green p-8 max-w-md w-full mx-4 glow-border">
        <LoadingSpinner size="lg" />
        <h2
          id="loading-title"
          className="text-term-green text-center mt-4 font-mono text-lg font-bold"
        >
          {text}
        </h2>
        {showProgress && progress !== undefined && (
          <ProgressBar progress={progress} className="mt-4" />
        )}
      </div>
    </div>
  );
};

interface InlineLoaderProps {
  text?: string;
  className?: string;
}

export const InlineLoader: React.FC<InlineLoaderProps> = ({ text = "Loading", className = "" }) => {
  return (
    <span
      className={`inline-flex items-center gap-2 text-term-green font-mono ${className}`}
      role="status"
    >
      <span className="inline-block w-2 h-2 bg-term-green rounded-full animate-pulse" />
      <span className="inline-block w-2 h-2 bg-term-green rounded-full animate-pulse animation-delay-200" />
      <span className="inline-block w-2 h-2 bg-term-green rounded-full animate-pulse animation-delay-400" />
      <span className="ml-1">{text}</span>
      <span className="sr-only">Loading...</span>
    </span>
  );
};
