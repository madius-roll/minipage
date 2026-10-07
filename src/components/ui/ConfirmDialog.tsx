import { useEffect, useRef } from 'react';
import Button from './Button';
import './ConfirmDialog.css';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  /** 삭제처럼 되돌리기 번거로운 동작이면 확인 버튼을 경고색으로 보여준다 */
  danger?: boolean;
}

interface ConfirmDialogProps extends ConfirmOptions {
  onConfirm: () => void;
  onCancel: () => void;
}

/** 브라우저 기본 confirm 창을 대신하는 확인 모달 — Enter로 확인, Esc·바깥 클릭으로 취소 */
export default function ConfirmDialog({ title, message, confirmLabel = '확인', danger = false, onConfirm, onCancel }: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onCancel();
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onCancel]);

  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message" onClick={(e) => e.stopPropagation()}>
        <h2 id="confirm-title" className="confirm-title">{title}</h2>
        <p id="confirm-message" className="confirm-message">{message}</p>
        <div className="confirm-actions">
          <Button size="sm" variant="ghost" onClick={onCancel}>취소</Button>
          <Button ref={confirmRef} size="sm" className={danger ? 'confirm-danger' : ''} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}
