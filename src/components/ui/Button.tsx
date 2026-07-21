import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost';
  active?: boolean;
  size?: 'md' | 'sm';
  icon?: ReactNode;
}

export default function Button({
  variant = 'primary',
  active = false,
  size = 'md',
  icon,
  children,
  className = '',
  ...rest
}: ButtonProps) {
  const cls = [
    'btn',
    size === 'sm' ? 'btn-sm' : '',
    variant === 'ghost' ? 'btn-ghost' : '',
    active ? 'btn-active' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button className={cls} {...rest}>
      {icon}
      {children}
    </button>
  );
}
