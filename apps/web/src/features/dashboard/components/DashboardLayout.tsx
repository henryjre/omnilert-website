import { Outlet } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function DashboardLayout() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto bg-gray-50 p-6">
          <Outlet />
        </main>
      </div>

      {/* Floating refresh button */}
      <button
        onClick={() => window.location.reload()}
        className="fixed bottom-6 right-6 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-500 shadow-lg ring-1 ring-gray-200 transition-all hover:bg-gray-50 hover:text-gray-700 hover:shadow-xl active:scale-95"
        title="Refresh page"
      >
        <RefreshCw className="h-4.5 w-4.5" />
      </button>
    </div>
  );
}
