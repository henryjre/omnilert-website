import { createContext, useContext, useLayoutEffect, useState, ReactNode, useRef, useEffect } from 'react';
import { Outlet, useLocation, useOutlet } from 'react-router-dom';
import { AnimatePresence, motion, useAnimation } from 'framer-motion';

interface AuthSidebarContextType {
  setSidebar: (key: string, node: ReactNode) => void;
}

const AuthSidebarContext = createContext<AuthSidebarContextType>({
  setSidebar: () => { },
});

function ContentRenderer() {
  const location = useLocation();
  const currentOutlet = useOutlet();

  const [displayState, setDisplayState] = useState({
    outlet: currentOutlet,
    pathname: location.pathname,
    status: 'visible' as 'visible' | 'hidden'
  });

  const lastLocation = useRef(location.pathname);

  useEffect(() => {
    if (location.pathname === lastLocation.current) return;
    lastLocation.current = location.pathname;

    // Hide old content when curtain covers it (400ms)
    const hideTimer = setTimeout(() => {
      setDisplayState(prev => ({ ...prev, status: 'hidden' }));
    }, 400);

    // Mount new content at 400ms as well so it's ready when the curtain shrinks
    const showTimer = setTimeout(() => {
      setDisplayState({
        outlet: currentOutlet,
        pathname: location.pathname,
        status: 'visible'
      });
    }, 400);

    return () => {
      clearTimeout(hideTimer);
      clearTimeout(showTimer);
    };
  }, [location.pathname, currentOutlet]);

  const isRegister = displayState.pathname === '/register';

  return (
    <div className={`absolute top-0 bottom-0 w-full lg:w-[calc(100%-380px)] pointer-events-auto flex flex-col ${isRegister ? 'right-0' : 'left-0'
      }`}>
      {displayState.status === 'visible' && (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{
            hidden: { opacity: 0 },
            visible: {
              opacity: 1,
              transition: {
                duration: 0.3,
                ease: "easeOut",
              }
            }
          }}
          className="flex flex-col flex-1 h-full"
        >
          {displayState.outlet}
        </motion.div>
      )}
    </div>
  );
}

export function useAuthSidebar(content: ReactNode, dependencies: any[] = []) {
  const { setSidebar } = useContext(AuthSidebarContext);
  const location = useLocation();
  useLayoutEffect(() => {
    setSidebar(location.pathname, content);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, ...dependencies]);
}

