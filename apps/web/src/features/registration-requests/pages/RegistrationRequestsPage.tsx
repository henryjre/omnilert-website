import { useEffect, useMemo, useState } from 'react';
import { Card, CardBody, CardHeader } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Spinner } from '@/shared/components/ui/Spinner';
import { api } from '@/shared/services/api.client';
import { usePermission } from '@/shared/hooks/usePermission';
import { PERMISSIONS } from '@omnilert/shared';

type RegistrationStatus = 'pending' | 'approved' | 'rejected';

interface RegistrationRequest {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  status: RegistrationStatus;
  requested_at: string;
  reviewed_at: string | null;
  reviewed_by_name?: string | null;
  rejection_reason?: string | null;
}

export function RegistrationRequestsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | RegistrationStatus>('pending');
  const [requests, setRequests] = useState<RegistrationRequest[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<RegistrationRequest | null>(null);
  const [approveRoleIds, setApproveRoleIds] = useState<string[]>([]);
  const [approveBranchIds, setApproveBranchIds] = useState<string[]>([]);
  const [rejectReason, setRejectReason] = useState('');
  const [mode, setMode] = useState<'approve' | 'reject' | null>(null);

  const { hasPermission } = usePermission();
  const canApprove = hasPermission(PERMISSIONS.REGISTRATION_APPROVE);

  const filteredRequests = useMemo(() => {
    if (statusFilter === 'all') return requests;
    return requests.filter((request) => request.status === statusFilter);
  }, [requests, statusFilter]);

  async function fetchData() {
    setLoading(true);
    setError('');
    try {
      const [requestsRes, rolesRes, branchesRes] = await Promise.all([
        api.get('/registration-requests'),
        api.get('/roles'),
        api.get('/branches'),
      ]);
      setRequests(requestsRes.data.data || []);
      setRoles(rolesRes.data.data || []);
      setBranches((branchesRes.data.data || []).filter((branch: any) => branch.is_active));
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load registration requests');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  const toggleSelection = (
    current: string[],
    setCurrent: (value: string[]) => void,
    id: string,
  ) => {
    setCurrent(current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const openApprove = (request: RegistrationRequest) => {
    setSelectedRequest(request);
    setApproveRoleIds([]);
    setApproveBranchIds([]);
    setMode('approve');
    setError('');
    setSuccess('');
  };

  const openReject = (request: RegistrationRequest) => {
    setSelectedRequest(request);
    setRejectReason('');
    setMode('reject');
    setError('');
    setSuccess('');
  };

  const closeModal = () => {
    setSelectedRequest(null);
    setMode(null);
    setApproveRoleIds([]);
    setApproveBranchIds([]);
    setRejectReason('');
  };

  const approve = async () => {
    if (!selectedRequest) return;
    if (approveRoleIds.length === 0) {
      setError('Select at least one role.');
      return;
    }

    setSaving(true);
    try {
      await api.post(`/registration-requests/${selectedRequest.id}/approve`, {
        roleIds: approveRoleIds,
        branchIds: approveBranchIds,
      });
      setSuccess('Registration request approved.');
      closeModal();
      await fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to approve request');
    } finally {
      setSaving(false);
    }
  };

  const reject = async () => {
    if (!selectedRequest) return;
    if (!rejectReason.trim()) {
      setError('Rejection reason is required.');
      return;
    }

    setSaving(true);
    try {
      await api.post(`/registration-requests/${selectedRequest.id}/reject`, {
        reason: rejectReason.trim(),
      });
      setSuccess('Registration request rejected.');
      closeModal();
      await fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to reject request');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Registration Requests</h1>
        <p className="mt-1 text-sm text-gray-500">Review and process incoming website registrations.</p>
      </div>

      <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1 w-fit">
        {(['all', 'pending', 'approved', 'rejected'] as const).map((filter) => (
          <button
            key={filter}
            onClick={() => setStatusFilter(filter)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
              statusFilter === filter ? 'bg-primary-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {filter}
          </button>
        ))}
      </div>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}
      {success && <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{success}</div>}

      <div className="space-y-3">
        {filteredRequests.length === 0 && (
          <p className="text-sm text-gray-500">No registration requests in this filter.</p>
        )}
        {filteredRequests.map((request) => (
          <Card key={request.id}>
            <CardBody>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-gray-900">
                    {request.first_name} {request.last_name}
                  </p>
                  <p className="text-sm text-gray-600">{request.email}</p>
                  <p className="text-xs text-gray-500">
                    Requested: {new Date(request.requested_at).toLocaleString()}
                  </p>
                  {request.reviewed_at && (
                    <p className="text-xs text-gray-500">
                      Reviewed: {new Date(request.reviewed_at).toLocaleString()}
                      {request.reviewed_by_name ? ` by ${request.reviewed_by_name}` : ''}
                    </p>
                  )}
                  {request.status === 'rejected' && request.rejection_reason && (
                    <p className="text-xs text-red-600">Reason: {request.rejection_reason}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    request.status === 'approved'
                      ? 'bg-green-100 text-green-700'
                      : request.status === 'rejected'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                  >
                    {request.status}
                  </span>
                  {canApprove && request.status === 'pending' && (
                    <>
                      <Button size="sm" variant="success" onClick={() => openApprove(request)}>
                        Approve
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => openReject(request)}>
                        Reject
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      {selectedRequest && mode === 'approve' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-2xl">
            <CardHeader>
              <h2 className="font-semibold text-gray-900">Approve Registration</h2>
            </CardHeader>
            <CardBody className="space-y-4">
              <p className="text-sm text-gray-600">
                {selectedRequest.first_name} {selectedRequest.last_name} ({selectedRequest.email})
              </p>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Roles (required)</label>
                <div className="flex flex-wrap gap-2">
                  {roles.map((role) => (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => toggleSelection(approveRoleIds, setApproveRoleIds, role.id)}
                      className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                        approveRoleIds.includes(role.id)
                          ? 'text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                      style={approveRoleIds.includes(role.id) ? { backgroundColor: role.color || '#2563eb' } : {}}
                    >
                      {role.name}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Branches (optional, default none)</label>
                <div className="flex flex-wrap gap-2">
                  {branches.map((branch) => (
                    <button
                      key={branch.id}
                      type="button"
                      onClick={() => toggleSelection(approveBranchIds, setApproveBranchIds, branch.id)}
                      className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                        approveBranchIds.includes(branch.id)
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {branch.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={closeModal} disabled={saving}>Cancel</Button>
                <Button variant="success" onClick={approve} disabled={saving}>
                  {saving ? 'Approving...' : 'Approve'}
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {selectedRequest && mode === 'reject' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <h2 className="font-semibold text-gray-900">Reject Registration</h2>
            </CardHeader>
            <CardBody className="space-y-4">
              <Input
                label="Reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Enter rejection reason"
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={closeModal} disabled={saving}>Cancel</Button>
                <Button variant="danger" onClick={reject} disabled={saving}>
                  {saving ? 'Rejecting...' : 'Reject'}
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
