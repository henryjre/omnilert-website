import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function DashboardLayout() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [panStartX, setPanStartX] = useState<number | null>(null);
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

      <AnimatePresence>
        {mobileSidebarOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
              onClick={() => setMobileSidebarOpen(false)}
              aria-label="Close navigation drawer"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              onPanEnd={(_, info) => {
                // Swipe left to close
                if (info.offset.x < -60) {
                  setMobileSidebarOpen(false);
                }
              }}
              className="absolute inset-y-0 left-0 flex h-[100dvh] w-72 max-w-[85vw] flex-col bg-white shadow-2xl shadow-black/20"
            >
              <Sidebar className="h-full w-full border-r-0" />
              <motion.span
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                className="pointer-events-none absolute -right-10 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/90 p-1.5 text-gray-600 shadow-sm ring-1 ring-gray-200"
              >
                <ChevronLeft className="h-4 w-4" />
              </motion.span>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <motion.div
        className="flex flex-1 flex-col overflow-hidden"
        style={{ touchAction: 'pan-y' }}
        onPanStart={(_, info) => setPanStartX(info.point.x)}
        onPanEnd={(_, info) => {
          if (!mobileSidebarOpen && panStartX !== null) {
            // Started within 80px of left edge, swiped right by at least 40px
            // and vertical movement was minimal (ignoring unintentional vertical drags)
            if (panStartX < 80 && info.offset.x > 40 && Math.abs(info.offset.y) < 60) {
              setMobileSidebarOpen(true);
            }
          }
          setPanStartX(null);
        }}
      >
        <TopBar onOpenSidebar={() => setMobileSidebarOpen(true)} />
        <main
          data-dashboard-scroll-container="true"
          className="flex-1 overflow-y-auto bg-gray-50 p-4 sm:p-6"
        >
          <Outlet />
        </main>
      </motion.div>
    </div>
  );
}