export function AuthLayout() {
  const [sidebars, setSidebars] = useState<Record<string, ReactNode>>({});
  const [isTransitioning, setIsTransitioning] = useState(false);
  const location = useLocation();
  const isRegister = location.pathname === '/register';

  const isFirstRender = useRef(true);
  const transitionId = useRef(0);
  const controls = useAnimation();
  const mobileControls = useAnimation();

  const handleSetSidebar = (key: string, node: ReactNode) => {
    setSidebars(prev => ({ ...prev, [key]: node }));
  };

  useEffect(() => {
    if (isFirstRender.current) {
      controls.set({
        width: 'calc(0vw + 380px)',
        left: isRegister ? 'calc(0vw - 0px)' : 'calc(100vw - 380px)',
      });
      mobileControls.set({
        scale: 1,
        opacity: 0,
        borderRadius: '1rem',
        top: '76px',
        left: 'calc(50% - 28px)',
      });
      isFirstRender.current = false;
      return;
    }

    const currentTransitionId = transitionId.current + 1;
    transitionId.current = currentTransitionId;
    setIsTransitioning(true);

    const finishTransition = () => {
      if (transitionId.current === currentTransitionId) {
        setIsTransitioning(false);
      }
    };

    if (isRegister) {
      // Login -> Register (Sweep right to left)
      const desktopTransition = controls.start({
        width: ['calc(0vw + 380px)', 'calc(100vw + 0px)', 'calc(0vw + 380px)'],
        left: ['calc(100vw - 380px)', 'calc(0vw - 0px)', 'calc(0vw - 0px)'],
        transition: { duration: 0.8, times: [0, 0.5, 1], ease: 'easeInOut' }
      });
      // Mobile radial expand
      const iconEl = document.getElementById('mobile-auth-icon');
      if (iconEl) {
        const rect = iconEl.getBoundingClientRect();
        mobileControls.set({ top: rect.top, left: rect.left, opacity: 1 });
      } else {
        mobileControls.set({ opacity: 1 });
      }
      const mobileTransition = mobileControls.start({
        scale: [1, 1.01, 50, 1.01, 1],
        borderRadius: ['16px', '16px', '0.32px', '16px', '16px'],
        opacity: [1, 1, 1, 1, 0],
        transition: { duration: 0.8, times: [0, 0.01, 0.5, 0.99, 1], ease: 'easeInOut' }
      });
      void Promise.all([desktopTransition, mobileTransition]).then(finishTransition);
    } else {
      // Register -> Login (Sweep left to right)
      const desktopTransition = controls.start({
        width: ['calc(0vw + 380px)', 'calc(100vw + 0px)', 'calc(0vw + 380px)'],
        left: ['calc(0vw - 0px)', 'calc(0vw - 0px)', 'calc(100vw - 380px)'],
        transition: { duration: 0.8, times: [0, 0.5, 1], ease: 'easeInOut' }
      });
      // Mobile radial expand
      const iconEl = document.getElementById('mobile-auth-icon');
      if (iconEl) {
        const rect = iconEl.getBoundingClientRect();
        mobileControls.set({ top: rect.top, left: rect.left, opacity: 1 });
      } else {
        mobileControls.set({ opacity: 1 });
      }
      const mobileTransition = mobileControls.start({
        scale: [1, 1.01, 50, 1.01, 1],
        borderRadius: ['16px', '16px', '0.32px', '16px', '16px'],
        opacity: [1, 1, 1, 1, 0],
        transition: { duration: 0.8, times: [0, 0.01, 0.5, 0.99, 1], ease: 'easeInOut' }
      });
      void Promise.all([desktopTransition, mobileTransition]).then(finishTransition);
    }
  }, [isRegister, controls, mobileControls]);

  return (
    <AuthSidebarContext.Provider value={{ setSidebar: handleSetSidebar }}>
      <div className="relative flex min-h-screen min-h-[100dvh] w-full bg-[#faf9f7] text-gray-900 overflow-hidden">

        {/* Main Content Area (Forms) */}
        <div className="absolute inset-0 z-10 pointer-events-none overflow-x-hidden overflow-y-auto pb-[env(safe-area-inset-bottom)] lg:overflow-hidden lg:pb-0">
          {/* Mobile Background Decorations */}
          <div className="absolute inset-0 z-0 lg:hidden pointer-events-none overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[50vh] bg-gradient-to-b from-primary-50/80 to-transparent" />
            <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-primary-200/30 blur-3xl" />
            <div className="absolute top-64 -left-24 h-64 w-64 rounded-full bg-amber-200/20 blur-3xl" />
          </div>
          <ContentRenderer />
        </div>

        {/* The Mobile Radial Curtain */}
        <motion.div
          animate={mobileControls}
          className="fixed lg:hidden z-[60] flex items-center justify-center overflow-hidden origin-center rounded-2xl shadow-lg shadow-primary-500/30"
          style={{
            width: '56px',
            height: '56px',
            background: 'linear-gradient(to top right, rgb(var(--primary-600)), rgb(var(--primary-400)))',
            pointerEvents: 'none',
          }}
        >
          {/* Inner loading indicator that only shows when fully expanded */}
          <motion.div
            animate={{ opacity: [0, 0, 1, 1, 0, 0] }}
            transition={{ duration: 0.8, times: [0, 0.4, 0.45, 0.55, 0.6, 1], repeat: 0 }}
            className="flex flex-col items-center justify-center"
          >
            <div className="flex gap-1.5">
              <motion.div className="h-2 w-2 rounded-full bg-white" animate={{ y: [0, -6, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0 }} />
              <motion.div className="h-2 w-2 rounded-full bg-white" animate={{ y: [0, -6, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0.15 }} />
              <motion.div className="h-2 w-2 rounded-full bg-white" animate={{ y: [0, -6, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0.3 }} />
            </div>
          </motion.div>
        </motion.div>

        {isTransitioning && (
          <div
            aria-hidden="true"
            className="fixed inset-0 z-[70] cursor-wait"
          />
        )}

        {/* The Sweeping Blue Curtain (Desktop) */}
        <motion.aside
          animate={controls}
          className="absolute top-0 bottom-0 hidden lg:block z-40 overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, rgb(var(--primary-600)) 0%, rgb(var(--primary-700)) 50%, rgb(var(--primary-800)) 100%)',
            boxShadow: isRegister ? '10px 0 30px rgba(0,0,0,0.2)' : '-10px 0 30px rgba(0,0,0,0.2)'
          }}
        >
          {/* Background Textures */}
          <div className="pointer-events-none absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'radial-gradient(circle, #ffffff 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
          <div className="pointer-events-none absolute inset-0 opacity-[0.035]" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`, backgroundSize: '256px 256px' }} />

          <motion.div animate={{ x: [0, 30, -30, 0], y: [0, -50, 50, 0] }} transition={{ duration: 30, repeat: Infinity, ease: 'linear' }} className="pointer-events-none absolute -left-1/2 -top-1/2 h-[200%] w-[200%] opacity-20" style={{ background: 'radial-gradient(circle at center, rgb(var(--primary-400)) 0%, transparent 50%)', filter: 'blur(80px)' }} />
          <motion.div animate={{ x: [0, -40, 40, 0], y: [0, 30, -30, 0] }} transition={{ duration: 25, repeat: Infinity, ease: 'linear', delay: -5 }} className="pointer-events-none absolute -bottom-1/2 -right-1/2 h-[200%] w-[200%] opacity-[0.12]" style={{ background: 'radial-gradient(circle at center, rgb(var(--primary-300)) 0%, transparent 45%)', filter: 'blur(100px)' }} />
          <motion.div animate={{ left: ['-50%', '150%'] }} transition={{ duration: 3, repeat: Infinity, repeatDelay: 12, ease: 'easeInOut' }} className="pointer-events-none absolute bottom-0 top-0 w-64 -skew-x-[25deg] opacity-[0.07]" style={{ background: 'linear-gradient(to right, transparent, rgba(255,255,255,0), rgba(255,255,255,0.5), rgba(255,255,255,0), transparent)' }} />

          <div className="pointer-events-none absolute -bottom-20 -right-20 h-72 w-72 rounded-full bg-amber-500/10 blur-3xl" />

          {/* Fixed Anchors for Sidebar Content */}
          <AnimatePresence>
            {isRegister ? (
              <motion.div
                key="register-sidebar"
                initial={{ opacity: 0, filter: 'blur(4px)' }}
                animate={{ opacity: 1, filter: 'blur(0px)', transition: { delay: 0.8, duration: 0.4 } }}
                exit={{ opacity: 0, filter: 'blur(4px)', transition: { duration: 0.2 } }}
                className="absolute left-0 top-0 bottom-0 w-[380px] flex flex-col justify-between z-10"
              >
                {sidebars['/register']}
              </motion.div>
            ) : (
              <motion.div
                key="login-sidebar"
                initial={{ opacity: 0, filter: 'blur(4px)' }}
                animate={{ opacity: 1, filter: 'blur(0px)', transition: { delay: 0.8, duration: 0.4 } }}
                exit={{ opacity: 0, filter: 'blur(4px)', transition: { duration: 0.2 } }}
                className="absolute right-0 top-0 bottom-0 w-[380px] flex flex-col justify-between z-10"
              >
                {sidebars['/login']}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.aside>

      </div>
    </AuthSidebarContext.Provider>
  );
}
