import { useMemo, useRef, useState } from 'react';
import type { CaseMessage } from '@omnilert/shared';
import { FileWarning, Paperclip, X } from 'lucide-react';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import type { CaseReportDetail, MentionableRole, MentionableUser } from '../services/caseReport.api';
import { ChatSection } from './ChatSection';
import { TextInputModal } from './TextInputModal';

interface CaseReportDetailPanelProps {
  report: CaseReportDetail | null;
  messages: CaseMessage[];
  currentUserId: string;
  users: MentionableUser[];
  roles: MentionableRole[];
  canManage: boolean;
  canClose: boolean;
  onClosePanel: () => void;
  onUpdateCorrectiveAction: (value: string) => Promise<void>;
  onUpdateResolution: (value: string) => Promise<void>;
  onCloseCase: () => Promise<void>;
  onRequestVN: () => Promise<void>;
  onUploadAttachment: (file: File) => Promise<void>;
  onSendMessage: (input: {
    content: string;
    parentMessageId?: string | null;
    mentionedUserIds: string[];
    mentionedRoleIds: string[];
    files: File[];
  }) => Promise<void>;
  onReactMessage: (messageId: string, emoji: string) => Promise<void>;
  onEditMessage: (messageId: string, newContent: string) => Promise<void>;
  onDeleteMessage: (messageId: string) => Promise<void>;
}

function formatDate(value: string | null) {
  if (!value) return 'N/A';
  return new Date(value).toLocaleString();
}

export function CaseReportDetailPanel({
  report,
  messages,
  currentUserId,
  users,
  roles,
  canManage,
  canClose,
  onClosePanel,
  onUpdateCorrectiveAction,
  onUpdateResolution,
  onCloseCase,
  onRequestVN,
  onUploadAttachment,
  onSendMessage,
  onReactMessage,
  onEditMessage,
  onDeleteMessage,
}: CaseReportDetailPanelProps) {
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const [editingField, setEditingField] = useState<'corrective_action' | 'resolution' | null>(null);

  const chatLocked = useMemo(
    () => report?.status === 'closed' && !canManage,
    [canManage, report?.status],
  );

  if (!report) return null;

  return (
    <>
      <div className="flex h-full flex-col bg-white">
        <div className="flex items-start justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <div className="flex items-center gap-3">
              <FileWarning className="h-5 w-5 text-primary-600" />
              <h2 className="text-xl font-semibold text-gray-900">{report.title}</h2>
              <Badge variant={report.status === 'open' ? 'success' : 'danger'}>
                {report.status === 'open' ? 'Open' : 'Closed'}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              Case {String(report.case_number).padStart(4, '0')} � Created by {report.created_by_name ?? 'Unknown'} on {formatDate(report.created_at)}
            </p>
          </div>
          <button type="button" onClick={onClosePanel} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-rows-[auto_1fr]">
          <div className="space-y-5 overflow-y-auto px-6 py-5">
            <section>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Description</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700">{report.description}</p>
            </section>

            <section>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Corrective Action</p>
                {(report.status === 'open' || canManage) && (
                  <Button variant="ghost" size="sm" onClick={() => setEditingField('corrective_action')}>
                    {report.corrective_action ? 'Edit' : 'Add'} Corrective Action
                  </Button>
                )}
              </div>
              <p className="mt-2 whitespace-pre-wrap rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-700">
                {report.corrective_action || 'Not yet added'}
              </p>
            </section>

            <section>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Resolution</p>
                {(report.status === 'open' || canManage) && (
                  <Button variant="ghost" size="sm" onClick={() => setEditingField('resolution')}>
                    {report.resolution ? 'Edit' : 'Add'} Resolution
                  </Button>
                )}
              </div>
              <p className="mt-2 whitespace-pre-wrap rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-700">
                {report.resolution || 'Not yet added'}
              </p>
            </section>

            <section>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Attachments</p>
                <Button variant="secondary" size="sm" onClick={() => attachmentInputRef.current?.click()}>
                  <Paperclip className="mr-2 h-4 w-4" />
                  Add File
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {report.attachments.length === 0 ? (
                  <p className="text-sm text-gray-400">No case attachments yet</p>
                ) : (
                  report.attachments.map((attachment) => (
                    <a
                      key={attachment.id}
                      href={attachment.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-primary-700 hover:bg-gray-100"
                    >
                      {attachment.file_name}
                    </a>
                  ))
                )}
              </div>
              <input
                ref={attachmentInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (file) await onUploadAttachment(file);
                }}
              />
            </section>

            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!canClose || !report.corrective_action || !report.resolution || report.status === 'closed'}
                onClick={() => void onCloseCase()}
              >
                Close Case
              </Button>
              {report.status === 'closed' && (
                <Button variant="secondary" onClick={() => void onRequestVN()}>
                  Request VN
                </Button>
              )}
            </div>
          </div>

          <div className="min-h-0 border-t border-gray-200 px-6 py-5">
            <ChatSection
              messages={messages}
              currentUserId={currentUserId}
              canManage={canManage}
              chatLocked={chatLocked}
              users={users}
              roles={roles}
              onSend={onSendMessage}
              onReact={onReactMessage}
              onEdit={onEditMessage}
              onDelete={onDeleteMessage}
            />
          </div>
        </div>
      </div>

      <TextInputModal
        isOpen={editingField === 'corrective_action'}
        title="Corrective Action"
        initialValue={report.corrective_action}
        onClose={() => setEditingField(null)}
        onSubmit={onUpdateCorrectiveAction}
      />
      <TextInputModal
        isOpen={editingField === 'resolution'}
        title="Resolution"
        initialValue={report.resolution}
        onClose={() => setEditingField(null)}
        onSubmit={onUpdateResolution}
      />
    </>
  );
}
