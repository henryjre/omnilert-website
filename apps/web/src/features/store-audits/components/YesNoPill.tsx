interface YesNoPillProps {
  value: boolean | null;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}

export function YesNoPill({ value, onChange, disabled = false }: YesNoPillProps) {
  return (
    <div className="inline-flex rounded-full border border-gray-200 bg-white p-0.5">
      <button
        type="button"
        onClick={() => onChange(true)}
        disabled={disabled}
        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          value === true
            ? 'bg-green-600 text-white'
            : 'text-green-700 hover:bg-green-50'
        }`}
      >
        Yes
      </button>
      <button
        type="button"
        onClick={() => onChange(false)}
        disabled={disabled}
        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          value === false
            ? 'bg-red-600 text-white'
            : 'text-red-700 hover:bg-red-50'
        }`}
      >
        No
      </button>
    </div>
  );
}
