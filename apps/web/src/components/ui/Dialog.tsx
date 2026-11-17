import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type ConfirmOptions = { title: string; message?: string; destructive?: boolean; confirmText?: string; cancelText?: string };
export type PromptOptions = { title: string; message?: string; defaultValue?: string; placeholder?: string; inputType?: 'text' | 'password' | 'number'; confirmText?: string; cancelText?: string };
export type AlertOptions = { title: string; message?: string; confirmText?: string };

export type DialogApi = {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  prompt: (opts: PromptOptions) => Promise<string | null>;
  alert: (opts: AlertOptions) => Promise<void>;
};

type Request =
  | { kind: 'confirm'; id: number; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: 'prompt'; id: number; opts: PromptOptions; resolve: (v: string | null) => void }
  | { kind: 'alert'; id: number; opts: AlertOptions; resolve: () => void };

const DialogContext = createContext<DialogApi | null>(null);

export function useDialog(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used within DialogProvider');
  return ctx;
}

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<Request[]>([]);
  const [closing, setClosing] = useState(false);
  const nextId = useRef(0);
  const current = queue[0];

  const api = useMemo<DialogApi>(
    () => ({
      confirm: (opts) =>
        new Promise<boolean>((resolve) => {
          setQueue((q) => [...q, { kind: 'confirm', id: nextId.current++, opts, resolve }]);
        }),
      prompt: (opts) =>
        new Promise<string | null>((resolve) => {
          setQueue((q) => [...q, { kind: 'prompt', id: nextId.current++, opts, resolve }]);
        }),
      alert: (opts) =>
        new Promise<void>((resolve) => {
          setQueue((q) => [...q, { kind: 'alert', id: nextId.current++, opts, resolve }]);
        }),
    }),
    [],
  );

  const finish = useCallback(
    (result: boolean | string | null | undefined) => {
      if (!current || closing) return;
      setClosing(true);
      window.setTimeout(() => {
        if (current.kind === 'confirm') current.resolve(Boolean(result));
        else if (current.kind === 'prompt') current.resolve(typeof result === 'string' ? result : null);
        else current.resolve();
        setQueue((q) => q.slice(1));
        setClosing(false);
      }, 150);
    },
    [current, closing],
  );

  const cancel = useCallback(() => {
    if (!current) return;
    finish(current.kind === 'confirm' ? false : current.kind === 'prompt' ? null : undefined);
  }, [current, finish]);

  const accept = useCallback(
    (value?: string) => {
      if (!current) return;
      finish(current.kind === 'confirm' ? true : current.kind === 'prompt' ? (value ?? '') : undefined);
    },
    [current, finish],
  );

  useEffect(() => {
    if (!current || closing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [current, closing, cancel]);

  return (
    <DialogContext.Provider value={api}>
      {children}
      {current &&
        createPortal(
          <div
            key={current.id}
            className={`fixed inset-0 z-[60] grid place-items-center bg-black/40 p-6 ${closing ? 'dialog-backdrop-out' : 'dialog-backdrop'}`}
            onClick={cancel}
            role="presentation"
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={current.opts.title}
              className={`card w-full max-w-xs overflow-hidden ${closing ? 'dialog-card-out' : 'dialog-card'}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-5 pb-4 pt-5 text-center">
                <p className="p-title">{current.opts.title}</p>
                {current.opts.message ? <p className="p-caption mt-1.5">{current.opts.message}</p> : null}
                {current.kind === 'prompt' && (
                  <PromptInput
                    key={current.id}
                    opts={current.opts}
                    disabled={closing}
                    onSubmit={(v) => accept(v)}
                  />
                )}
              </div>
              <div className="flex flex-col border-t border-hairline">
                {current.kind !== 'alert' && (
                  <button type="button" className="dialog-btn" onClick={cancel}>
                    {current.opts.cancelText ?? 'বাতিল'}
                  </button>
                )}
                <button
                  type="button"
                  autoFocus
                  className={`dialog-btn border-t border-hairline ${current.kind === 'confirm' && current.opts.destructive ? 'dialog-btn-danger' : ''}`}
                  onClick={() => {
                    if (current.kind === 'prompt') {
                      const input = document.getElementById('dialog-prompt-input') as HTMLInputElement | null;
                      accept(input?.value ?? current.opts.defaultValue ?? '');
                    } else {
                      accept();
                    }
                  }}
                >
                  {current.opts.confirmText ?? (current.kind === 'alert' ? 'ঠিক আছে' : 'নিশ্চিত')}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </DialogContext.Provider>
  );
}

function PromptInput({ opts, disabled, onSubmit }: { opts: PromptOptions; disabled: boolean; onSubmit: (v: string) => void }) {
  const [value, setValue] = useState(opts.defaultValue ?? '');
  return (
    <input
      id="dialog-prompt-input"
      type={opts.inputType ?? 'text'}
      className="field mt-3 text-center"
      placeholder={opts.placeholder}
      value={value}
      disabled={disabled}
      autoFocus
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onSubmit(value);
        }
      }}
    />
  );
}
