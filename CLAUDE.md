# trivora-driver-app — Driver mobile app

Expo 54, React Native 0.81, React 19, TypeScript. `react-native-svg`, `lucide-react-native`. No `react-navigation` — screens switch via a local state machine in `App.tsx`, same pattern as the passenger app.

Scope: only this folder. Don't inspect `trivora/` (Laravel) or `trivora-passenger-app/` unless the task explicitly involves an API contract shared with them.

## Structure

- `src/screens/` — `DriverAuthScreen`, `DriverOnboardingScreen`, `DriverRegistrationScreen`, `DriverFranchiseVerificationScreen`, `DriverDashboardScreen`, `DriverDispatchScreen`, `DriverEnRoutePickupScreen`, `DriverInTransitScreen`, `DriverFareCollectScreen`, `DriverEarningsScreen`, `RideHistoryScreen`, `ViolationsHistoryScreen`, `TelematicsSettingsScreen`, `DriverProfileScreen`
- `src/context/` — `DriverAuthContext` (`useDriverAuth()`), `DriverShiftContext` (`useDriverShift()`)
- `src/components/` — `DriverHeader`, `DriverVoyagerMap`, `SlideToAcceptSlider`, `AuthProgressSteps`, `RideProgressStepper`, `EmptyState`
- `src/components/icons/index.ts` — single icon barrel; re-export new icons here rather than importing icon libs directly in screens
- `src/constants/theme.ts` — design tokens; `src/constants/todaRoutes.ts` — TODA route data
- `src/services/api.ts`
- `src/types/index.ts`

## Design tokens (`src/constants/theme.ts`)

Brand `primary: #1B3A69`. `RADIUS` xs4/sm8/md12/lg16/xl20/xxl28/full. `SPACING` xxs2/xs4/sm8/md16/lg24/xl32/xxl40. `TYPOGRAPHY` scale: display/h1/h2/h3/bodyLarge/body/bodySmall/caption/micro/label (finer-grained than the passenger app's scale — check `theme.ts` for exact keys before reusing a name across apps). Also `BUTTONS` touch-height constants. Always pull values from `theme.ts` — never inline hex/pixel values.

## Conventions

- New screens: `DriverXScreen.tsx` PascalCase under `src/screens/`, wired into `App.tsx`'s state machine — don't add `react-navigation`.
- App-wide state → React Context + a `useX()` hook (no Redux); local UI state → `useState`.
- Styling via `StyleSheet.create` referencing `theme.ts` tokens.

## Commands

`npm start`, `npm run android`, `npm run ios`, `npm run web` (Expo CLI). No test suite configured — verify by running the app for UI changes.
