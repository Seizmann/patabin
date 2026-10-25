import { forwardRef, type ReactNode } from 'react';
import { toBnDigits } from '@patabin/shared';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card overflow-hidden ${className}`}>{children}</div>;
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`skeleton ${className}`} />;
}

export function PageTitle({ tag, title, right }: { tag: string; title: string; right?: ReactNode }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="p-label">{tag}</p>
        <h1 className="p-display truncate">{title}</h1>
      </div>
      {right}
    </div>
  );
}

type FieldProps = { label: string; error?: string; children: ReactNode; className?: string };
export function Field({ label, error, children, className = '' }: FieldProps) {
  return (
    <label className={`block ${className}`}>
      <span className="p-caption mb-1 block font-semibold text-ink">{label}</span>
      {children}
      {error && <span className="p-caption mt-1 block text-bad">{error}</span>}
    </label>
  );
}

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'solid' | 'ghost'; busy?: boolean };
export const Btn = forwardRef<HTMLButtonElement, BtnProps>(function Btn({ variant = 'solid', busy, children, className = '', ...rest }, ref) {
  return (
    <button ref={ref} type={rest.type ?? 'button'} className={`btn btn-${variant} ${busy ? 'opacity-60' : ''} ${className}`} {...rest}>
      {busy ? toBnDigits('...') : children}
    </button>
  );
});

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'ok' | 'error'; children: ReactNode }) {
  const cls = tone === 'error' ? 'text-bad' : tone === 'ok' ? 'text-good' : 'text-ink-mute';
  return (
    <p className={`p-caption ${cls}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  );
}

export function Empty({ img, title, caption }: { img: string; title: string; caption?: string }) {
  return (
    <div className="card flex flex-col items-center px-8 py-10 text-center">
      <img src={img} alt="" className="h-40 w-auto object-contain" loading="lazy" />
      <p className="p-title mt-4">{title}</p>
      {caption && <p className="p-caption mt-1 max-w-xs">{caption}</p>}
    </div>
  );
}
