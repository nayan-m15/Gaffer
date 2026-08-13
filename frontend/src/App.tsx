import { Button } from '@/components/ui/button'

function App() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <section className="w-full max-w-3xl rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Sport Coaching Tool
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">
          Development foundation ready
        </h1>
        <p className="mt-4 max-w-2xl text-slate-600">
          React, Vite, Tailwind, shadcn/ui, TanStack Query, Socket.io, and the
          backend integration points are configured for the next implementation
          phase.
        </p>
        <Button className="mt-6" type="button">
          shadcn/ui verified
        </Button>
      </section>
    </main>
  )
}

export default App
