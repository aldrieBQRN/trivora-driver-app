import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Platform, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { DriverAuthProvider, useDriverAuth } from './src/context/DriverAuthContext';
import { DriverShiftProvider, useDriverShift } from './src/context/DriverShiftContext';
import { QrSessionProvider, useQrSession } from './src/context/QrSessionContext';
import { ManualRideProvider, useManualRide } from './src/context/ManualRideContext';
import { NetworkProvider } from './src/context/NetworkContext';
import { ToastProvider } from './src/components/Toast';
import OfflineBanner from './src/components/OfflineBanner';
import { COLORS, RADIUS, SPACING } from './src/constants/theme';

const DRIVER_ONBOARDING_STORAGE_KEY = '@trivora_driver_onboarding_done';

// Auth flow screens
import DriverOnboardingScreen from './src/screens/DriverOnboardingScreen';
import DriverAuthScreen from './src/screens/DriverAuthScreen';
import DriverFranchiseVerificationScreen from './src/screens/DriverFranchiseVerificationScreen';
import DriverRegistrationScreen from './src/screens/DriverRegistrationScreen';
import DriverSetPasswordScreen from './src/screens/DriverSetPasswordScreen';

// Main app screens
import DriverDashboardScreen from './src/screens/DriverDashboardScreen';
import DriverDispatchScreen from './src/screens/DriverDispatchScreen';
import DriverEnRoutePickupScreen from './src/screens/DriverEnRoutePickupScreen';
import DriverInTransitScreen from './src/screens/DriverInTransitScreen';
import DriverFareCollectScreen from './src/screens/DriverFareCollectScreen';
import DriverEarningsScreen from './src/screens/DriverEarningsScreen';
import ViolationsHistoryScreen from './src/screens/ViolationsHistoryScreen';
import RideHistoryScreen from './src/screens/RideHistoryScreen';
import DriverProfileScreen from './src/screens/DriverProfileScreen';
import TelematicsSettingsScreen from './src/screens/TelematicsSettingsScreen';
import DriverQrSessionScreen from './src/screens/DriverQrSessionScreen';
import DriverManualRideScreen from './src/screens/DriverManualRideScreen';

import { Home, Receipt, ShieldAlert, TrendingUp, User, LucideIcon } from 'lucide-react-native';
import { PendingAccountInfo } from './src/types';

type AuthScreenKey = 'splash' | 'login' | 'verify' | 'register' | 'set_password';
type PrimaryTab = 'home' | 'trips' | 'violations' | 'earnings' | 'profile';
type PushedScreen = 'tracking_settings' | null;

interface TabButtonProps {
  label: string;
  icon: LucideIcon;
  isActive: boolean;
  onPress: () => void;
}

