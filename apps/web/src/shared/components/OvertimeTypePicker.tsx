import { useRef, useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Clock } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface PickerOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

interface GenericPickerProps {
  label: string;
  value: string | number;
  options: PickerOption[];
  onChange: (val: any) => void;
  Icon: LucideIcon;
  placeholder?: string;
  disabled?: boolean;
}

function GenericPicker({
  label,
  value,
  options,
  onChange,
  Icon,
  placeholder = 'Select...',
  disabled = false,
}: GenericPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={ref} className="relative flex-1">
      <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
        {label}
      </label>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`group flex w-full items-center gap-2.5 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary-200 ${
          disabled
            ? 'opacity-50 grayscale cursor-not-allowed bg-gray-50'
            : 'hover:border-primary-200 hover:bg-primary-50/30'
        }`}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
          <Icon className="h-4 w-4" />
        </span>
        <span className={`min-w-0 flex-1 truncate text-sm font-medium ${selected && !disabled ? 'text-gray-800' : 'text-gray-400'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence>
        {open && !disabled && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15, ease: [0.2, 0, 0, 1] }}
            className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 max-h-60 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl scrollbar-thin scrollbar-thumb-gray-200"
          >
            <div className="p-2 space-y-0.5">
              {options.map((opt) => {
                const isSelected = value === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={opt.disabled}
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-150 ${
                      isSelected ? 'bg-primary-50' : opt.disabled ? 'opacity-40 grayscale cursor-not-allowed' : 'hover:bg-gray-50'
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md transition-colors duration-150 ${
                        isSelected
                          ? 'bg-primary-600 text-white'
                          : 'border border-gray-300 bg-white text-transparent'
                      }`}
                    >
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                    <span className={`min-w-0 flex-1 truncate text-sm font-medium ${isSelected ? 'text-primary-700' : 'text-gray-700'}`}>
                      {opt.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface OvertimeTypePickerProps {
  value: string;
  onChange: (val: string) => void;
  hours: number;
  setHours: (val: number) => void;
  minutes: number;
  setMinutes: (val: number) => void;
  maxMinutes?: number;
}

export function OvertimeTypePicker({
  value,
  onChange,
  hours,
  setHours,
  minutes,
  setMinutes,
  maxMinutes = 1440,
}: OvertimeTypePickerProps) {
  // If actual overtime is less than 60 mins, disable hour dropdown
  const hourDisabled = maxMinutes < 60;

  const typeOptions = [
    { value: 'normal_overtime', label: 'Normal Overtime' },
    { value: 'overtime_premium', label: 'Overtime Premium' },
  ];

  const hourOptions = Array.from({ length: 24 }).map((_, i) => ({
    value: i,
    label: `${i} hour${i !== 1 ? 's' : ''}`,
    disabled: i * 60 > maxMinutes,
  }));

  const minuteOptions = Array.from({ length: 60 }).map((_, i) => ({
    value: i,
    label: `${i} minute${i !== 1 ? 's' : ''}`,
    // If maxMinutes < 60, disable minutes greater than maxMinutes
    disabled: (0 * 60) + i > maxMinutes,
  }));

  const handleHourChange = (newHour: number) => {
    const totalWithCurrentMin = (newHour * 60) + minutes;
    if (totalWithCurrentMin > maxMinutes) {
      // If result is > actual, select only the actual overtime hour and minute
      setHours(Math.floor(maxMinutes / 60));
      setMinutes(maxMinutes % 60);
    } else {
      setHours(newHour);
    }
  };

  const handleMinuteChange = (newMin: number) => {
    const totalWithCurrentHour = (hours * 60) + newMin;
    if (totalWithCurrentHour > maxMinutes) {
      // If result is > actual, unselect hour (set to 0)
      setHours(0);
      setMinutes(newMin);
    } else {
      setMinutes(newMin);
    }
  };

  const durationText = (() => {
    const hText = hours > 0 ? `${hours} hour${hours !== 1 ? 's' : ''}` : '';
    const mText = minutes > 0 ? `${minutes} minute${minutes !== 1 ? 's' : ''}` : '';

    if (hText && mText) return `${hText} and ${mText}`;
    if (hText) return hText;
    if (mText) return mText;
    return '0 minutes';
  })();

  const isPremium = value === 'overtime_premium';

  return (
    <div className="space-y-4">
      <GenericPicker
        label="Overtime Type"
        value={value}
        options={typeOptions}
        onChange={onChange}
        Icon={Clock}
        placeholder="Select overtime type..."
      />

      <div className={`rounded-xl border px-4 py-3 text-center transition-all duration-300 ${
        isPremium 
          ? 'border-purple-200 bg-purple-50/70' 
          : 'border-primary-100 bg-primary-50/50'
      }`}>
        <p className={`text-[10px] font-bold uppercase tracking-widest transition-colors duration-300 ${
          isPremium ? 'text-purple-600/90' : 'text-primary-500/70'
        }`}>
          Approved Overtime Duration
        </p>
        <p className={`mt-0.5 text-base font-extrabold transition-colors duration-300 ${
          isPremium ? 'text-purple-800' : 'text-primary-700'
        }`}>
          {durationText}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <GenericPicker
          label="Hours"
          value={hours}
          options={hourOptions}
          onChange={handleHourChange}
          Icon={Clock}
          disabled={hourDisabled}
        />
        <GenericPicker
          label="Minutes"
          value={minutes}
          options={minuteOptions}
          onChange={handleMinuteChange}
          Icon={Clock}
        />
      </div>
    </div>
  );
}
