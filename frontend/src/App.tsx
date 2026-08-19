import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AppShell } from '@/layouts/AppShell'
import DashboardPage from '@/pages/DashboardPage'
import LoginPage from '@/pages/LoginPage'
import SignUpPage from '@/pages/SignUpPage'
import AthletesPage from '@/pages/AthletesPage'
import EventsPage from '@/pages/EventsPage'
import LandingPage from '@/pages/LandingPage'

/**
 * App — Root application component.
 *
 * `/` is the public marketing landing page; `/login` and `/signup` are also
 * public. The dashboard, athletes and events pages require a signed-in coach
 * and live behind `ProtectedRoute`, which redirects to `/login` otherwise.
 */
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
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
          <Route path="/athletes" element={<AthletesPage />} />
          <Route path="/events" element={<EventsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App;
