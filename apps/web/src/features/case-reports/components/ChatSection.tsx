import { useRef, useState } from 'react';
import type { CaseMessage } from '@omnilert/shared';
import { AtSign, Paperclip, Send, X } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import type { MentionableRole, MentionableUser } from '../services/caseReport.api';
import { MentionPicker } from './MentionPicker';
import { ChatMessage } from './ChatMessage';

interface ChatSectionProps {
  messages: CaseMessage[];
  currentUserId: string;
  canManage: boolean;
  chatLocked: boolean;
  users: MentionableUser[];
  roles: MentionableRole[];
  onSend: (input: {
    content: string;
    parentMessageId?: string | null;
    mentionedUserIds: string[];
    mentionedRoleIds: string[];
    files: File[];
  }) => Promise<void>;
  onReact: (messageId: string, emoji: string) => Promise<void>;
  onEdit: (messageId: string, newContent: string) => Promise<void>;
  onDelete: (messageId: string) => Promise<void>;
}

export function ChatSection({
  messages,
  currentUserId,
  canManage,
  chatLocked,
  users,
  roles,
  onSend,
  onReact,
  onEdit,
  onDelete,
}: ChatSectionProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const [content, setContent] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [replyTo, setReplyTo] = useState<CaseMessage | null>(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([]);
  const [mentionedRoleIds, setMentionedRoleIds] = useState<string[]>([]);

  function handleScrollToMessage(messageId: string) {
    const el = document.querySelector(`[data-message-id="${messageId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-1 overflow-y-auto pr-1">
        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            message={message}
            currentUserId={currentUserId}
            canManage={canManage}
            chatLocked={chatLocked}
            allMessages={messages}
            onReply={setReplyTo}
            onReact={(messageId, emoji) => void onReact(messageId, emoji)}
            onEdit={onEdit}
            onDelete={onDelete}
            onScrollToMessage={handleScrollToMessage}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="relative mt-4 border-t border-gray-200 pt-4">
        <MentionPicker
          isOpen={mentionOpen}
          query={mentionQuery}
          users={users}
          roles={roles}
          onSelectUser={(user) => {
            setMentionedUserIds((current) => Array.from(new Set([...current, user.id])));
            setContent((current) => `${current}@${user.name} `);
            setMentionOpen(false);
          }}
          onSelectRole={(role) => {
            setMentionedRoleIds((current) => Array.from(new Set([...current, role.id])));
            setContent((current) => `${current}@${role.name} `);
            setMentionOpen(false);
          }}
        />

        {replyTo && (
          <div className="mb-3 flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-600">
            <span>Replying to {replyTo.user_name}: {replyTo.content.slice(0, 60)}</span>
            <button type="button" onClick={() => setReplyTo(null)}><X className="h-4 w-4" /></button>
          </div>
        )}

        {files.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {files.map((file) => (
              <span key={`${file.name}-${file.size}`} className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700">
                {file.name}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          <textarea
            value={content}
            onChange={(event) => {
              const next = event.target.value;
              setContent(next);
              const atIndex = next.lastIndexOf('@');
              if (atIndex >= 0) {
                setMentionQuery(next.slice(atIndex + 1));
                setMentionOpen(true);
              }
            }}
            rows={3}
            disabled={chatLocked}
            className="min-h-[96px] flex-1 rounded-2xl border border-gray-300 px-3 py-3 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 disabled:bg-gray-50"
            placeholder={chatLocked ? 'Chat is locked for this case' : 'Write a message...'}
          />
          <div className="flex flex-col gap-2">
            <Button variant="secondary" onClick={() => setMentionOpen((current) => !current)} disabled={chatLocked}>
              <AtSign className="h-4 w-4" />
            </Button>
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={chatLocked}>
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button
              onClick={async () => {
                await onSend({
                  content,
                  parentMessageId: replyTo?.id ?? null,
                  mentionedUserIds,
                  mentionedRoleIds,
                  files,
                });
                setContent('');
                setFiles([]);
                setReplyTo(null);
                setMentionOpen(false);
                setMentionQuery('');
                setMentionedUserIds([]);
                setMentionedRoleIds([]);
              }}
              disabled={chatLocked || !content.trim()}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
        />
      </div>
    </div>
  );
}
