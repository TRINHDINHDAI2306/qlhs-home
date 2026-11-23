import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { errorMessage } from './lib/format';

interface Ui {
  toast(message: string, error?: boolean): void;
  /** Bật thanh loading, báo lỗi bằng toast. Trả về undefined nếu lỗi. */
  run<T>(promise: Promise<T>): Promise<T | undefined>;
}

const UiContext = createContext<Ui | null>(null);

export function useUi(): Ui {
  const ui = useContext(UiContext);
  if (!ui) throw new Error('useUi phải nằm trong <UiProvider>');
  return ui;
}

export function UiProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState(0);
  const [toastState, setToastState] = useState<{ msg: string; error: boolean; show: boolean }>({ msg: '', error: false, show: false });
  const timer = useRef<number | undefined>(undefined);

  const toast = useCallback((msg: string, error = false) => {
    setToastState({ msg, error, show: true });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToastState(t => ({ ...t, show: false })), 2800);
  }, []);

  const run = useCallback(async <T,>(promise: Promise<T>): Promise<T | undefined> => {
    setPending(n => n + 1);
    try {
      return await promise;
    } catch (e) {
      toast(errorMessage(e), true);
      return undefined;
    } finally {
      setPending(n => n - 1);
    }
  }, [toast]);

  return (
    <UiContext.Provider value={{ toast, run }}>
      <div className={`loading ${pending > 0 ? 'on' : 'done'}`} />
      {children}
      <div className={`toast ${toastState.show ? 'show' : ''} ${toastState.error ? 'err' : ''}`} role="status">
        {toastState.msg}
      </div>
    </UiContext.Provider>
  );
}
