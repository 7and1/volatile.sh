import React, { forwardRef } from "react";

interface TerminalButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger";
  isLoading?: boolean;
  loadingText?: string;
}

export const TerminalButton = forwardRef<HTMLButtonElement, TerminalButtonProps>(
  (
    {
      children,
      variant = "primary",
      isLoading,
      loadingText = "> EXECUTING...",
      className = "",
      disabled,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      "relative px-6 py-3 min-h-[44px] min-w-[120px] font-bold uppercase tracking-wider text-sm transition-all duration-100 ease-in-out border-2 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black btn-ripple disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation";

    const variants = {
      primary:
        "border-term-green text-term-bg bg-term-green hover:bg-term-green-dim hover:border-term-green-dim focus:ring-term-green disabled:hover:bg-term-green disabled:hover:border-term-green",
      secondary:
        "border-term-green text-term-green bg-transparent hover:bg-term-green/10 focus:ring-term-green hover:border-term-green-dim disabled:hover:bg-transparent disabled:hover:border-term-green",
      danger:
        "border-red-500 text-red-500 bg-transparent hover:bg-red-900/20 focus:ring-red-500 hover:text-red-400 hover:border-red-400 disabled:hover:bg-transparent disabled:hover:text-red-500 disabled:hover:border-red-500",
    };

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variants[variant]} ${isLoading ? "cursor-wait" : ""} ${className}`}
        disabled={disabled || isLoading}
        aria-busy={isLoading}
        {...props}
      >
        {isLoading ? loadingText : children}
      </button>
    );
  }
);

TerminalButton.displayName = "TerminalButton";
