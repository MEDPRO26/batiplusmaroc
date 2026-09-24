"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { ConnectionBanner } from "@/features/shared/components/connection-banner";
import { joinClassNames } from "@/lib/utils";

type ToastTone = "success" | "error" | "info";

type Toast = {
  id: number;
  message: string;
  tone: ToastTone;
};

type ToastContextValue = {
  showToast: (message: string, tone?: ToastTone) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) {
    throw new Error("useToast must be used within AppFeedback");
  }
  return value;
}

export function AppFeedback({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, tone: ToastTone = "success") => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((current) => [...current.slice(-2), { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4200);
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      <ConnectionBanner />
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((toast) => (
          <p
            className={joinClassNames(
              "pointer-events-auto mb-0 max-w-md rounded-lg px-4 py-3 text-sm shadow-[0_10px_30px_rgb(23_61_99/0.12)]",
              toast.tone === "success"
                ? "bg-emerald-50 text-emerald-800"
                : toast.tone === "error"
                  ? "bg-red-50 text-red-700"
                  : "bg-white text-ink",
            )}
            key={toast.id}
            role="status"
          >
            {toast.message}
          </p>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
