import { BrowserRouter, Routes, Route } from 'react-router-dom'
import DashboardPage from '@/pages/DashboardPage'
import LoginPage from '@/pages/LoginPage'
import AthletesPage from '@/pages/AthletesPage'
import EventsPage from '@/pages/EventsPage'
import LandingPage from '@/pages/LandingPage'


/**
 * App — Root application component.
 *
 * Currently renders the marketing landing page at the root route.  When
 * authentication and the product dashboard are built in later phases, a
 * router will be introduced here to handle multiple routes.
 */
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />  
        <Route path="/" element={<DashboardPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/athletes" element={<AthletesPage />} />
        <Route path="/events" element={<EventsPage />} />
      </Routes>

      
    </BrowserRouter>
    
  )
  
}

export default App;
