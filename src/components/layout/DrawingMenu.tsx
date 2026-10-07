import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import Button from '../ui/Button';
import { IconDownload, IconFile, IconFolderOpen, IconPlus } from '../ui/Icon';
import { DRAWING_FILE_EXTENSION } from '../../utils/storage';
import './DrawingMenu.css';

interface DrawingMenuProps {
  name: string;
  onRename: (name: string) => void;
  onNewDrawing: () => void;
  onSaveFile: () => void;
  onLoadFile: (file: File) => void;
  /** 브라우저 자동 저장이 실패한 상태 (저장 공간 부족 등) */
  saveFailed: boolean;
}

/** 헤더의 도면 메뉴 — 도면 이름, 새 도면, 파일로 저장/불러오기 */
export default function DrawingMenu({ name, onRename, onNewDrawing, onSaveFile, onLoadFile, saveFailed }: DrawingMenuProps) {
  const [open, setOpen] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const rootRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const toggle = () => {
    // 열 때마다 현재 이름으로 다시 채운다 (파일을 불러와 이름이 바뀌었을 수 있다)
    if (!open) setDraftName(name);
    setOpen((prev) => !prev);
  };

  const commitName = () => {
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== name) onRename(trimmed);
    else setDraftName(name);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // 같은 파일을 연달아 다시 고를 수 있도록 값을 비운다
    e.target.value = '';
    if (!file) return;
    setOpen(false);
    onLoadFile(file);
  };

  const run = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <div className="drawing-menu" ref={rootRef}>
      <Button variant="ghost" size="sm" icon={<IconFile />} onClick={toggle} aria-haspopup="true" aria-expanded={open} aria-label={`도면 메뉴 (${name})`} className="drawing-menu-trigger">
        <span className="header-btn-label drawing-menu-name">{name}</span>
      </Button>

      {open && (
        <div className="drawing-menu-popover">
          <div className="field">
            <label htmlFor="drawing-name">도면 이름</label>
            <input
              id="drawing-name"
              type="text"
              maxLength={40}
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            />
          </div>

          <div className="drawing-menu-items">
            <button type="button" className="drawing-menu-item" onClick={() => run(onNewDrawing)}>
              <IconPlus /> 새 도면
            </button>
            <button type="button" className="drawing-menu-item" onClick={() => run(onSaveFile)}>
              <IconDownload /> 파일로 저장
            </button>
            <button type="button" className="drawing-menu-item" onClick={() => fileInputRef.current?.click()}>
              <IconFolderOpen /> 파일 불러오기
            </button>
          </div>

          <p className={`drawing-menu-note ${saveFailed ? 'is-error' : ''}`}>
            {saveFailed
              ? '이 브라우저에 자동 저장하지 못했어요. 파일로 저장해 두세요.'
              : '바꾼 내용은 이 브라우저에 자동 저장돼요.'}
          </p>

          <input ref={fileInputRef} type="file" accept={`${DRAWING_FILE_EXTENSION},.json,application/json`} className="drawing-menu-file" onChange={handleFileChange} />
        </div>
      )}
    </div>
  );
}
