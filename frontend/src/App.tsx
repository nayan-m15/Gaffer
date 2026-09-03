import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { RequireTeam } from '@/components/RequireTeam'
import { AppShell } from '@/layouts/AppShell'
import DashboardPage from '@/pages/DashboardPage'
import LoginPage from '@/pages/LoginPage'
import SignUpPage from '@/pages/SignUpPage'
import VerifyEmailPendingPage from '@/pages/VerifyEmailPendingPage'
import AthletesPage from '@/pages/AthletesPage'
import EventsPage from '@/pages/EventsPage'
import ConfirmSquadPage from '@/pages/ConfirmSquadPage'
import LiveLoggerPage from '@/pages/LiveLoggerPage'
import LiveMatchPage from '@/pages/LiveMatchPage'
import MatchReportPage from '@/pages/MatchReportPage'
import StatisticsPage from '@/pages/StatisticsPage'
import TeamManagementPage from '@/features/team-management/TeamManagementPage'
import LandingPage from '@/pages/LandingPage'

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
  return (
    <BrowserRouter useTransitions={false}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignUpPage />} />
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
          path="/matches/:matchId/report"
          element={
            <ProtectedRoute>
              <RequireTeam>
                <MatchReportPage />
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
          />
          <Route
            path="/live-logger"
            element={
              <RequireTeam>
                <LiveLoggerPage />
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
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App;
