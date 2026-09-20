import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DriverProfile, VerifiedOperatorData } from '../types';
import { setAuthToken, setOnUnauthorized, driverApi, mapAuthResponseToDriverProfile } from '../services/api';

const SESSION_STORAGE_KEY = '@trivora_driver_session';

interface DriverAuthContextType {
  driver: DriverProfile | null;
  isAuthenticated: boolean;
  /** True while a persisted session is still being restored on app start — callers should hold
   * off rendering the logged-out (onboarding/auth) screens until this settles, otherwise a
   * returning driver flashes through the login flow every time the app cold-starts. */
  isRestoring: boolean;
  verifiedFranchise: VerifiedOperatorData | null;
  login: (driverData: DriverProfile, token?: string | null) => void;
  logout: () => void;
  updateProfile: (fields: Partial<DriverProfile>) => void;
  /** Silently refetches the driver's own profile (license/TODA zone/tricycle assignment etc. —
   * anything an admin/TMO action could change server-side) and replaces `driver` with the fresh
   * result. No loading flag: callers use this to update an already-visible screen, not to gate a
   * spinner. Ride-derived stats (rating/completed rides/earnings) are unaffected by this — those
   * already come from DriverShiftContext's own continuously-polled historyList, not from here. */
  refreshProfile: () => Promise<void>;
  verifyFranchiseEligibility: (
    licenseNumber: string,
    dob?: string | null,
    plateOrBodyNumber?: string | null
  ) => Promise<VerifiedOperatorData>;
  setDriver: React.Dispatch<React.SetStateAction<DriverProfile | null>>;
}

const DriverAuthContext = createContext<DriverAuthContextType | null>(null);

