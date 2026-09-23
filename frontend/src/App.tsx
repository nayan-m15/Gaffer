import { lazy, Suspense, useState, useEffect, useCallback } from 'react'
import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { RequireTeam } from '@/components/RequireTeam'
import { RequirePlayer } from '@/components/RequirePlayer'
import { LoadingScreen } from '@/components/loading/LoadingScreen'
import { useAuth } from '@/hooks/useAuth'
import { AppShell } from '@/layouts/AppShell'
import { PlayerShell } from '@/layouts/PlayerShell'
import LoginPage from '@/pages/LoginPage'
import SignUpPage from '@/pages/SignUpPage'
import ClaimPage from '@/pages/ClaimPage'
import JoinTeamPage from '@/pages/JoinTeamPage'
import VerifyEmailPendingPage from '@/pages/VerifyEmailPendingPage'
import LandingPage from '@/pages/LandingPage'
import PublicDashboard from '@/pages/PublicDashboard'
import { ClaimResumer } from '@/components/ClaimResumer'
import { TeamInviteResumer } from '@/components/TeamInviteResumer'
import { Loader2 } from 'lucide-react'
import { PwaUpdatePrompt } from '@/components/PwaUpdatePrompt'

const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const AthletesPage = lazy(() => import('@/pages/AthletesPage'))
const EventsPage = lazy(() => import('@/pages/EventsPage'))
const ConfirmSquadPage = lazy(() => import('@/pages/ConfirmSquadPage'))
const OpponentSquadSetupPage = lazy(() => import('@/pages/OpponentSquadSetupPage'))
const LiveLoggerPage = lazy(() => import('@/pages/LiveLoggerPage'))
const LiveMatchPage = lazy(() => import('@/pages/LiveMatchPage'))
const MatchReportPage = lazy(() => import('@/pages/MatchReportPage'))
const StatisticsPage = lazy(() => import('@/pages/StatisticsPage'))
const TeamManagementPage = lazy(() => import('@/features/team-management/TeamManagementPage'))
const PlayerDashboardPage = lazy(() => import('@/features/player/PlayerDashboardPage'))
const PlayerTeamPage = lazy(() => import('@/features/player/PlayerTeamPage'))
const PlayerEventsPage = lazy(() => import('@/features/player/PlayerEventsPage'))
const PlayerStandingsPage = lazy(() => import('@/features/player/PlayerStandingsPage'))

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
   * A maximum timeout prevents the loader from getting stuck indefinitely
   * if a non-critical resource fails.                                      */
  useEffect(() => {
    if (status === "loading") return;

    Promise.race([
      document.fonts?.ready ?? Promise.resolve(),
      new Promise<void>((r) => setTimeout(r, 3000)),
    ]).then(() => setAppReady(true));

    // Fallback: force-dismiss the loader after 10 s regardless.
    const fallback = setTimeout(() => setAppReady(true), 10_000);
    return () => clearTimeout(fallback);
  }, [status]);

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
      <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/public-dashboard" element={<PublicDashboard />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="/claim/:token" element={<ClaimPage />} />
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
          <Route path="/player/standings" element={<PlayerStandingsPage />} />
        </Route>
      </Routes>
      </Suspense>
      </BrowserRouter>
    </>
  )
}

export default App;
