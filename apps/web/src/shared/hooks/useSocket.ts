import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { useAuthStore } from "@/features/auth/store/authSlice";

interface ManagedSocket {
  socket: Socket;
  namespace: string;
  token: string;
  refs: number;
}

const managedSockets = new Map<string, ManagedSocket>();

function createManagedSocket(namespace: string, token: string): ManagedSocket {
  const socket = io(namespace, {
    auth: { token },
    transports: ["websocket"],
  });

  socket.on("connect", () => {
    console.log(`Connected to ${namespace}`);
  });

  socket.on("connect_error", (err: Error) => {
    console.error(`Socket error on ${namespace}:`, err.message);
  });

  return {
    socket,
    namespace,
    token,
    refs: 0,
  };
}

export function useSocket(namespace: string) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (!accessToken) {
      setSocket(null);
      return;
    }

    const existing = managedSockets.get(namespace);
    const managed =
      existing && existing.token === accessToken
        ? existing
        : createManagedSocket(namespace, accessToken);

    if (!existing || existing.token !== accessToken) {
      if (existing) {
        existing.socket.disconnect();
      }
      managedSockets.set(namespace, managed);
    }

    managed.refs += 1;
    setSocket(managed.socket);

    return () => {
      const current = managedSockets.get(namespace);
      if (!current || current.socket !== managed.socket) return;
      current.refs = Math.max(0, current.refs - 1);
      if (current.refs === 0) {
        current.socket.disconnect();
        managedSockets.delete(namespace);
      }
    };
  }, [accessToken, namespace]);

  return socket;
}
