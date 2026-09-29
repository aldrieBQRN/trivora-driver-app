import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { driverApi } from '../services/api';
import { useDriverAuth } from './DriverAuthContext';
import { useDriverShift } from './DriverShiftContext';
import { useToast } from '../components/Toast';
import { QrSession } from '../types';

/**
 * QR Ride / Walk-in Ride session for the signed-in driver — separate from the normal booking
 * flow in DriverShiftContext, which it never changes. The backend (GET /driver/qr-session/active)
 * is the only source of truth: this polls it, and every action re-reads the session the server
 * returns rather than changing statuses locally.
 *
 * Passengers join by scanning the tricycle's QR in the Passenger app; the driver sees them here,
 * starts the ride, and drops each one off. GPS keeps coming from the existing shift tracker.
 */

/** Same cadence as the existing pending-request poll (DriverShiftContext PENDING_REQUEST_POLL_MS). */
const QR_SESSION_POLL_MS = 5000;

interface QrSessionContextType {
  session: QrSession | null;
  /** Booking code currently being acted on (drop-off / remove), or 'start' / 'end'. */
  busy: string | null;
  startRide: () => Promise<boolean>;
  dropOff: (bookingCode: string) => Promise<boolean>;
  removePassenger: (bookingCode: string) => Promise<boolean>;
  endRide: () => Promise<boolean>;
  refresh: () => Promise<void>;
  /** Take a session the server just returned from another action (a walk-in added via Manual Ride). */
  adopt: (next: QrSession) => void;
}

const QrSessionContext = createContext<QrSessionContextType | null>(null);

function errorMessage(err: any, fallback: string): string {
  if (err && err.status === undefined) return 'Could not reach Trivora. Check your connection and try again.';
  // Only the QR API's own coded rejections and authorization/validation messages are shown as-is;
  // anything else (a framework 404/500 page message) falls back to a safe generic message.
  const readable = err?.data?.code || [403, 409, 422].includes(err?.status);
  return readable && err?.data?.message ? err.data.message : fallback;
}

export function QrSessionProvider({ children }: { children: React.ReactNode }) {
  const { driver, isAuthenticated } = useDriverAuth();
  const { isOnline } = useDriverShift();
  const { showToast } = useToast();

  const [session, setSession] = useState<QrSession | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Booking codes this driver just removed/dropped off — their disappearance isn't announced as
  // "a passenger left".
  const ownActionsRef = useRef<Set<string>>(new Set());
  const knownRef = useRef<Map<string, string> | null>(null);

  /** Announces joins/leaves by comparing the passenger list with the previous server read. */
  const applySession = useCallback((next: QrSession | null, announce = true) => {
    const prev = knownRef.current;
    const nextMap = new Map((next?.passengers ?? []).map((p) => [p.booking_code, p.status]));
    if (announce && prev) {
      // Only QR joins are news — walk-in passengers are added by the driver themself.
      (next?.passengers ?? []).forEach((p) => {
        if (!prev.has(p.booking_code) && p.source !== 'walk_in') showToast('A QR passenger joined your ride.');
      });
      prev.forEach((status, code) => {
        if (!nextMap.has(code) && status === 'accepted' && !ownActionsRef.current.has(code)) {
          showToast('A passenger left your ride.', 'info');
        }
      });
    }
    knownRef.current = nextMap;
    setSession(next);
  }, [showToast]);

  const refresh = useCallback(async () => {
    try {
      const res = await driverApi.qrSessionActive();
      applySession(res?.ride ?? null);
    } catch {
      // Transient — the next poll tries again.
    }
  }, [applySession]);

  // Poll while the driver can have a session: online (a passenger may join at any moment) or
  // already in one (drop-offs must stay possible even if the driver went offline mid-ride).
  const hasSession = !!session;
  useEffect(() => {
    if (!isAuthenticated || !driver) {
      knownRef.current = null;
      setSession(null);
      return;
    }
    if (!isOnline && !hasSession) {
      // One read on launch/offline still resumes a session that is already open.
      refresh();
      return;
    }
    refresh();
    const interval = setInterval(refresh, QR_SESSION_POLL_MS);
    return () => clearInterval(interval);
  }, [isAuthenticated, driver?.id, isOnline, hasSession, refresh]);

  const run = useCallback(async (key: string, action: () => Promise<{ ride: QrSession | null }>, fallback: string) => {
    if (busy) return false;
    setBusy(key);
    try {
      const res = await action();
      // A completed/cancelled session is over — the driver is back to normal dispatch.
      const next = res?.ride && ['boarding', 'in_progress'].includes(res.ride.session.status) ? res.ride : null;
      applySession(next, false);
      return true;
    } catch (err: any) {
      showToast(errorMessage(err, fallback), 'info');
      await refresh();
      return false;
    } finally {
      setBusy(null);
    }
  }, [busy, applySession, refresh, showToast]);

  const startRide = useCallback(
    () => run('start', () => driverApi.qrSessionStart(), "Couldn't start the ride."),
    [run]
  );

  const dropOff = useCallback(async (bookingCode: string) => {
    ownActionsRef.current.add(bookingCode);
    return run(bookingCode, async () => {
      const res = await driverApi.qrDropOff(bookingCode);
      showToast(res.ride.session.status === 'completed' ? 'Last passenger dropped off — ride complete.' : 'Passenger dropped off.');
      return res;
    }, "Couldn't record the drop-off.");
  }, [run, showToast]);

  const removePassenger = useCallback(async (bookingCode: string) => {
    ownActionsRef.current.add(bookingCode);
    return run(bookingCode, async () => {
      const res = await driverApi.qrRemovePassenger(bookingCode);
      showToast('Passenger removed.', 'info');
      return res;
    }, "Couldn't remove the passenger.");
  }, [run, showToast]);

  const endRide = useCallback(
    () => run('end', () => driverApi.qrSessionEnd(), "Couldn't end the ride."),
    [run]
  );

  const adopt = useCallback((next: QrSession) => applySession(next, false), [applySession]);

  return (
    <QrSessionContext.Provider value={{ session, busy, startRide, dropOff, removePassenger, endRide, refresh, adopt }}>
      {children}
    </QrSessionContext.Provider>
  );
}

export function useQrSession(): QrSessionContextType {
  const ctx = useContext(QrSessionContext);
  if (!ctx) throw new Error('useQrSession must be used within a QrSessionProvider');
  return ctx;
}