function TabButton({ label, icon: Icon, isActive, onPress }: TabButtonProps) {
  return (
    <TouchableOpacity style={styles.tabButton} onPress={onPress} activeOpacity={0.6}>
      <View style={styles.tabIndicatorTrack}>
        {isActive && <View style={styles.tabIndicator} />}
      </View>
      <Icon size={22} color={isActive ? COLORS.primary : COLORS.textMuted} strokeWidth={isActive ? 2.2 : 1.8} />
      <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function DriverAppNavigator() {
  const { isAuthenticated, isRestoring } = useDriverAuth();
  const { rideState, incomingBooking, setRideState, setIncomingBooking, setActiveBooking } = useDriverShift();
  const { session: qrSession } = useQrSession();
  // Manual Ride (walk-in passenger without the app): its screen opens from Home or on resume.
  const { isOpen: isManualRideVisible } = useManualRide();
  const insets = useSafeAreaInsets();

  // Walk-in (Scan to Ride) session screen: opens by itself when the first passenger joins; the
  // driver can step back to Home (e.g. to go offline) and reopen it from there.
  const [isQrSessionOpen, setIsQrSessionOpen] = useState(true);
  const hasQrSession = !!qrSession;
  useEffect(() => {
    if (hasQrSession) setIsQrSessionOpen(true);
  }, [hasQrSession]);
  const isQrSessionVisible = hasQrSession && isQrSessionOpen;
  // Leaving Manual Ride (walk-in added, or backed out) lands on the ride session if one is open.
  useEffect(() => {
    if (!isManualRideVisible && hasQrSession) setIsQrSessionOpen(true);
  }, [isManualRideVisible]);

  const [authScreen, setAuthScreen] = useState<AuthScreenKey>('splash');
  const [activeTab, setActiveTab] = useState<PrimaryTab>('home');
  const [pushedScreen, setPushedScreen] = useState<PushedScreen>(null);
  // Collected on the registration flow's "Account Info" step, carried to the separate "Create
  // Password" step — and kept here (rather than inside either screen) so navigating back from
  // Create Password to Account Info doesn't lose what was already entered.
  const [pendingAccountInfo, setPendingAccountInfo] = useState<PendingAccountInfo | null>(null);

  // Track previous authentication state to detect logout vs initial load
  const wasAuthenticatedRef = useRef(false);

  // Restore onboarding completion flag from storage on launch
  useEffect(() => {
    AsyncStorage.getItem(DRIVER_ONBOARDING_STORAGE_KEY)
      .then((val) => {
        if (val === 'true') {
          setAuthScreen((prev) => (prev === 'splash' ? 'login' : prev));
        }
      })
      .catch(() => {});
  }, []);

  // Sync auth transitions:
  // - On logout: go directly to Login page (DriverAuthScreen), clear pushed screens, reset tab to 'home'
  // - On login: always land on the home page (DriverDashboardScreen)
  useEffect(() => {
    if (isAuthenticated) {
      wasAuthenticatedRef.current = true;
      AsyncStorage.setItem(DRIVER_ONBOARDING_STORAGE_KEY, 'true').catch(() => {});
      setActiveTab('home');
      setPushedScreen(null);
    } else if (wasAuthenticatedRef.current) {
      // User just logged out:
      // 1. Immediately go to the login screen
      setAuthScreen('login');
      // 2. Reset tab to home and clear pushed screens
      setActiveTab('home');
      setPushedScreen(null);
      // 3. Reset any active ride/shift states
      setRideState('idle');
      setIncomingBooking(null);
      setActiveBooking(null);
      wasAuthenticatedRef.current = false;
    }
  }, [isAuthenticated, setRideState, setIncomingBooking, setActiveBooking]);

  // The native splash (app.json) is the ONLY splash — no second in-app brand screen. While a
  // previous session is still being restored, hold a blank frame in the splash's own background
  // colour so the handoff is seamless and a returning, already-logged-in driver never flashes
  // through onboarding on the way back in.
  if (isRestoring) {
    return (
      <View style={[styles.container, { backgroundColor: '#FFFFFF' }]}>
        <StatusBar style="dark" backgroundColor="#FFFFFF" />
      </View>
    );
  }

  const isRideFlowActive = rideState !== 'idle' || !!incomingBooking;
  // Only the map-driven ride states render full-bleed (they manage their own insets via
  // ScreenHeader's overlay variant); fare_collect is a plain content screen and keeps the
  // normal padded safe area.
  const isMapRideState =
    rideState === 'dispatch' ||
    (incomingBooking && rideState === 'idle') ||
    rideState === 'accepted' ||
    rideState === 'arrived' ||
    rideState === 'in_transit';

  const goToTab = (tab: PrimaryTab) => {
    setPushedScreen(null);
    setActiveTab(tab);
  };

  const renderCurrentScreen = () => {
    // Held while a previous session is still being restored (app relaunch, reloaded web tab) so
    // a returning, already-logged-in driver never flashes through onboarding/login on the way
    // back in — DriverShiftContext resumes any in-progress ride on its own once `driver` lands.
    if (isRestoring) {
      return (
        <View style={styles.restoringContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      );
    }

    if (!isAuthenticated) {
      switch (authScreen) {
        case 'login':
          return (
            <DriverAuthScreen
              onBack={() => setAuthScreen('splash')}
              onGoToRegister={() => setAuthScreen('verify')}
            />
          );
        case 'verify':
          return (
            <DriverFranchiseVerificationScreen
              onBack={() => setAuthScreen('login')}
              onVerified={() => setAuthScreen('register')}
            />
          );
        case 'register':
          return (
            <DriverRegistrationScreen
              onBack={() => setAuthScreen('verify')}
              onNext={(info) => {
                setPendingAccountInfo(info);
                setAuthScreen('set_password');
              }}
              initialValues={pendingAccountInfo}
            />
          );
        case 'set_password':
          // Guards against reaching this screen with nothing collected yet (e.g. a stale
          // deep-link/reload) by sending the driver back to re-enter their account info.
          if (!pendingAccountInfo) {
            return (
              <DriverRegistrationScreen
                onBack={() => setAuthScreen('verify')}
                onNext={(info) => {
                  setPendingAccountInfo(info);
                  setAuthScreen('set_password');
                }}
                initialValues={pendingAccountInfo}
              />
            );
          }
          return (
            <DriverSetPasswordScreen
              onBack={() => setAuthScreen('register')}
              accountInfo={pendingAccountInfo}
            />
          );
        default:
          return (
            <DriverOnboardingScreen
              onLogin={() => {
                AsyncStorage.setItem(DRIVER_ONBOARDING_STORAGE_KEY, 'true').catch(() => {});
                setAuthScreen('login');
              }}
              onRegister={() => setAuthScreen('verify')}
            />
          );
      }
    }

    if (isRideFlowActive) {
      if (rideState === 'dispatch' || (incomingBooking && rideState === 'idle')) {
        return <DriverDispatchScreen />;
      }
      if (rideState === 'accepted' || rideState === 'arrived') {
        return <DriverEnRoutePickupScreen />;
      }
      if (rideState === 'in_transit') {
        return <DriverInTransitScreen />;
      }
      if (rideState === 'fare_collect') {
        return <DriverFareCollectScreen />;
      }
    }

    if (isManualRideVisible) {
      return <DriverManualRideScreen />;
    }

    if (isQrSessionVisible) {
      return <DriverQrSessionScreen onBack={() => setIsQrSessionOpen(false)} />;
    }

    if (pushedScreen === 'tracking_settings') {
      return <TelematicsSettingsScreen onBack={() => setPushedScreen(null)} />;
    }

    if (activeTab === 'trips') {
      return <RideHistoryScreen />;
    }

    if (activeTab === 'violations') {
      return <ViolationsHistoryScreen />;
    }

    if (activeTab === 'earnings') {
      return <DriverEarningsScreen />;
    }

    if (activeTab === 'profile') {
      return <DriverProfileScreen onOpenTrackingSettings={() => setPushedScreen('tracking_settings')} />;
    }

    return (
      <DriverDashboardScreen
        onOpenProfile={() => goToTab('profile')}
        onOpenTrips={() => goToTab('trips')}
        onOpenEarnings={() => goToTab('earnings')}
        onOpenViolations={() => goToTab('violations')}
        onOpenQrSession={() => setIsQrSessionOpen(true)}
      />
    );
  };

  // The map-driven ride screens (Dispatch, En Route, In Transit) manage their own full-bleed
  // map + floating header + insets, so they render outside the padded SafeAreaView below.
  const isFullBleedScreen = isAuthenticated && isMapRideState;
  const isTabBarVisible = isAuthenticated && !isRideFlowActive && pushedScreen === null && !isQrSessionVisible && !isManualRideVisible;

  if (isFullBleedScreen) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" translucent backgroundColor="transparent" />
        <OfflineBanner />
        {renderCurrentScreen()}
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" backgroundColor={COLORS.background} />
      <OfflineBanner />
      <View style={styles.container}>
        <View style={styles.screenViewport}>{renderCurrentScreen()}</View>

        {/* Same bottom-spacing rule as the Passenger app: respect the device's real safe-area
            inset where there is one, but never let the bar sit flush against the edge on
            devices without one (most Android phones have insets.bottom === 0). */}
        {isTabBarVisible && (
          <View
            style={[
              styles.tabBar,
              { paddingBottom: Math.max(insets.bottom, Platform.OS === 'ios' ? 24 : 14) },
            ]}
          >
            <TabButton label="Home" icon={Home} isActive={activeTab === 'home'} onPress={() => goToTab('home')} />
            <TabButton label="Rides" icon={Receipt} isActive={activeTab === 'trips'} onPress={() => goToTab('trips')} />
            <TabButton label="Violations" icon={ShieldAlert} isActive={activeTab === 'violations'} onPress={() => goToTab('violations')} />
            <TabButton label="Earnings" icon={TrendingUp} isActive={activeTab === 'earnings'} onPress={() => goToTab('earnings')} />
            <TabButton label="Profile" icon={User} isActive={activeTab === 'profile'} onPress={() => goToTab('profile')} />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NetworkProvider>
          <ToastProvider>
            <DriverAuthProvider>
              <DriverShiftProvider>
                <QrSessionProvider>
                  <ManualRideProvider>
                    <DriverAppNavigator />
                  </ManualRideProvider>
                </QrSessionProvider>
              </DriverShiftProvider>
            </DriverAuthProvider>
          </ToastProvider>
        </NetworkProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  restoringContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenViewport: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.background,
    paddingTop: 8,
    paddingHorizontal: SPACING.xs,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    minHeight: Platform.OS === 'ios' ? 62 : 64,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingVertical: 4,
    gap: 5,
  },
  tabIndicatorTrack: {
    height: 3,
    width: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIndicator: {
    height: 3,
    width: 20,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  tabLabelActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
});
