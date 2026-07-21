/** 둥근 라인 아이콘 세트 (stroke 기반, round cap/join) */
type IconProps = { className?: string };

const base = 'icon';

export function IconLine({ className = '' }: IconProps) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <line x1="4" y1="20" x2="20" y2="4" />
      <circle cx="4" cy="20" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="20" cy="4" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconCircle({ className = '' }: IconProps) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconLayers({ className = '' }: IconProps) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <polygon points="12,3 21,8 12,13 3,8" />
      <polyline points="3,12 12,17 21,12" />
      <polyline points="3,16 12,21 21,16" />
    </svg>
  );
}

export function IconBook({ className = '' }: IconProps) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <path d="M4 5a2 2 0 0 1 2-2h5v18H6a2 2 0 0 1-2-2V5z" />
      <path d="M20 5a2 2 0 0 0-2-2h-5v18h5a2 2 0 0 0 2-2V5z" />
    </svg>
  );
}

export function IconUser({ className = '' }: IconProps) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-7 8-7s8 3 8 7" />
    </svg>
  );
}

export function IconLogOut({ className = '' }: IconProps) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16,17 21,12 16,7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

export function IconEye({ className = '' }: IconProps) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function IconEyeOff({ className = '' }: IconProps) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <path d="M3 3l18 18" />
      <path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c6 0 10 7 10 7a17.9 17.9 0 0 1-3.2 4.1M6.5 6.6C4 8.3 2 12 2 12s4 7 10 7a10 10 0 0 0 4.2-.9" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}

export function IconCheck({ className = '' }: IconProps) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <polyline points="4,13 9,18 20,6" />
    </svg>
  );
}

export function IconPencil({ className = '' }: IconProps) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  );
}

export function IconTrash({ className = '' }: IconProps) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <polyline points="3,6 5,6 21,6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

export function IconPlus({ className = '' }: IconProps) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export function IconCopy({ className = '' }: IconProps) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </svg>
  );
}

export function IconClipboard({ className = '' }: IconProps) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <rect x="4" y="5" width="16" height="16" rx="2" />
      <path d="M9 5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" />
      <line x1="9" y1="11" x2="15" y2="11" />
      <line x1="9" y1="15" x2="15" y2="15" />
    </svg>
  );
}

export function IconX({ className = '' }: IconProps) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <line x1="5" y1="5" x2="19" y2="19" />
      <line x1="19" y1="5" x2="5" y2="19" />
    </svg>
  );
}

export function IconZoomIn({ className = '' }: IconProps) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <circle cx="10" cy="10" r="7" />
      <line x1="15.5" y1="15.5" x2="21" y2="21" />
      <line x1="10" y1="7" x2="10" y2="13" />
      <line x1="7" y1="10" x2="13" y2="10" />
    </svg>
  );
}

export function IconZoomOut({ className = '' }: IconProps) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <circle cx="10" cy="10" r="7" />
      <line x1="15.5" y1="15.5" x2="21" y2="21" />
      <line x1="7" y1="10" x2="13" y2="10" />
    </svg>
  );
}

export function IconFit({ className = '' }: IconProps) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <path d="M4 9V5a1 1 0 0 1 1-1h4" />
      <path d="M15 4h4a1 1 0 0 1 1 1v4" />
      <path d="M20 15v4a1 1 0 0 1-1 1h-4" />
      <path d="M9 20H5a1 1 0 0 1-1-1v-4" />
    </svg>
  );
}

export function IconUndo({ className = '' }: IconProps) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <path d="M8 8H4V4" />
      <path d="M4 8a9 9 0 1 1 2.6 8.4" />
    </svg>
  );
}

export function IconText({ className = '' }: IconProps) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="14" y2="18" />
    </svg>
  );
}

export function IconChevronUp({ className = '' }: IconProps) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <polyline points="5,15 12,8 19,15" />
    </svg>
  );
}

export function IconMerge({ className = '' }: IconProps) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <path d="M8 3v6a3 3 0 0 0 3 3h2a3 3 0 0 0 3-3V3" />
      <path d="M12 12v9" />
      <polyline points="9,18 12,21 15,18" />
    </svg>
  );
}
