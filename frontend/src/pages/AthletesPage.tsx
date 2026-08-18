import { useMemo, useState } from "react";
import { Search, Plus } from "lucide-react";
import "@/components/roster/roster-light.css";
import { AddAthleteDialog } from "@/components/roster/AddAthleteDialog";
import { AthleteDetailPanel } from "@/components/roster/AthleteDetailPanel";
import { MOCK_ATHLETES, type Athlete } from "@/components/roster/data";
import { RosterSidebar } from "@/components/roster/RosterSidebar";
import { RosterTable } from "@/components/roster/RosterTable";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * AthletesPage — Squad roster command centre (S1-03).
 *
 * This is a UI-only implementation.  All athlete data is mocked locally,
 * selection state is held in React, and the "Add Athlete" form only updates
 * the local roster array.  No backend calls are made.
 */
export default function AthletesPage() {
  const [athletes, setAthletes] = useState<Athlete[]>(MOCK_ATHLETES);
  const [selectedId, setSelectedId] = useState<string | null>(MOCK_ATHLETES[4]?.id ?? null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  const filteredAthletes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return athletes;

    return athletes.filter(
      (athlete) =>
        athlete.name.toLowerCase().includes(query) ||
        athlete.position.toLowerCase().includes(query) ||
        athlete.status.toLowerCase().includes(query) ||
        athlete.jerseyNumber.toString().includes(query),
    );
  }, [athletes, searchQuery]);

  const selectedAthlete = useMemo(
    () => athletes.find((athlete) => athlete.id === selectedId) || filteredAthletes[0],
    [athletes, selectedId, filteredAthletes],
  );

  const activeCount = athletes.filter((athlete) => athlete.status === "Available").length;

  const handleSelect = (athlete: Athlete) => setSelectedId(athlete.id);

  const handleAddAthlete = (athlete: Athlete) => {
    setAthletes((prev) => [...prev, athlete]);
    setSelectedId(athlete.id);
  };

  return (
    <div className="roster-page dark min-h-screen bg-background">
      <RosterSidebar />

      <main className="transition-all md:ml-64">
        <div className="mx-auto max-w-7xl p-4 pt-20 md:p-8 md:pt-8">
          {/* Page header */}
          <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between md:mb-8">
            <h1 className="font-display text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              ROSTER COMMAND
            </h1>

            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <span className="relative flex size-2.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-75" />
                <span className="relative inline-flex size-2.5 rounded-full bg-brand" />
              </span>
              Sideline Active Mode
            </div>
          </header>

          {/* Main layout */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
            {/* Squad management card */}
            <section className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-6 lg:col-span-2">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-widest text-foreground">
                    Squad Management
                  </h2>
                </div>
                <p className="text-xs font-semibold uppercase tracking-wider text-brand">
                  {activeCount} PLAYERS REGULARLY ACTIVE
                </p>
              </div>

              {/* Toolbar: search + add athlete */}
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative w-full sm:max-w-xs">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search athletes..."
                    className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/50"
                  />
                </div>

                <Button
                  type="button"
                  onClick={() => setIsAddDialogOpen(true)}
                  className="w-full gap-1.5 sm:w-auto"
                >
                  <Plus className="size-4" />
                  Add Athlete
                </Button>
              </div>

              <RosterTable
                athletes={filteredAthletes}
                selectedId={selectedId}
                onSelect={handleSelect}
              />

              {filteredAthletes.length === 0 && (
                <div className="py-12 text-center">
                  <p className="text-sm text-muted-foreground">
                    No athletes match your search.
                  </p>
                </div>
              )}
            </section>

            {/* Selected athlete details */}
            <section
              className={cn(
                "min-h-[560px] lg:col-span-1",
                !selectedAthlete && "hidden lg:flex",
              )}
            >
              {selectedAthlete ? (
                <AthleteDetailPanel athlete={selectedAthlete} />
              ) : (
                <div className="flex h-full items-center justify-center rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
                  Select an athlete to view details.
                </div>
              )}
            </section>
          </div>
        </div>
      </main>

      <AddAthleteDialog
        isOpen={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
        onAdd={handleAddAthlete}
      />
    </div>
  );
}
