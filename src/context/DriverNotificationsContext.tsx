import React, { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useDriverAuth } from './DriverAuthContext';
import { driverApi, mapNotificationRecord } from '../services/api';
import {
  configureNotificationHandler,
  dismissPresentedByNotificationId,
  extractPushData,
  getExpoPushTokenSafe,
  PushData,
  setAppBadgeCount,
} from '../services/pushNotifications';
import { AppNotificationItem } from '../types';

/** Where a tapped notification should take the driver — App.tsx performs the navigation. */
export interface NotificationTarget {
  event: string | null;
  recordType: string | null;
  recordId: number | string | null;
}

interface DriverNotificationsContextType {
  notifications: AppNotificationItem[];
  unreadCount: number;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  /** The notification center sheet (NotificationsModal), opened from the dashboard bell or a tap. */
  isCenterOpen: boolean;
  openCenter: () => void;
  closeCenter: () => void;
  /** Marks the item read, closes the center and hands its target to App.tsx. */
  openNotification: (item: AppNotificationItem) => void;
  pendingTarget: NotificationTarget | null;
  clearPendingTarget: () => void;
}

// While the app is open the list also refreshes on this cadence, so it stays current even on a
// build/device without push (Expo Go, denied permission). Foregrounding and every received push
// refresh it immediately.
const REFRESH_INTERVAL_MS = 30000;

configureNotificationHandler();

const DriverNotificationsContext = createContext<DriverNotificationsContextType | null>(null);

/**
 * The driver's persistent notifications (backend: AppNotificationController) plus phone push
 * registration. The backend list is the source of truth — pushes only trigger a refresh or carry
 * a tap target — so a notification missed by the OS is still in the list on the next open.
 */
export function DriverNotificationsProvider({ children }: { children: ReactNode }) {
  const { driver, isAuthenticated } = useDriverAuth();
  const [notifications, setNotifications] = useState<AppNotificationItem[]>([]);
  const notificationsRef = useRef(notifications);
  notificationsRef.current = notifications;
  const [unreadCount, setUnreadCount] = useState(0);
  const [isCenterOpen, setIsCenterOpen] = useState(false);
  const [pendingTarget, setPendingTarget] = useState<NotificationTarget | null>(null);

  const signedIn = isAuthenticated && !!driver;
  const signedInRef = useRef(signedIn);
  signedInRef.current = signedIn;
  // A tap that cold-started the app can arrive before the session is restored; held until then.
  const queuedTapRef = useRef<PushData | null>(null);
  const registeredTokenRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!signedInRef.current) return;
    try {
      const res: any = await driverApi.getNotifications();
      if (!signedInRef.current) return;
      setNotifications((res?.notifications || []).map(mapNotificationRecord));
      setUnreadCount(Number(res?.unread_count ?? 0));
    } catch {
      // Offline or server error — keep the last list; the next refresh catches up.
    }
  }, []);

  const markRead = useCallback(async (id: string) => {
    const wasUnread = notificationsRef.current.some((n) => n.id === id && !n.read);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    if (wasUnread) setUnreadCount((c) => Math.max(0, c - 1));
    dismissPresentedByNotificationId(id);
    try {
      const res: any = await driverApi.markNotificationRead(id);
      if (res?.unread_count != null) setUnreadCount(Number(res.unread_count));
    } catch {
      refresh();
    }
  }, [refresh]);

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    try {
      await driverApi.markAllNotificationsRead();
    } catch {
      refresh();
    }
  }, [refresh]);

  const handleTap = useCallback((data: PushData) => {
    if (data.app && data.app !== 'driver') return;
    if (data.notification_id) markRead(String(data.notification_id));
    setIsCenterOpen(false);
    setPendingTarget({
      event: data.event ?? null,
      recordType: data.record_type ?? null,
      recordId: data.record_id ?? null,
    });
  }, [markRead]);

  const openNotification = useCallback((item: AppNotificationItem) => {
    if (!item.read) markRead(item.id);
    setIsCenterOpen(false);
    setPendingTarget({ event: item.event, recordType: item.recordType, recordId: item.recordId });
  }, [markRead]);

  const registerPushToken = useCallback(async () => {
    if (!signedInRef.current) return;
    const token = await getExpoPushTokenSafe();
    if (!token || !signedInRef.current) return;
    try {
      await driverApi.registerPushToken(token, Platform.OS);
      registeredTokenRef.current = token;
    } catch {
      registeredTokenRef.current = null; // retried on the next foreground
    }
  }, []);

  // Session start/end: load the list and register this phone; on logout clear everything local
  // (the server already dropped this session's push token in /driver/logout).
  useEffect(() => {
    if (!signedIn) {
      setNotifications([]);
      setUnreadCount(0);
      setIsCenterOpen(false);
      setPendingTarget(null);
      registeredTokenRef.current = null;
      setAppBadgeCount(0);
      if (Platform.OS !== 'web') Notifications.dismissAllNotificationsAsync().catch(() => {});
      return;
    }

    refresh();
    registerPushToken();
    if (queuedTapRef.current) {
      handleTap(queuedTapRef.current);
      queuedTapRef.current = null;
    }

    const interval = setInterval(() => {
      if (AppState.currentState === 'active') refresh();
    }, REFRESH_INTERVAL_MS);
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      refresh();
      if (!registeredTokenRef.current) registerPushToken();
    });

    return () => {
      clearInterval(interval);
      appStateSub.remove();
    };
  }, [signedIn, driver?.id, refresh, registerPushToken, handleTap]);

  // Push listeners — registered once for the app's lifetime.
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const onTap = (response: Notifications.NotificationResponse) => {
      const data = extractPushData(response.notification.request.content.data);
      if (data.type === 'dismiss') return;
      if (signedInRef.current) handleTap(data);
      else queuedTapRef.current = data;
      Notifications.clearLastNotificationResponse();
    };

    // A tap that launched the app from a closed state.
    const launchResponse = Notifications.getLastNotificationResponse();
    if (launchResponse) onTap(launchResponse);

    const receivedSub = Notifications.addNotificationReceivedListener(() => refresh());
    const responseSub = Notifications.addNotificationResponseReceivedListener(onTap);
    // The device's push token can rotate; register the new Expo token for this session.
    const tokenSub = Notifications.addPushTokenListener(() => {
      registeredTokenRef.current = null;
      registerPushToken();
    });

    return () => {
      receivedSub.remove();
      responseSub.remove();
      tokenSub.remove();
    };
  }, [refresh, handleTap, registerPushToken]);

  useEffect(() => {
    if (signedIn) setAppBadgeCount(unreadCount);
  }, [signedIn, unreadCount]);

  return (
    <DriverNotificationsContext.Provider
      value={{
        notifications,
        unreadCount,
        refresh,
        markRead,
        markAllRead,
        isCenterOpen,
        openCenter: () => {
          setIsCenterOpen(true);
          refresh();
        },
        closeCenter: () => setIsCenterOpen(false),
        openNotification,
        pendingTarget,
        clearPendingTarget: () => setPendingTarget(null),
      }}
    >
      {children}
    </DriverNotificationsContext.Provider>
  );
}

export function useDriverNotifications(): DriverNotificationsContextType {
  const ctx = useContext(DriverNotificationsContext);
  if (!ctx) throw new Error('useDriverNotifications must be used within a DriverNotificationsProvider');
  return ctx;
}
