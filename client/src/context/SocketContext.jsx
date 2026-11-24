import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext({
  socket: null,
  status: 'disconnected', // 'connecting' | 'connected' | 'disconnected'
  isConnected: false,
});

export function SocketProvider({ children }) {
  const { token, logout } = useAuth();
  const [status, setStatus] = useState('disconnected');
  const socketRef = useRef(null);

  useEffect(() => {
    if (!token) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setStatus('disconnected');
      return;
    }

    const socketUrl =
      import.meta.env.VITE_SOCKET_URL ||
      import.meta.env.VITE_API_BASE_URL ||
      'http://localhost:5000';

    setStatus('connecting');

    const socket = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setStatus('connected');
    });

    socket.on('disconnect', () => {
      setStatus('disconnected');
    });

    socket.on('connect_error', (err) => {
      setStatus('disconnected');
      const msg = err?.message?.toLowerCase() || '';
      // If authentication failure, log out and prompt login
      if (
        msg.includes('auth') ||
        msg.includes('token') ||
        msg.includes('unauthorized') ||
        msg.includes('jwt')
      ) {
        logout();
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setStatus('disconnected');
    };
  }, [token, logout]);

  return (
    <SocketContext.Provider
      value={{
        socket: socketRef.current,
        status,
        isConnected: status === 'connected',
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
