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
import TeamManagementPage from '@/features/team-management/TeamManagementPage'
import LandingPage from '@/pages/LandingPage'
import HowItWorksPage from '@/pages/HowItWorksPage'
import FeaturesPage from '@/pages/FeaturesPage'

/**
 * App — Root application component.
 *
 * `/` is the public marketing landing page; `/login`, `/signup` and
 * `/verify-email` are also public. `/how-it-works` and `/features` are public
 * informational pages. The dashboard, athletes, events and team pages require
 * a signed-in coach and live behind `ProtectedRoute`, which redirects to
 * `/login` otherwise. Athletes and Events additionally require the coach to
 * already have a team — `RequireTeam` sends them back to `/dashboard` if not.
 * `/team` stays reachable without a team, since it's how a team-less coach
 * gets one.
 */
function App() {
  return (
    <BrowserRouter useTransitions={false}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/features" element={<FeaturesPage />} />
        <Route path="/how-it-works" element={<HowItWorksPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="/verify-email" element={<VerifyEmailPendingPage />} />
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
