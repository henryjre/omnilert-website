import type { CaseMessage } from '@omnilert/shared';

interface MessageReactionBadgeProps {
  reactions: CaseMessage['reactions'];
  onClick: () => void;
  isOwn?: boolean;
}

export function MessageReactionBadge({ reactions, onClick, isOwn }: MessageReactionBadgeProps) {
  const totalCount = reactions.reduce((sum, reaction) => sum + reaction.users.length, 0);
  const leadingEmojis = [...reactions]
    .sort((left, right) => right.users.length - left.users.length || left.emoji.localeCompare(right.emoji))
    .slice(0, 3)
    .map((reaction) => reaction.emoji);

  if (totalCount === 0) return null;

  return (
    <button
      data-no-message-tap
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`absolute -bottom-[12px] right-0 z-10 flex min-h-[22px] items-center gap-[2px] rounded-[11px] border border-gray-100 bg-white px-[4px] py-[2px] shadow-[0_1px_4px_rgba(0,0,0,0.15)] transition-transform hover:scale-[1.02]`}
      aria-label={`View reactions (${totalCount})`}
    >
      <span className="flex items-center pl-[2px]">
        {leadingEmojis.map((emoji) => (
          <span
            key={emoji}
            className="flex items-center justify-center text-[13px] leading-none"
          >
            {emoji}
          </span>
        ))}
      </span>
      {totalCount > 1 && <span className="ml-[2px] pr-[4px] text-[11px] font-[600] text-gray-500 leading-none">{totalCount}</span>}
    </button>
  );
}
