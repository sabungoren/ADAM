import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { ToastItem, ToastType, ModalOptions } from '../types';

interface AlertContextType {
  toasts: ToastItem[];
  showToast: (message: string, type?: ToastType, title?: string, duration?: number) => string;
  removeToast: (id: string) => void;
  modal: ModalOptions | null;
  showModal: (options: ModalOptions) => void;
  closeModal: () => void;
  toast: {
    success: (message: string, title?: string) => string;
    warning: (message: string, title?: string) => string;
    error: (message: string, title?: string) => string;
    info: (message: string, title?: string) => string;
  };
}

const defaultToastHelpers = {
  success: () => '',
  warning: () => '',
  error: () => '',
  info: () => '',
};

const AlertContext = createContext<AlertContextType>({
  toasts: [],
  showToast: () => '',
  removeToast: () => {},
  modal: null,
  showModal: () => {},
  closeModal: () => {},
  toast: defaultToastHelpers,
});

export const AlertProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [modal, setModal] = useState<ModalOptions | null>(null);

  // High-tech luxury audio chime using Web Audio API (zero external assets, crisp & subtle)
  const playChime = useCallback((type: ToastType) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      if (type === 'error' || type === 'warning') {
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(220, now + 0.16);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.start(now);
        osc.stop(now + 0.2);
      } else {
        osc.frequency.setValueAtTime(540, now);
        osc.frequency.exponentialRampToValueAtTime(820, now + 0.12);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.start(now);
        osc.stop(now + 0.2);
      }
    } catch {
      // Audio not permitted, ignore
    }
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', title = '', duration = 4000) => {
      const id = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
      playChime(type);
      setToasts((prev) => [...prev, { id, message, type, title, duration }]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
      return id;
    },
    [playChime]
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showModal = useCallback(
    (options: ModalOptions) => {
      playChime(options.type || 'info');
      setModal(options);
    },
    [playChime]
  );

  const closeModal = useCallback(() => {
    setModal(null);
  }, []);

  const toast = {
    success: useCallback((message: string, title?: string) => showToast(message, 'success', title), [showToast]),
    warning: useCallback((message: string, title?: string) => showToast(message, 'warning', title), [showToast]),
    error: useCallback((message: string, title?: string) => showToast(message, 'error', title), [showToast]),
    info: useCallback((message: string, title?: string) => showToast(message, 'info', title), [showToast]),
  };

  return (
    <AlertContext.Provider
      value={{ showToast, removeToast, toasts, showModal, closeModal, modal, toast }}
    >
      {children}
    </AlertContext.Provider>
  );
};

export const useAlert = () => useContext(AlertContext);
