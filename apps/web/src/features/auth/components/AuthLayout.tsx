import { createContext, useContext, useLayoutEffect, useState, ReactNode, useRef, useEffect } from 'react';
import { Outlet, useLocation, useOutlet } from 'react-router-dom';
import { AnimatePresence, motion, useAnimation } from 'framer-motion';

interface AuthSidebarContextType {
  setSidebar: (key: string, node: ReactNode) => void;
}

const AuthSidebarContext = createContext<AuthSidebarContextType>({
  setSidebar: () => {},
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

    // Hide old content exactly when the curtain covers it (400ms)
    const hideTimer = setTimeout(() => {
      setDisplayState(prev => ({ ...prev, status: 'hidden' }));
    }, 400);

    // Mount new content after curtain finishes sweeping (800ms)
    const showTimer = setTimeout(() => {
      setDisplayState({
        outlet: currentOutlet,
        pathname: location.pathname,
        status: 'visible'
      });
    }, 800);

    return () => {
      clearTimeout(hideTimer);
      clearTimeout(showTimer);
    };
  }, [location.pathname, currentOutlet]);

  const isRegister = displayState.pathname === '/register';

  return (
    <div className={`absolute top-0 bottom-0 w-full lg:w-[calc(100%-380px)] pointer-events-auto flex flex-col ${
      isRegister ? 'right-0' : 'left-0'
    }`}>
      {displayState.status === 'visible' && (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{
            hidden: { opacity: 0, y: 10 },
            visible: { 
              opacity: 1, 
              y: 0, 
              transition: { 
                duration: 0.4, 
                ease: "easeOut",
                staggerChildren: 0.08,
                delayChildren: 0.1
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
  const location = useLocation();
  const isRegister = location.pathname === '/register';
  
  const isFirstRender = useRef(true);
  const controls = useAnimation();

  const handleSetSidebar = (key: string, node: ReactNode) => {
    setSidebars(prev => ({ ...prev, [key]: node }));
  };

  useEffect(() => {
    if (isFirstRender.current) {
      controls.set({
        width: 'calc(0vw + 380px)',
        left: isRegister ? 'calc(0vw - 0px)' : 'calc(100vw - 380px)',
      });
      isFirstRender.current = false;
      return;
    }

    if (isRegister) {
      // Login -> Register (Sweep right to left)
      controls.start({
        width: ['calc(0vw + 380px)', 'calc(100vw + 0px)', 'calc(0vw + 380px)'],
        left: ['calc(100vw - 380px)', 'calc(0vw - 0px)', 'calc(0vw - 0px)'],
        transition: { duration: 0.8, times: [0, 0.5, 1], ease: 'easeInOut' }
      });
    } else {
      // Register -> Login (Sweep left to right)
      controls.start({
        width: ['calc(0vw + 380px)', 'calc(100vw + 0px)', 'calc(0vw + 380px)'],
        left: ['calc(0vw - 0px)', 'calc(0vw - 0px)', 'calc(100vw - 380px)'],
        transition: { duration: 0.8, times: [0, 0.5, 1], ease: 'easeInOut' }
      });
    }
  }, [isRegister, controls]);

  return (
    <AuthSidebarContext.Provider value={{ setSidebar: handleSetSidebar }}>
      <div className="relative flex min-h-screen w-full bg-[#faf9f7] text-gray-900 overflow-hidden">
        
        {/* Main Content Area (Forms) */}
        <div className="absolute inset-0 z-10 pointer-events-none overflow-x-hidden">
          <ContentRenderer />
        </div>

        {/* The Sweeping Blue Curtain */}
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
