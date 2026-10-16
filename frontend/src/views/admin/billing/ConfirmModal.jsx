import { useState } from 'react';
import { Modal, ActionButton } from '../../../components/Shared';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';

/**
 * ConfirmModal — dialog konfirmasi generik untuk aksi koreksi/void/tolak
 * pembayaran & tagihan, sekaligus konfirmasi "buang perubahan" ketika modal
 * input ditutup dengan isian yang belum disimpan.
 *
 * State input dipegang lokal agar `confirmAction` global tidak ikut bermutasi;
 * komponen ini memanggil `action.onSubmit(values)` lalu ditutup oleh pemanggil.
 * Opsi tampilan: `action.message`, `action.confirmLabel`, `action.confirmVariant`.
 */
export function ConfirmModal({ action, onClose }) {
  const [values, setValues] = useState(() => Object.fromEntries((action?.fields || []).map((f) => [f.key, f.value])));

  if (!action) return null;

  const confirmVariant = action.confirmVariant || 'primary';
  const ConfirmIcon = action.confirmIcon || (confirmVariant === 'danger' ? AlertTriangle : CheckCircle2);

  return (
    <Modal title={action.title} onClose={onClose}>
      <div className="space-y-3.5">
        {action.message && <p className="text-sm leading-relaxed text-slate-600">{action.message}</p>}
        {(action.fields || []).map((f) => (
          <div key={f.key}>
            <div className="label">{f.label}</div>
            <input
              value={values[f.key] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              className="input w-full"
            />
          </div>
        ))}
        <div className="flex gap-2">
          <ActionButton icon={ConfirmIcon} variant={confirmVariant} onClick={() => action.onSubmit(values)}>
            {action.confirmLabel || 'Konfirmasi'}
          </ActionButton>
          <ActionButton icon={X} onClick={onClose} variant="secondary">
            Batal
          </ActionButton>
        </div>
      </div>
    </Modal>
  );
}
