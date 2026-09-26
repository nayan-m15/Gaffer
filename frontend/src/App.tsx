import { lazy, Suspense, useState, useEffect, useCallback } from 'react'
import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { RequireTeam } from '@/components/RequireTeam'
import { RequirePlayer } from '@/components/RequirePlayer'
import { LoadingScreen } from '@/components/loading/LoadingScreen'
import { useAuth } from '@/hooks/useAuth'
import { AppShell } from '@/layouts/AppShell'
import { PlayerShell } from '@/layouts/PlayerShell'
import { CompetitionInviteResumer } from '@/components/CompetitionInviteResumer'
import { ClaimResumer } from '@/components/ClaimResumer'
import { TeamInviteResumer } from '@/components/TeamInviteResumer'
import { Loader2 } from 'lucide-react'
import { PwaUpdatePrompt } from '@/components/PwaUpdatePrompt'

const LoginPage = lazy(() => import('@/pages/LoginPage'))
const SignUpPage = lazy(() => import('@/pages/SignUpPage'))
const ClaimPage = lazy(() => import('@/pages/ClaimPage'))
const JoinCompetitionPage = lazy(() => import('@/pages/JoinCompetitionPage'))
const JoinTeamPage = lazy(() => import('@/pages/JoinTeamPage'))
const VerifyEmailPendingPage = lazy(() => import('@/pages/VerifyEmailPendingPage'))
const LandingPage = lazy(() => import('@/pages/LandingPage'))
const PublicDashboard = lazy(() => import('@/pages/PublicDashboard'))

const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const AthletesPage = lazy(() => import('@/pages/AthletesPage'))
const EventsPage = lazy(() => import('@/pages/EventsPage'))
const ConfirmSquadPage = lazy(() => import('@/pages/ConfirmSquadPage'))
const OpponentSquadSetupPage = lazy(() => import('@/pages/OpponentSquadSetupPage'))
const LiveLoggerPage = lazy(() => import('@/pages/LiveLoggerPage'))
const LiveMatchPage = lazy(() => import('@/pages/LiveMatchPage'))
const MatchReportPage = lazy(() => import('@/pages/MatchReportPage'))
const StatisticsPage = lazy(() => import('@/pages/StatisticsPage'))
const CompetitionsPage = lazy(() => import('@/features/competitions/CompetitionsPage'))
const InjuryRecoveryPage = lazy(() => import('@/features/injuries/InjuryRecoveryPage'))
const TeamManagementPage = lazy(() => import('@/features/team-management/TeamManagementPage'))
const PlayerDashboardPage = lazy(() => import('@/features/player/PlayerDashboardPage'))
const PlayerTeamPage = lazy(() => import('@/features/player/PlayerTeamPage'))
const PlayerEventsPage = lazy(() => import('@/features/player/PlayerEventsPage'))

function RouteFallback() {
  return (
    <div className="flex min-h-[45vh] items-center justify-center" role="status">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />
        Loading workspace...
      </div>
    </div>
  )
}

/**
 * App — Root application component.
 *
 * `/` is the public marketing landing page, which now includes the How It
 * Works and Features sections as scrollable anchors (`/#how-it-works` and
 * `/#features`). `/login`, `/signup` and `/verify-email` are also public.
 * The dashboard, athletes, events and team pages require a signed-in coach
 * and live behind `ProtectedRoute`, which redirects to `/login` otherwise.
 * Athletes and Events additionally require the coach to already have a
 * team — `RequireTeam` sends them back to `/dashboard` if not. `/team`
 * stays reachable without a team, since it's how a team-less coach gets one.
 */
