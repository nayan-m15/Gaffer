import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { RequireTeam } from '@/components/RequireTeam'
import { AppShell } from '@/layouts/AppShell'
import DashboardPage from '@/pages/DashboardPage'
import LoginPage from '@/pages/LoginPage'
import SignUpPage from '@/pages/SignUpPage'
import AthletesPage from '@/pages/AthletesPage'
import EventsPage from '@/pages/EventsPage'
import TeamManagementPage from '@/features/team-management/TeamManagementPage'
import LandingPage from '@/pages/LandingPage'
import HowItWorksPage from '@/pages/HowItWorksPage'

/**
 * App — Root application component.
 *
 * `/` is the public marketing landing page; `/login` and `/signup` are also
 * public. `/how-it-works` is a public informational page. The dashboard,
 * athletes, events and team pages require a signed-in coach and live behind
 * `ProtectedRoute`, which redirects to `/login` otherwise. Athletes and
 * Events additionally require the coach to already have a team — `RequireTeam`
 * sends them back to `/dashboard` if not. `/team` stays reachable without a
 * team, since it's how a team-less coach gets one.
 */
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/how-it-works" element={<HowItWorksPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignUpPage />} />
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
