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

  const checkConnection = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && !navigator.onLine) {
      setIsConnected(false);
      return false;
    }

    if (isCheckingRef.current) return isConnected;
    isCheckingRef.current = true;
    setIsChecking(true);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      // Fast ping against the backend public endpoint or fallback
      const pingUrl = `${getApiBaseUrl()}/toda-zones`;
      const res = await fetch(pingUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      }).catch(async () => {
        return await fetch('https://www.google.com/generate_204', {
          method: 'HEAD',
          signal: controller.signal,
          mode: 'no-cors',
        });
      });

      clearTimeout(timeoutId);

      const online = !!res;
      setIsConnected(online);
      return online;
    } catch {
      setIsConnected(false);
      return false;
    } finally {
      isCheckingRef.current = false;
      setIsChecking(false);
    }
  }, [isConnected]);

  useEffect(() => {
    // Initial connectivity check on mount
    checkConnection();

    // Listen to Web online/offline events if on web
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const handleOnline = () => {
        setIsConnected(true);
        checkConnection();
      };
      const handleOffline = () => {
        setIsConnected(false);
      };

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }

    // Listen to AppState (when app comes back from background to active foreground)
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        checkConnection();
      }
    });

    // Heartbeat check every 25 seconds
    const interval = setInterval(() => {
      checkConnection();
    }, 25000);

    return () => {
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
