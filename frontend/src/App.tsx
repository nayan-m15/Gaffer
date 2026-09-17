import { useState, useEffect, useCallback } from 'react'
import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { RequireTeam } from '@/components/RequireTeam'
import { RequirePlayer } from '@/components/RequirePlayer'
import { LoadingScreen } from '@/components/loading/LoadingScreen'
import { useAuth } from '@/hooks/useAuth'
import { AppShell } from '@/layouts/AppShell'
import { PlayerShell } from '@/layouts/PlayerShell'
import DashboardPage from '@/pages/DashboardPage'
import LoginPage from '@/pages/LoginPage'
import SignUpPage from '@/pages/SignUpPage'
import ClaimPage from '@/pages/ClaimPage'
import JoinTeamPage from '@/pages/JoinTeamPage'
import VerifyEmailPendingPage from '@/pages/VerifyEmailPendingPage'
import AthletesPage from '@/pages/AthletesPage'
import EventsPage from '@/pages/EventsPage'
import ConfirmSquadPage from '@/pages/ConfirmSquadPage'
import OpponentSquadSetupPage from '@/pages/OpponentSquadSetupPage'
import LiveLoggerPage from '@/pages/LiveLoggerPage'
import LiveMatchPage from '@/pages/LiveMatchPage'
import MatchReportPage from '@/pages/MatchReportPage'
import StatisticsPage from '@/pages/StatisticsPage'
import TeamManagementPage from '@/features/team-management/TeamManagementPage'
import PlayerDashboardPage from '@/features/player/PlayerDashboardPage'
import PlayerTeamPage from '@/features/player/PlayerTeamPage'
import PlayerEventsPage from '@/features/player/PlayerEventsPage'
import PlayerStandingsPage from '@/features/player/PlayerStandingsPage'
import LandingPage from '@/pages/LandingPage'
import PublicDashboard from '@/pages/PublicDashboard'
import { ClaimResumer } from '@/components/ClaimResumer'
import { TeamInviteResumer } from '@/components/TeamInviteResumer'

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
      {!loadingDone && (
        <LoadingScreen appReady={appReady} onDone={handleLoadingDone} />
      )}
      <BrowserRouter useTransitions={false}>
      <ClaimResumer />
      <TeamInviteResumer />
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
      </BrowserRouter>
    </>
  )
}

export default App;
