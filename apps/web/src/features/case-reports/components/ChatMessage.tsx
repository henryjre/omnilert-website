import type { CaseMessage } from '@omnilert/shared';
import { Button } from '@/shared/components/ui/Button';

interface ChatMessageProps {
  message: CaseMessage;
  canReply: boolean;
  onReply: (message: CaseMessage) => void;
  onReact: (messageId: string, emoji: string) => void;
}

const QUICK_REACTIONS = ['👍', '❤️', '😂'];

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

export function ChatMessage({ message, canReply, onReply, onReact }: ChatMessageProps) {
  return (
    <div className={`rounded-2xl border px-4 py-3 ${message.is_system ? 'border-blue-100 bg-blue-50' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">{message.user_name ?? 'Unknown User'}</p>
          <p className="text-xs text-gray-400">{formatDate(message.created_at)}</p>
        </div>
        {!message.is_system && (
          <div className="flex gap-1">
            {QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onReact(message.id, emoji)}
                className="rounded-full bg-gray-100 px-2 py-1 text-xs hover:bg-gray-200"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700">{message.content}</p>

      {message.attachments.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {message.attachments.map((attachment) => (
            <a
              key={attachment.id}
              href={attachment.file_url}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-primary-700 hover:bg-gray-100"
            >
              {attachment.file_name}
            </a>
          ))}
        </div>
      )}

      {message.reactions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {message.reactions.map((reaction) => (
            <button
              key={reaction.emoji}
              type="button"
              onClick={() => onReact(message.id, reaction.emoji)}
              className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-700"
            >
              {reaction.emoji} {reaction.users.length}
            </button>
          ))}
        </div>
      )}

      {canReply && !message.is_system && (
        <div className="mt-3">
          <Button variant="ghost" size="sm" onClick={() => onReply(message)}>Reply</Button>
        </div>
      )}

      {(message.replies?.length ?? 0) > 0 && (
        <div className="mt-4 space-y-3 border-l border-gray-200 pl-4">
          {message.replies!.map((reply) => (
            <ChatMessage key={reply.id} message={reply} canReply={false} onReply={onReply} onReact={onReact} />
          ))}
        </div>
      )}
    </div>
  );
}