export function DriverAuthProvider({ children }: { children: ReactNode }) {
  const [driver, setDriver] = useState<DriverProfile | null>(null);

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isRestoring, setIsRestoring] = useState<boolean>(true);
  const [verifiedFranchise, setVerifiedFranchise] = useState<VerifiedOperatorData | null>(null);
  // Mirrors the token currently held by api.ts's module-level authToken (which has no getter) so
  // updateProfile — called from screens with no token of its own — can still keep the persisted
  // session's cached profile in sync without re-threading the token through every call site.
  const tokenRef = useRef<string | null>(null);

  const persistSession = async (driverData: DriverProfile, token: string | null) => {
    if (!token) return;
    try {
      await AsyncStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ token, driver: driverData }));
    } catch {
      // Persistence is a convenience (staying logged in across a restart) — a failed write just
      // means this session won't survive one, not something to surface to the driver.
    }
  };

  const login = (driverData: DriverProfile, token: string | null = null) => {
    setDriver(driverData);
    setIsAuthenticated(true);
    if (token) {
      tokenRef.current = token;
      setAuthToken(token);
      persistSession(driverData, token);
    }
  };

  const logout = () => {
    driverApi.logout().catch(() => {});
    setDriver(null);
    setIsAuthenticated(false);
    tokenRef.current = null;
    setAuthToken(null);
    AsyncStorage.removeItem(SESSION_STORAGE_KEY).catch(() => {});
  };

  useEffect(() => {
    setOnUnauthorized(() => {
      logout();
    });
    return () => {
      setOnUnauthorized(null);
    };
  }, []);

  const updateProfile = (fields: Partial<DriverProfile>) => {
    setDriver((prev) => {
      const next = prev ? { ...prev, ...fields } : null;
      if (next) persistSession(next, tokenRef.current).catch(() => {});
      return next;
    });
  };

  const refreshProfile = async () => {
    if (!isAuthenticated) return;
    try {
      const res: any = await driverApi.me();
      setDriver((prev) => {
        const fresh = mapAuthResponseToDriverProfile(res, prev?.email);
        persistSession(fresh, tokenRef.current).catch(() => {});
        return fresh;
      });
    } catch {
      // Background refresh — a transient failure just leaves the screen showing what it had.
    }
  };

  // Restores a session left behind by a previous run (app relaunch after being killed by the OS
  // while backgrounded, or a web tab reloaded after being reclaimed) — simply minimizing the app
  // or switching away from it does NOT tear down this in-memory state on its own, so this only
  // matters for that harder cold-start case, not routine backgrounding. Once `driver` is set here,
  // DriverShiftContext's own existing "restore an in-progress ride" effect (keyed on driver?.id)
  // takes over resuming any active booking — nothing extra needed for that here.
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(SESSION_STORAGE_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw) as { token: string; driver: DriverProfile };
        if (!saved?.token) return;

        tokenRef.current = saved.token;
        setAuthToken(saved.token);
        try {
          const res: any = await driverApi.me();
          const freshDriver = mapAuthResponseToDriverProfile(res, saved.driver?.email);
          setDriver(freshDriver);
          setIsAuthenticated(true);
          persistSession(freshDriver, saved.token);
        } catch (err: any) {
          if (err?.status === 401) {
            // Token actually revoked/expired server-side — the only case where restoring a
            // session should fall back to logged-out instead of trusting the cached copy.
            tokenRef.current = null;
            setAuthToken(null);
            await AsyncStorage.removeItem(SESSION_STORAGE_KEY);
          } else {
            // Backend unreachable or a transient error — trust the cached profile rather than
            // forcing the driver to log in again over a connectivity hiccup.
            setDriver(saved.driver);
            setIsAuthenticated(true);
          }
        }
      } catch {
        // Corrupt/unreadable storage — proceed logged-out, same as a first-ever launch.
      } finally {
        setIsRestoring(false);
      }
    })();
  }, []);

  const verifyFranchiseEligibility = async (
    franchiseNumber: string,
    dob: string | null = null
  ): Promise<VerifiedOperatorData> => {
    let res: any;
    try {
      res = await driverApi.verifyEligibility(franchiseNumber, dob);
    } catch (err: any) {
      if (err?.status !== undefined) {
        // The backend was reached and rejected the request outright (e.g. 422/500) — a real
        // failure, not a connectivity issue. Surface it instead of faking a pass.
        throw err;
      }
      // Backend unreachable — fall back to local demo data so the registration flow stays
      // testable without a running API, matching the rest of this app's offline-demo behavior.
      const mockVerified: VerifiedOperatorData = {
        success: true,
        eligible: true,
        verification_token: 'tk_demo_' + Date.now(),
        date_of_birth: dob || undefined,
        franchise_number: franchiseNumber.toUpperCase(),
        operator: {
          id: 201,
          full_name: 'JUAN DELA CRUZ',
          license_number: 'D01-12-345678',
          toda_zone: 'TODA Bucana',
          barangay: 'Bucana, Nasugbu Batangas',
        },
        tricycle: {
          id: 501,
          plate_number: 'ABC 1234',
          body_number: '04-128',
          status: 'active',
          make_model: 'Kawasaki Barako II',
          toda_zone: 'TODA Bucana',
        },
      };
      setVerifiedFranchise(mockVerified);
      return mockVerified;
    }

    if (res && res.success && res.eligible) {
      // The backend doesn't echo the submitted DOB back — carry it forward here so
      // DriverRegistrationScreen can resend it for the server to independently re-verify.
      const verified: VerifiedOperatorData = { ...res, date_of_birth: dob || undefined };
      setVerifiedFranchise(verified);
      return verified;
    }

    // The backend responded successfully but says this record isn't eligible — a real
    // rejection, not something to silently paper over.
    throw new Error(res?.message || 'No active MTOP municipal franchise found for this record.');
  };

  return (
    <DriverAuthContext.Provider
      value={{
        driver,
        isAuthenticated,
        isRestoring,
        verifiedFranchise,
        login,
        logout,
        updateProfile,
        refreshProfile,
        verifyFranchiseEligibility,
        setDriver,
      }}
    >
      {children}
    </DriverAuthContext.Provider>
  );
}

export function useDriverAuth(): DriverAuthContextType {
  const context = useContext(DriverAuthContext);
  if (!context) {
    throw new Error('useDriverAuth must be used within a DriverAuthProvider');
  }
  return context;
}
