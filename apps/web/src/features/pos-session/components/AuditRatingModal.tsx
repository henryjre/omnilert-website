import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Star } from 'lucide-react';
import { AnimatedModal } from '@/shared/components/ui/AnimatedModal';
import { Button } from '@/shared/components/ui/Button';
import { Spinner } from '@/shared/components/ui/Spinner';
import { api } from '@/shared/services/api.client';
import { useAppToast } from '@/shared/hooks/useAppToast';

interface AuditRatingModalProps {
  open: boolean;
  verificationId: string;
  onClose: () => void;
  onSaved: () => void;
}

export function AuditRatingModal({ open, verificationId, onClose, onSaved }: AuditRatingModalProps) {
  const { success: showSuccessToast, error: showErrorToast } = useAppToast();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [details, setDetails] = useState('');
  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
    if (rating === 0) return;
    setSaving(true);
    try {
      await api.post(`/pos-verifications/${verificationId}/audit`, {
        rating,
        details: details || undefined,
      });
      showSuccessToast('Audit rating submitted.');
      onSaved();
      onClose();
      setRating(0);
      setDetails('');
    } catch (err: any) {
      showErrorToast(err?.response?.data?.error || 'Failed to submit audit rating');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <AnimatedModal
          maxWidth="max-w-sm"
          zIndexClass="z-[60]"
          onBackdropClick={saving ? undefined : onClose}
        >
          <div className="p-6">
            <h3 className="mb-4 text-base font-semibold text-gray-900">Audit Rating</h3>

            {/* Star picker */}
            <div className="mb-4 flex items-center justify-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHover(star)}
                  onMouseLeave={() => setHover(0)}
                  className="focus:outline-none"
                >
                  <Star
                    className={`h-8 w-8 transition-colors ${
                      star <= (hover || rating)
                        ? 'fill-yellow-400 text-yellow-400'
                        : 'text-gray-300'
                    }`}
                  />
                </button>
              ))}
            </div>
            <p className="mb-3 text-center text-xs text-gray-400">
              {rating === 0 ? 'Select a rating' : `${rating} star${rating > 1 ? 's' : ''}`}
            </p>

            <textarea
              placeholder="Short details (optional)..."
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none resize-none"
            />

            <div className="mt-4 flex gap-3">
              <Button
                variant="secondary"
                onClick={onClose}
                className="flex-1"
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                variant="success"
                onClick={handleConfirm}
                className="flex-1"
                disabled={saving || rating === 0}
              >
                {saving ? <Spinner size="sm" /> : 'Confirm'}
              </Button>
            </div>
          </div>
        </AnimatedModal>
      )}
    </AnimatePresence>
  );
}
