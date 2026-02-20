import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuthStore } from '@/features/auth/store/authSlice';

export function useSocket(namespace: string) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (!accessToken) return;

    const s = io(namespace, {
      auth: { token: accessToken },
      transports: ['websocket'],
    });

    s.on('connect', () => {
      console.log(`Connected to ${namespace}`);
    });

    s.on('connect_error', (err) => {
      console.error(`Socket error on ${namespace}:`, err.message);
    });

    setSocket(s);

    return () => {
      s.disconnect();
    };
  }, [accessToken, namespace]);

  return socket;
}
