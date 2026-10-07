import { useCallback, useEffect, useState, type ReactNode } from 'react';
import ConfirmDialog, { type ConfirmOptions } from '../components/ui/ConfirmDialog';

const TOAST_DURATION_MS = 2600;

interface PendingConfirm extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

/**
 * 확인 모달과 안내 문구(토스트)를 띄우는 훅.
 * confirm()은 사용자가 고를 때까지 기다리는 Promise를 돌려주고, element를 화면 어딘가에 그려 두면 된다.
 */
export function useDialogs(): {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  notify: (message: string) => void;
  isConfirmOpen: boolean;
  element: ReactNode;
} {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => (
    new Promise<boolean>((resolve) => setPending({ ...options, resolve }))
  ), []);

  const notify = useCallback((message: string) => {
    setToast({ id: Date.now(), message });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const settle = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  const element = (
    <>
      {pending && (
        <ConfirmDialog
          title={pending.title}
          message={pending.message}
          confirmLabel={pending.confirmLabel}
          cancelLabel={pending.cancelLabel}
          danger={pending.danger}
          onConfirm={() => settle(true)}
          onCancel={() => settle(false)}
        />
      )}
      {toast && <div key={toast.id} className="toast" role="status">{toast.message}</div>}
    </>
  );

  return { confirm, notify, isConfirmOpen: pending !== null, element };
}
