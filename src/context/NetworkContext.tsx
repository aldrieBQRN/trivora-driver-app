import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { getApiBaseUrl } from '../services/api';

interface NetworkContextType {
  isConnected: boolean;
  isChecking: boolean;
  checkConnection: () => Promise<boolean>;
}

const NetworkContext = createContext<NetworkContextType>({
  isConnected: true,
  isChecking: false,
  checkConnection: async () => true,
});

export const useNetwork = () => useContext(NetworkContext);

interface NetworkProviderProps {
  children: React.ReactNode;
}

export function NetworkProvider({ children }: NetworkProviderProps) {
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const isCheckingRef = useRef<boolean>(false);
  const failCountRef = useRef<number>(0);

  const checkConnection = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && !navigator.onLine) {
      setIsConnected(false);
      return false;
    }

    if (isCheckingRef.current) return isConnected;
    isCheckingRef.current = true;
    setIsChecking(true);

    try {
      // 1. First test Render backend directly with an 8s timeout
      const backendController = new AbortController();
      const backendTimer = setTimeout(() => backendController.abort(), 8000);

      try {
        const res = await fetch(`${getApiBaseUrl()}/health`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: backendController.signal,
        });
        clearTimeout(backendTimer);
        if (res && res.status < 500) {
          failCountRef.current = 0;
          setIsConnected(true);
          return true;
        }
      } catch {
        clearTimeout(backendTimer);
      }

      // 2. Fallback: test public internet via google.com with a fresh controller
      const publicController = new AbortController();
      const publicTimer = setTimeout(() => publicController.abort(), 5000);

      try {
        const ping = await fetch('https://www.google.com', {
          method: 'GET',
          signal: publicController.signal,
        });
        clearTimeout(publicTimer);
        if (ping) {
          failCountRef.current = 0;
          setIsConnected(true);
          return true;
        }
      } catch {
        clearTimeout(publicTimer);
      }

      // Only mark disconnected after 2 consecutive failures to avoid spurious blips
      failCountRef.current += 1;
      if (failCountRef.current >= 2) {
        setIsConnected(false);
        return false;
      }
      return true;
    } finally {
      isCheckingRef.current = false;
      setIsChecking(false);
    }
  }, [isConnected]);

  useEffect(() => {
    // Initial check after a short 1.5s grace period on mount
    const initialTimer = setTimeout(() => {
      checkConnection();
    }, 1500);

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const handleOnline = () => {
        failCountRef.current = 0;
        setIsConnected(true);
        checkConnection();
      };
      const handleOffline = () => {
        setIsConnected(false);
      };

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      return () => {
        clearTimeout(initialTimer);
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }

    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        checkConnection();
      }
    });

    const interval = setInterval(() => {
      checkConnection();
    }, 30000);

    return () => {
      clearTimeout(initialTimer);
      subscription.remove();
      clearInterval(interval);
    };
  }, [checkConnection]);

  return (
    <NetworkContext.Provider value={{ isConnected, isChecking, checkConnection }}>
      {children}
    </NetworkContext.Provider>
  );
}
