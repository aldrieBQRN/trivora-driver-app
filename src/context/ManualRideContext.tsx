import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { driverApi } from '../services/api';
import { useDriverAuth } from './DriverAuthContext';
import { useToast } from '../components/Toast';
import { useQrSession } from './QrSessionContext';
import { ManualRide, ManualRideQuote } from '../types';

/**
 * Manual Ride — the driver adds a walk-in passenger who has no app and doesn't scan a QR. The
 * passenger joins the tricycle's one ride session (QrSessionContext), alongside any QR passengers.
 * The server decides the pick-up (the driver's own fresh GPS), distance and fare; this only
 * carries the destination, party size and the signed quote. GPS keeps coming from the existing
 * shift tracker — nothing here tracks location.
 *
 * `ride` / complete / cancel only cover a legacy stand-alone Manual Ride started before mixed
 * sessions, so such a trip can still be finished.
 */

export interface ManualRideError {
  code: string | null;
  message: string;
}

interface ManualRideContextType {
  /** A legacy stand-alone Manual Ride in progress (from the server), or null. */
  ride: ManualRide | null;
  /** Whether the Manual Ride screen is showing (add a walk-in, or a legacy ride in progress). */
  isOpen: boolean;
  open: () => void;
  close: () => void;
  quote: (
    input: { party_size: number; dropoff_name: string; dropoff_lat: number; dropoff_lng: number },
    options?: { signal?: AbortSignal }
  ) => Promise<ManualRideQuote>;
  /** Add the walk-in passenger (signed quote) to the tricycle's ride session. */
  add: (signedQuote: string, paymentMethod?: string) => Promise<void>;
  complete: () => Promise<boolean>;
  cancel: (reason?: string) => Promise<boolean>;
  /** 'add' | 'complete' | 'cancel' while a request is running. */
  busy: string | null;
}

const ManualRideContext = createContext<ManualRideContextType | null>(null);

/** Only the API's own rejections (coded, or 403/409/422) are shown as-is; anything else is generic. */
export function toManualRideError(err: any, fallback: string): ManualRideError {
  if (err && err.status === undefined) {
    return { code: 'network', message: 'Could not reach Trivora. Check your connection and try again.' };
  }
  const readable = err?.data?.code || [403, 409, 422].includes(err?.status);
  return { code: err?.data?.code ?? null, message: readable && err?.data?.message ? err.data.message : fallback };
}

export function ManualRideProvider({ children }: { children: React.ReactNode }) {
  const { driver, isAuthenticated } = useDriverAuth();
  const { showToast } = useToast();
  const { adopt: adoptSession } = useQrSession();
  const [ride, setRide] = useState<ManualRide | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const busyRef = useRef<string | null>(null);

  // Resume an in-progress ride after the app is reopened (the server is the source of truth).
  useEffect(() => {
    if (!isAuthenticated || !driver) {
      setRide(null);
      setIsOpen(false);
      return;
    }
    let cancelled = false;
    driverApi
      .manualRideActive()
      .then((res) => {
        if (cancelled) return;
        setRide(res?.ride ?? null);
        if (res?.ride) setIsOpen(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, driver?.id]);

  const run = useCallback(async <T,>(key: string, fn: () => Promise<T>): Promise<T> => {
    if (busyRef.current) throw new Error('busy');
    busyRef.current = key;
    setBusy(key);
    try {
      return await fn();
    } finally {
      busyRef.current = null;
      setBusy(null);
    }
  }, []);

  const quote = useCallback(
    (
      input: { party_size: number; dropoff_name: string; dropoff_lat: number; dropoff_lng: number },
      options?: { signal?: AbortSignal }
    ) => driverApi.manualRideQuote(input, options),
    []
  );

  // Adds the walk-in passenger to the tricycle's one ride session (QR passengers may share it) and
  // hands the session to QrSessionContext, whose screen then runs Start / Drop Off for everyone.
  // A retry after a dropped connection re-sends the same quote, which the server recognises, so
  // the passenger is never added twice.
  const add = useCallback(async (signedQuote: string, paymentMethod?: string) => {
    await run('add', async () => {
      const res = await driverApi.manualRideAdd(signedQuote, paymentMethod);
      adoptSession(res.ride);
      setIsOpen(false);
      showToast('Walk-in passenger added.');
    });
  }, [run, showToast, adoptSession]);

  const finish = useCallback(async (key: 'complete' | 'cancel', action: (code: string) => Promise<{ ride: ManualRide }>, doneMessage: string, fallback: string) => {
    const current = ride;
    if (!current) return false;
    try {
      await run(key, () => action(current.booking_code));
      setRide(null);
      setIsOpen(false);
      showToast(doneMessage);
      return true;
    } catch (err: any) {
      if (err?.message === 'busy') return false;
      const error = toManualRideError(err, fallback);
      // Connection dropped: the request may still have gone through. Re-read the ride so the
      // screen reflects what actually happened (complete/cancel are retry-safe server-side).
      if (error.code === 'network') {
        const active = await driverApi.manualRideActive().catch(() => undefined);
        if (active && active.ride?.booking_code !== current.booking_code) {
          setRide(null);
          setIsOpen(false);
          showToast(doneMessage);
          return true;
        }
      }
      showToast(error.message, 'info');
      return false;
    }
  }, [ride, run, showToast]);

  const complete = useCallback(
    () => finish('complete', (code) => driverApi.manualRideComplete(code), 'Manual Ride completed. Collect the fare in cash.', "Couldn't complete the ride."),
    [finish]
  );

  const cancel = useCallback(
    (reason?: string) => finish('cancel', (code) => driverApi.manualRideCancel(code, reason), 'Manual Ride cancelled.', "Couldn't cancel the ride."),
    [finish]
  );

  const open = useCallback(() => setIsOpen(true), []);
  // An in-progress ride keeps its screen reachable from Home (resume bar); closing only hides it.
  const close = useCallback(() => setIsOpen(false), []);

  return (
    <ManualRideContext.Provider value={{ ride, isOpen, open, close, quote, add, complete, cancel, busy }}>
      {children}
    </ManualRideContext.Provider>
  );
}

export function useManualRide(): ManualRideContextType {
  const ctx = useContext(ManualRideContext);
  if (!ctx) throw new Error('useManualRide must be used within a ManualRideProvider');
  return ctx;
}
