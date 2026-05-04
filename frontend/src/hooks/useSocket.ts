import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useDispatch } from 'react-redux';
import { addNotification } from '../store/slices/notifSlice';
import { notification } from 'antd';

let socketInstance: Socket | null = null;

export function useSocket(token: string | null) {
  const dispatch = useDispatch();
  const ref = useRef<Socket | null>(null);

  useEffect(() => {
    if (!token) return;

    if (!socketInstance) {
      socketInstance = io('/', {
        auth: { token },
        transports: ['websocket', 'polling'],
      });
    }

    ref.current = socketInstance;

    socketInstance.on('notification', (data: any) => {
      dispatch(addNotification(data));
      notification.info({ message: data.title, description: data.content, duration: 4 });
    });

    socketInstance.on('gps:update', (data: any) => {
      // handled by map components via event
      window.dispatchEvent(new CustomEvent('gps:update', { detail: data }));
    });

    return () => {
      socketInstance?.off('notification');
      socketInstance?.off('gps:update');
    };
  }, [token, dispatch]);

  return ref.current;
}
