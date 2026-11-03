import { useEffect } from 'react';
import { ShieldWarning } from '@phosphor-icons/react';
import { Btn } from 'components/ui/base';

export default function AccessDeniedPopup({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="access-denied-backdrop fixed inset-0 z-[60] grid place-items-center bg-black/40 p-6"
      onClick={onClose}
      role="alertdialog"
      aria-modal="true"
      aria-label="অনুমতি নেই"
    >
      <div
        className="card access-denied-card flex w-full max-w-xs flex-col items-center gap-2 p-6 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="grid h-12 w-12 place-items-center rounded-full bg-bad/10 text-bad">
          <ShieldWarning weight="fill" size={26} />
        </span>
        <p className="p-title">অনুমতি নেই</p>
        <p className="p-caption">এই কাজের অনুমতি আপনার নেই — ইনভেস্টর অ্যাকাউন্ট শুধু হিসাব দেখার জন্য।</p>
        <Btn className="mt-2" onClick={onClose}>
          ঠিক আছে
        </Btn>
      </div>
    </div>
  );
}
