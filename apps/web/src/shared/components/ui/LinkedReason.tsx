const URL_REGEX = /https?:\/\/[^\s]+/g;

interface Part {
  text: string;
  isUrl: boolean;
}

function splitByUrls(value: string): Part[] {
  const parts: Part[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  URL_REGEX.lastIndex = 0;
  while ((match = URL_REGEX.exec(value)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: value.slice(lastIndex, match.index), isUrl: false });
    }
    parts.push({ text: match[0], isUrl: true });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < value.length) {
    parts.push({ text: value.slice(lastIndex), isUrl: false });
  }

  return parts;
}

interface LinkedReasonProps {
  value: string;
  className?: string;
}

export function LinkedReason({ value, className }: LinkedReasonProps) {
  const parts = splitByUrls(value);
  return (
    <span className={className}>
      {parts.map((part, i) =>
        part.isUrl ? (
          <a
            key={i}
            href={part.text}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 underline break-all"
          >
            {part.text}
          </a>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </span>
  );
}
