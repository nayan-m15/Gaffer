import { BrowserRouter, Routes, Route } from 'react-router-dom'
import DashboardPage from '@/pages/DashboardPage'
import LoginPage from '@/pages/LoginPage'
import AthletesPage from '@/pages/AthletesPage'
import EventsPage from '@/pages/EventsPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/athletes" element={<AthletesPage />} />
        <Route path="/events" element={<EventsPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