function App() {
  const { status } = useAuth();
  const [loadingDone, setLoadingDone] = useState(false);
  const [appReady, setAppReady] = useState(false);

  /* Signal that the application is ready once auth has resolved (no longer
   * in the "loading" state) AND the browser's fonts have finished loading.
   * If visiting a public route (e.g. landing page or login), unblock as soon as
   * fonts are ready without waiting for auth session verification to wake up a
   * sleeping server. An unconditional timeout prevents the loader from getting
   * stuck indefinitely regardless of network conditions.                     */
  useEffect(() => {
    if (status !== 'loading') {
      Promise.race([
        document.fonts?.ready ?? Promise.resolve(),
        new Promise<void>((r) => setTimeout(r, 1500)),
      ]).then(() => setAppReady(true));
    }
  }, [status]);

  useEffect(() => {
    // Fast-path for public routes: do not block landing/auth pages on cold backend starts.
    const pathname = window.location.pathname;
    const isPublicRoute =
      pathname === '/' ||
      pathname === '/login' ||
      pathname === '/signup' ||
      pathname === '/public-dashboard' ||
      pathname.startsWith('/claim/') ||
      pathname.startsWith('/join-team/') ||
      pathname.startsWith('/join-competition/') ||
      pathname === '/verify-email';

    if (isPublicRoute) {
      Promise.race([
        document.fonts?.ready ?? Promise.resolve(),
        new Promise<void>((r) => setTimeout(r, 1000)),
      ]).then(() => setAppReady(true));
    }

    // Safety fallback: force-dismiss the loader after 4 s regardless of network or auth state.
    const fallback = setTimeout(() => setAppReady(true), 4_000);
    return () => clearTimeout(fallback);
  }, []);

  const handleLoadingDone = useCallback(() => setLoadingDone(true), []);

  return (
    <>
      <PwaUpdatePrompt />
      {!loadingDone && (
        <LoadingScreen appReady={appReady} onDone={handleLoadingDone} />
      )}
      <BrowserRouter useTransitions={false}>
      <ClaimResumer />
      <TeamInviteResumer />
      <CompetitionInviteResumer />
      <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/public-dashboard" element={<PublicDashboard />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="/claim/:token" element={<ClaimPage />} />
        <Route path="/join-competition/:token" element={<JoinCompetitionPage />} />
        <Route path="/join-team/:token" element={<JoinTeamPage />} />
        <Route path="/verify-email" element={<VerifyEmailPendingPage />} />
        <Route
          path="/matches/:matchId/live"
          element={
            <ProtectedRoute>
              <RequireTeam>
                <LiveMatchPage />
              </RequireTeam>
            </ProtectedRoute>
          }
        />
        <Route
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/competitions" element={<RequireTeam><CompetitionsPage /></RequireTeam>} />
          <Route path="/competitions/:id" element={<RequireTeam><CompetitionsPage /></RequireTeam>} />
          <Route
            path="/athletes"
            element={
              <RequireTeam>
                <AthletesPage />
              </RequireTeam>
            }
          />
          <Route
            path="/events"
            element={
              <RequireTeam>
                <EventsPage />
              </RequireTeam>
            }
          />
          <Route
            path="/events/:eventId/confirm-squad"
            element={
              <RequireTeam>
                <ConfirmSquadPage />
              </RequireTeam>
            }
          >
            <Route
              path="opponent"
              element={<OpponentSquadSetupPage />}
            />
          </Route>
          <Route
            path="/live-logger"
            element={
              <RequireTeam>
                <LiveLoggerPage />
              </RequireTeam>
            }
          />
          <Route
            path="/matches/:matchId/report"
            element={
              <RequireTeam>
                <MatchReportPage />
              </RequireTeam>
            }
          />
          <Route
            path="/statistics"
            element={
              <RequireTeam>
                <StatisticsPage />
              </RequireTeam>
            }
          />
          <Route
            path="/injuries"
            element={
              <RequireTeam>
                <InjuryRecoveryPage />
              </RequireTeam>
            }
          />
          <Route
            path="/team"
            element={
              <RequireTeam>
                <TeamManagementPage />
              </RequireTeam>
            }
          />
          <Route
            path="/tactics"
            element={
              <RequireTeam>
                <Navigate to="/team?section=tactics" replace />
              </RequireTeam>
            }
          />
        </Route>

        {/* ── Player routes ──────────────────────────────────────────── */}
        <Route
          element={
            <ProtectedRoute>
              <RequirePlayer>
                <PlayerShell />
              </RequirePlayer>
            </ProtectedRoute>
          }
        >
          <Route path="/player/dashboard" element={<PlayerDashboardPage />} />
          <Route path="/player/team" element={<PlayerTeamPage />} />
          <Route path="/player/events" element={<PlayerEventsPage />} />
          <Route path="/player/competitions" element={<CompetitionsPage />} />
          <Route path="/player/competitions/:id" element={<CompetitionsPage />} />
          <Route path="/player/standings" element={<Navigate to="/player/competitions" replace />} />
        </Route>
      </Routes>
      </Suspense>
      </BrowserRouter>
    </>
  )
}

export default App;
