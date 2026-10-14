import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { COLORS } from '../constants/theme';

/**
 * Phone (push) notification plumbing shared by DriverNotificationsContext and the background
 * notification task (src/tasks/notificationTask.ts). The in-app list itself always comes from the
 * backend (driverApi.getNotifications) — a push is only ever a prompt to look at it, so nothing
 * here is the source of truth for whether a booking is still available.
 *
 * Every function is best-effort and never throws: web, simulators, Expo Go (no remote push on
 * Android since SDK 53), a denied permission or a build without push credentials all simply mean
 * "no phone notifications" while the in-app list keeps working.
 */

// Must match the channelId the backend sends (App\Services\AppNotifier).
export const ANDROID_CHANNEL_ID = 'default';

/** The `data` object the backend attaches to every push (see AppNotifier). */
export interface PushData {
  type?: string; // 'dismiss' for the silent "take this back" message
  notification_id?: string;
  app?: string;
  event?: string;
  record_type?: string | null;
  record_id?: number | string | null;
  group?: string | null;
}

const parseObject = (value: unknown): Record<string, any> | null => {
  if (value && typeof value === 'object') return value as Record<string, any>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
};

/**
 * Normalises a push payload to PushData. A presented notification exposes it directly as
 * `content.data`, but a headless background delivery wraps it differently per platform (an FCM
 * `dataString`, or the Expo `body` field holding the JSON), so every known wrapper is unwrapped.
 */
export function extractPushData(raw: unknown): PushData {
  let data = parseObject(raw) ?? {};
  if (typeof data.dataString === 'string') data = parseObject(data.dataString) ?? data;
  const body = parseObject(data.body);
  if (body && (body.type || body.event)) data = body;
  return data as PushData;
}

export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: 'Trivora alerts',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: COLORS.primary,
    });
  } catch {}
}

/** Dismisses every notification in the phone's tray whose push data matches. */
export async function dismissPresentedWhere(predicate: (data: PushData) => boolean): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    await Promise.all(
      presented
        .filter((n) => predicate(extractPushData(n.request.content.data)))
        .map((n) => Notifications.dismissNotificationAsync(n.request.identifier).catch(() => {}))
    );
  } catch {}
}

export const dismissPresentedByGroup = (group: string) => dismissPresentedWhere((d) => d.group === group);

export const dismissPresentedByNotificationId = (id: string) =>
  dismissPresentedWhere((d) => d.notification_id === id);

/**
 * Removes ride-request notifications from the tray once the backend no longer offers that
 * booking to this driver (accepted by someone else, expired or cancelled). Driven by the pending
 * requests poll — the authoritative list — so it still works when the silent dismiss push was
 * never delivered.
 */
export const dismissStaleBookingRequests = (activeBookingIds: Array<number | string>) => {
  const active = new Set(activeBookingIds.map(String));
  return dismissPresentedWhere(
    (d) => d.event === 'booking_request' && d.record_id != null && !active.has(String(d.record_id))
  );
};

let handlerConfigured = false;

/**
 * How a push is shown while the app is open: normal notifications still appear as a banner (so a
 * ride request is noticed on any screen), while the silent dismiss message is never shown and
 * instead clears the matching tray notification.
 */
export function configureNotificationHandler(): void {
  if (Platform.OS === 'web' || handlerConfigured) return;
  handlerConfigured = true;
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = extractPushData(notification.request.content.data);
      if (data.type === 'dismiss') {
        if (data.group) dismissPresentedByGroup(data.group);
        return { shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false };
      }
      return { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true };
    },
  });
}

/**
 * Asks for notification permission (once — a denial is respected) and returns this device's Expo
 * push token, or null when phone notifications aren't available.
 */
export async function getExpoPushTokenSafe(): Promise<string | null> {
  if (Platform.OS === 'web' || !Device.isDevice) return null;
  try {
    await ensureAndroidChannel();
    let settings = await Notifications.getPermissionsAsync();
    const isAllowed = (s: Notifications.NotificationPermissionsStatus) =>
      s.granted || s.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    if (!isAllowed(settings) && settings.canAskAgain) {
      settings = await Notifications.requestPermissionsAsync();
    }
    if (!isAllowed(settings)) return null;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return null;
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data || null;
  } catch (err) {
    if (__DEV__) console.warn('[push] Expo push token unavailable:', (err as Error)?.message || err);
    return null;
  }
}

export async function setAppBadgeCount(count: number): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.setBadgeCountAsync(Math.max(0, count));
  } catch {}
}
