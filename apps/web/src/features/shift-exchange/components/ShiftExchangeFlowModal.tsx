import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/shared/components/ui/Button';
import { Spinner } from '@/shared/components/ui/Spinner';
import { api } from '@/shared/services/api.client';
import { X } from 'lucide-react';

type ShiftExchangeOption = {
  company_id: string;
  company_name: string;
  branch_id: string;
  branch_name: string | null;
  shift_id: string;
  user_id: string;
  employee_name: string;
  duty_type: string | null;
  shift_start: string;
  shift_end: string;
  allocated_hours: string | number | null;
};

type FromShift = {
  id: string;
  shift_start: string;
  shift_end: string;
  duty_type?: string | null;
  branch_name?: string | null;
};

interface ShiftExchangeFlowModalProps {
  isOpen: boolean;
  fromShift: FromShift | null;
  onClose: () => void;
  onCreated?: () => void;
}

function fmtShift(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function ShiftExchangeFlowModal({
  isOpen,
  fromShift,
  onClose,
  onCreated,
}: ShiftExchangeFlowModalProps) {
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [options, setOptions] = useState<ShiftExchangeOption[]>([]);
  const [selectedOption, setSelectedOption] = useState<ShiftExchangeOption | null>(null);
  const [step, setStep] = useState<'select' | 'confirm'>('select');

  useEffect(() => {
    if (!isOpen || !fromShift?.id) return;
    setLoading(true);
    setError('');
    setOptions([]);
    setSelectedOption(null);
    setStep('select');

    api
      .get('/shift-exchanges/options', { params: { fromShiftId: fromShift.id } })
      .then((res) => {
        setOptions(res.data.data?.options ?? []);
      })
      .catch((err) => {
        setError(err?.response?.data?.error || err?.response?.data?.message || 'Failed to load exchange options');
      })
      .finally(() => setLoading(false));
  }, [isOpen, fromShift?.id]);

  const isConfirmDisabled = useMemo(() => creating || !selectedOption, [creating, selectedOption]);

  async function handleConfirm() {
    if (!fromShift || !selectedOption) return;
    setCreating(true);
    setError('');
    try {
      await api.post('/shift-exchanges', {
        fromShiftId: fromShift.id,
        toShiftId: selectedOption.shift_id,
        toCompanyId: selectedOption.company_id,
      });
      onCreated?.();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.response?.data?.message || 'Failed to create shift exchange request');
    } finally {
      setCreating(false);
    }
  }

  if (!isOpen || !fromShift) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <p className="text-base font-semibold text-gray-900">Exchange Shift</p>
            <p className="text-xs text-gray-500">
              {fromShift.branch_name || 'Unknown Branch'} · {fmtShift(fromShift.shift_start)} - {fmtShift(fromShift.shift_end)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
          {error && (
            <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}

          {loading ? (
            <div className="flex justify-center py-10">
              <Spinner size="lg" />
            </div>
          ) : step === 'select' ? (
            options.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500">
                No eligible open shifts available for exchange.
              </p>
            ) : (
              <div className="space-y-3">
                {options.map((option) => (
                  <button
                    key={`${option.company_id}:${option.shift_id}`}
                    type="button"
                    onClick={() => setSelectedOption(option)}
                    className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
                      selectedOption?.shift_id === option.shift_id && selectedOption?.company_id === option.company_id
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{option.employee_name}</p>
                        <p className="text-xs text-gray-500">
                          {option.company_name} · {option.branch_name || 'Unknown Branch'}
                        </p>
                      </div>
                      {option.duty_type && (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                          {option.duty_type}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-gray-600">
                      {fmtShift(option.shift_start)} - {fmtShift(option.shift_end)}
                    </p>
                  </button>
                ))}
              </div>
            )
          ) : (
            <div className="space-y-2 py-2">
              <p className="text-sm text-gray-700">
                Confirm exchange request with <span className="font-semibold">{selectedOption?.employee_name}</span>?
              </p>
              {selectedOption && (
                <p className="text-xs text-gray-500">
                  Target shift: {selectedOption.company_name} · {selectedOption.branch_name || 'Unknown Branch'} · {fmtShift(selectedOption.shift_start)} - {fmtShift(selectedOption.shift_end)}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-3 border-t border-gray-200 px-5 py-4">
          {step === 'select' ? (
            <>
              <Button className="flex-1" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                disabled={!selectedOption}
                onClick={() => setStep('confirm')}
              >
                Continue
              </Button>
            </>
          ) : (
            <>
              <Button
                className="flex-1"
                variant="secondary"
                disabled={creating}
                onClick={() => setStep('select')}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                disabled={isConfirmDisabled}
                onClick={handleConfirm}
              >
                {creating ? 'Confirming...' : 'Confirm'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
