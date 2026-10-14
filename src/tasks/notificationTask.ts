import { Platform } from 'react-native';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import { dismissPresentedByGroup, extractPushData } from '../services/pushNotifications';

/**
 * Receives pushes while the app is backgrounded or closed. Its only job is the silent "dismiss"
 * message the backend sends when a ride request is no longer available to this driver (another
 * driver accepted it, it expired or was cancelled — see App\Services\AppNotifier::withdraw): the
 * matching ride-request notification is removed from the phone's tray. Visible notifications are
 * displayed by the OS itself and need nothing from here.
 *
 * Best-effort by nature — the OS may delay or drop a background delivery (Doze, battery savers,
 * force-stopped app). The pending-requests poll (DriverShiftContext) clears any leftover the next
 * time the app is open, and accepting a stale request is always rejected by the backend.
 *
 * Like locationTask.ts, defineTask() must run at module load; index.ts imports this file before
 * the app renders so the task exists for a headless relaunch.
 */
export const BACKGROUND_NOTIFICATION_TASK = 'trivora-driver-notification-task';

if (Platform.OS !== 'web') {
  TaskManager.defineTask<Notifications.NotificationTaskPayload>(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }) => {
    if (error || !data || 'actionIdentifier' in data) return;
    const payload = extractPushData((data as { data?: unknown }).data);
    if (payload.type === 'dismiss' && payload.group) {
      await dismissPresentedByGroup(payload.group);
    }
  });

  Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK).catch((err) => {
    if (__DEV__) console.warn('[push] background notification task not registered:', err?.message || err);
  });
}
