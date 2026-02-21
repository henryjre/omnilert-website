import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function DashboardLayout() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileSidebarOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileSidebarOpen]);

  useEffect(() => {
    if (!mobileSidebarOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileSidebarOpen]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar className="hidden lg:flex" />

      <div
        className={`fixed inset-0 z-50 lg:hidden ${
          mobileSidebarOpen ? '' : 'pointer-events-none'
        }`}
      >
        <button
          type="button"
          className={`absolute inset-0 bg-black/30 transition-opacity ${
            mobileSidebarOpen ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={() => setMobileSidebarOpen(false)}
          aria-label="Close navigation drawer"
        />
        <div
          className={`absolute inset-y-0 left-0 flex w-72 max-w-[85vw] transform flex-col bg-white shadow-xl transition-transform ${
            mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(false)}
            className="absolute right-3 top-3 z-10 rounded-lg bg-white/90 p-2 text-gray-500 shadow-sm ring-1 ring-gray-200 hover:bg-gray-100 hover:text-gray-800"
            aria-label="Close navigation drawer"
          >
            <X className="h-5 w-5" />
          </button>
          <Sidebar className="h-full w-full border-r-0" />
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar onOpenSidebar={() => setMobileSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto bg-gray-50 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
