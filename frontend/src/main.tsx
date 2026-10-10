import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { createAppQueryClient } from '@/lib/query-client'
import { AutomaticDataRefresh } from '@/components/AutomaticDataRefresh'
import { AuthProvider } from '@/context/AuthContext'
import './index.css'
import App from './App.tsx'
import { requestPersistentStorage } from '@/offline/match-store'

const queryClient = createAppQueryClient()

void requestPersistentStorage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AutomaticDataRefresh />
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
