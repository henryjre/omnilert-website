import { useEffect, useState } from 'react';
import { Card, CardHeader, CardBody } from '@/shared/components/ui/Card';
import { Spinner } from '@/shared/components/ui/Spinner';
import { Button } from '@/shared/components/ui/Button';
import { useAuthStore } from '@/features/auth/store/authSlice';
import { api } from '@/shared/services/api.client';
import { usePermission } from '@/shared/hooks/usePermission';
import { PERMISSIONS } from '@omnilert/shared';

export function DashboardPage() {
  const { hasPermission } = usePermission();
  const user = useAuthStore((s) => s.user);

  // Get greeting based on time of day
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return "Good morning";
    if (hour >= 12 && hour < 18) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">{getGreeting()}, {user?.firstName || "User"}!</h1>

      {hasPermission(PERMISSIONS.DASHBOARD_VIEW_PERFORMANCE_INDEX) && <PerformanceIndex />}
    </div>
  );
}

function PerformanceIndex() {
  const [epiData, setEpiData] = useState<any>(null);
  const [auditRatings, setAuditRatings] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>(null);
  const [topEmployees, setTopEmployees] = useState<any[]>([]);
  const [currentUserEmployeeId, setCurrentUserEmployeeId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);
  const [ratingsLoading, setRatingsLoading] = useState(false);
  const [page, setPage] = useState(1);

  // Fetch EPI data on mount
  useEffect(() => {
    setLoading(true);
    api.get('/dashboard/performance-index', { params: { page: 1 } })
      .then((res) => {
        const nextData = res.data.data;
        if (!nextData) {
          setEpiData(null);
          setAuditRatings([]);
          setPagination(null);
          setCurrentUserEmployeeId(null);
          return;
        }
        setEpiData(nextData);
        setAuditRatings(nextData.auditRatings || []);
        setPagination(nextData.pagination || null);
        setCurrentUserEmployeeId(nextData.currentUserEmployeeId || null);
      })
      .finally(() => setLoading(false));
  }, []);

  // Fetch leaderboard separately so it loads regardless of EPI success
  useEffect(() => {
    setLeaderboardLoading(true);
    api.get('/dashboard/epi-leaderboard')
      .then((res) => {
        setTopEmployees(res.data.data || []);
      })
      .finally(() => setLeaderboardLoading(false));
  }, []);

  // Fetch audit ratings when page changes
  useEffect(() => {
    if (!epiData) return;
    
    setRatingsLoading(true);
    api
      .get('/dashboard/performance-index', { params: { page } })
      .then((res) => {
        const nextData = res.data.data;
        setAuditRatings(nextData?.auditRatings || []);
        setPagination(nextData?.pagination || null);
      })
      .finally(() => setRatingsLoading(false));
  }, [page, epiData]);

  if (loading) return <LoadingCard title="Employee Performance Index" />;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Employee Performance Index</h2>
        </div>
      </CardHeader>
      <CardBody>
        {/* Show message when no EPI data */}
        {!epiData && (
          <p className="mb-4 text-sm text-gray-500">No performance data available.</p>
        )}

        {epiData && (
          <>
            {/* Employee Name */}
            <div className="mb-4">
              <p className="text-sm font-medium text-gray-700">
                Employee: <span className="text-gray-900">{epiData.employee_id?.[1]}</span>
              </p>
            </div>

            {/* Performance Metrics */}
            <div className="mb-6 grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                <p className="text-sm text-gray-500">EPI Points</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">{epiData.x_epi?.toFixed(1)}</p>
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                <p className="text-sm text-gray-500">Avg. Service Crew QA Audit</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">{(epiData.x_average_sqaa || 0).toFixed(1)}</p>
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                <p className="text-sm text-gray-500">Avg. Store CCTV Spot Audit</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">{(epiData.x_average_scsa || 0).toFixed(1)}</p>
              </div>
            </div>

            {/* Audit Ratings Table */}
            <div>
              <h3 className="mb-3 text-sm font-semibold text-gray-900">Audit Ratings</h3>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Date</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Audit Code</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Name</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">Rating</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ratingsLoading ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-4 text-center text-gray-500">
                          Loading...
                        </td>
                      </tr>
                    ) : auditRatings.length > 0 ? (
                      auditRatings.map((rating: any) => (
                        <tr key={rating.id} className="border-t border-gray-100">
                          <td className="px-3 py-2 text-gray-700">
                            {new Date(rating.x_audit_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </td>
                          <td className="px-3 py-2 text-gray-700">{rating.x_audit_code}</td>
                          <td className="px-3 py-2 text-gray-700">{rating.x_name}</td>
                          <td className="px-3 py-2 text-right">
                            <span className={`font-medium ${
                              rating.x_rating >= 4 ? 'text-green-600' : rating.x_rating >= 3 ? 'text-yellow-600' : 'text-red-600'
                            }`}>
                              {rating.x_rating}/5
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="px-3 py-4 text-center text-gray-400 italic">
                          No audit ratings yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
        </div>

              {/* Pagination */}
              {pagination && pagination.totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-sm text-gray-500">
                    Showing {((pagination.page - 1) * pagination.limit) + 1} - {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1 || ratingsLoading}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                      disabled={page >= pagination.totalPages || ratingsLoading}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Top Employees */}
        {!leaderboardLoading && (
        <div className="mt-6">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">Top Employees</h3>
          <div className="space-y-2">
              {topEmployees.map((employee: any, index: number) => (
              <div
                  key={employee.id}
                  className={`flex items-center justify-between rounded-lg px-4 py-2 ${
                    employee.id === currentUserEmployeeId 
                      ? 'bg-primary-50 border border-primary-200' 
                      : 'bg-gray-50'
                  }`}
              >
                <div className="flex items-center gap-3">
                    <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                      index === 0 ? 'bg-yellow-100 text-yellow-700' :
                      index === 1 ? 'bg-gray-100 text-gray-700' :
                      index === 2 ? 'bg-orange-100 text-orange-700' :
                      'bg-gray-200 text-gray-600'
                    }`}>
                      {index + 1}
                  </span>
                    <span className="text-sm font-medium text-gray-700">{employee.employee_id?.[1]}</span>
                </div>
                  <span className="text-sm font-semibold text-gray-900">{employee.x_epi?.toFixed(1)}</span>
              </div>
            ))}
          </div>
        </div>
        )}
      </CardBody>
    </Card>
  );
}

function LoadingCard({ title }: { title: string }) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      </CardHeader>
      <CardBody className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </CardBody>
    </Card>
  );
}
