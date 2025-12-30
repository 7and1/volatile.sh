import React, { createContext, useContext, useState, useCallback } from "react";
import { AlertCircle, CheckCircle, Info, AlertTriangle, X } from "lucide-react";

export type ToastType = "success" | "error" | "info" | "warning";

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastContextType {
  toasts: Toast[];
  showToast: (type: ToastType, message: string, duration?: number) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (type: ToastType, message: string, duration = 6000) => {
      const id = `${Date.now()}-${Math.random()}`;
      const toast: Toast = { id, type, message, duration };

      setToasts((prev) => [...prev, toast]);

      if (duration > 0) {
        setTimeout(() => removeToast(id), duration);
      }
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ toasts, showToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
};

interface ToastContainerProps {
  toasts: Toast[];
  onRemove: (id: string) => void;
}

const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onRemove }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-4 left-4 right-4 sm:left-auto sm:right-4 sm:top-4 z-50 space-y-2 max-w-sm sm:max-w-sm w-full sm:w-auto pointer-events-none"
      role="region"
      aria-label="Notifications"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  );
};

interface ToastItemProps {
  toast: Toast;
  onRemove: (id: string) => void;
}

const ToastItem: React.FC<ToastItemProps> = ({ toast, onRemove }) => {
  const getToastStyles = (type: ToastType) => {
    switch (type) {
      case "success":
        return {
          bg: "bg-term-green/20 border-term-green",
          text: "text-term-green",
          icon: CheckCircle,
        };
      case "error":
        return {
          bg: "bg-red-500/20 border-red-500",
          text: "text-red-500",
          icon: AlertCircle,
        };
      case "warning":
        return {
          bg: "bg-yellow-500/20 border-yellow-500",
          text: "text-yellow-500",
          icon: AlertTriangle,
        };
      case "info":
        return {
          bg: "bg-blue-500/20 border-blue-500",
          text: "text-blue-500",
          icon: Info,
        };
    }
  };

  const { bg, text, icon: Icon } = getToastStyles(toast.type);

  // Handle keyboard dismiss
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onRemove(toast.id);
    }
  };

  return (
    <div
      className={`${bg} ${text} border-2 p-4 font-mono text-sm shadow-lg animate-slide-in-right pointer-events-auto glow-border backdrop-blur-sm`}
      role="alert"
      aria-atomic="true"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-start gap-3">
        <Icon className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
        <p className="flex-1 break-words">{toast.message}</p>
        <button
          onClick={() => onRemove(toast.id)}
          className="shrink-0 hover:opacity-70 transition-opacity focus:outline-none focus:ring-2 focus:ring-current rounded"
          aria-label="Dismiss notification"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};
