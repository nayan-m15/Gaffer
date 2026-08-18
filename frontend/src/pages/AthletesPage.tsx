import { useMemo, useState } from "react";
import { Search, Plus, Users, Archive } from "lucide-react";
import { ArchiveConfirmDialog } from "@/components/roster/ArchiveConfirmDialog";
import { AthleteDetailPanel } from "@/components/roster/AthleteDetailPanel";
import { AthleteFormDialog } from "@/components/roster/AthleteFormDialog";
import { MOCK_ATHLETES, type Athlete } from "@/components/roster/data";
import "@/components/roster/roster-light.css";
import { RosterSidebar } from "@/components/roster/RosterSidebar";
import { RosterTable } from "@/components/roster/RosterTable";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * AthletesPage — Squad roster command centre (S1-03).
 *
 * This is a UI-only implementation.  All athlete data is mocked locally,
 * selection state is held in React, and the add / edit / archive / restore
 * interactions only update the local roster array.  No backend calls are made.
 */
export default function AthletesPage() {
  const [athletes, setAthletes] = useState<Athlete[]>(MOCK_ATHLETES);
  const [selectedId, setSelectedId] = useState<string | null>(MOCK_ATHLETES[4]?.id ?? null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const [formAthlete, setFormAthlete] = useState<Athlete | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const [archivingAthlete, setArchivingAthlete] = useState<Athlete | null>(null);

  /**
   * Filter the roster by archived state and then by the search query.
   * Search matches name, position, status or jersey number.
   */
  const filteredAthletes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    const byArchive = athletes.filter((athlete) =>
      showArchived ? athlete.isArchived : !athlete.isArchived,
    );

    if (!query) return byArchive;

    return byArchive.filter(
      (athlete) =>
        athlete.name.toLowerCase().includes(query) ||
        athlete.position.toLowerCase().includes(query) ||
        athlete.status.toLowerCase().includes(query) ||
        athlete.jerseyNumber.toString().includes(query),
    );
  }, [athletes, searchQuery, showArchived]);

  /** Selected athlete must belong to the current filtered view. */
  const selectedAthlete = useMemo(() => {
    const match = filteredAthletes.find((athlete) => athlete.id === selectedId);
    return match ?? filteredAthletes[0] ?? null;
  }, [filteredAthletes, selectedId]);

  const activeCount = athletes.filter(
    (athlete) => !athlete.isArchived && athlete.status === "Available",
  ).length;
  const archivedCount = athletes.filter((athlete) => athlete.isArchived).length;

  const handleSelect = (athlete: Athlete) => setSelectedId(athlete.id);

  const openAddForm = () => {
    setFormAthlete(null);
    setIsFormOpen(true);
  };

  const openEditForm = (athlete: Athlete) => {
    setFormAthlete(athlete);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setFormAthlete(null);
  };

  const handleSaveAthlete = (athlete: Athlete) => {
    setAthletes((prev) => {
      const exists = prev.some((a) => a.id === athlete.id);
      if (exists) {
        return prev.map((a) => (a.id === athlete.id ? athlete : a));
      }
      return [...prev, athlete];
    });
    setSelectedId(athlete.id);
    closeForm();
  };

  const openArchiveDialog = (athlete: Athlete) => setArchivingAthlete(athlete);

  const closeArchiveDialog = () => setArchivingAthlete(null);

  const handleArchiveConfirm = () => {
    if (!archivingAthlete) return;

    setAthletes((prev) =>
      prev.map((athlete) =>
        athlete.id === archivingAthlete.id ? { ...athlete, isArchived: true } : athlete,
      ),
    );

    if (selectedId === archivingAthlete.id) {
      setSelectedId(null);
    }

    closeArchiveDialog();
  };

  const handleRestore = (athlete: Athlete) => {
    setAthletes((prev) =>
      prev.map((a) => (a.id === athlete.id ? { ...a, isArchived: false } : a)),
    );
    setSelectedId(athlete.id);
  };

  const switchTab = (archived: boolean) => {
    setShowArchived(archived);
    setSelectedId(null);
    setSearchQuery("");
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
                    {showArchived ? "Archived Athletes" : "Squad Management"}
                  </h2>
                </div>
                <p className="text-xs font-semibold uppercase tracking-wider text-brand">
                  {showArchived
                    ? `${archivedCount} ARCHIVED`
                    : `${activeCount} PLAYERS REGULARLY ACTIVE`}
                </p>
              </div>

              {/* Toolbar: tabs + search + add athlete */}
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-1">
                  <TabButton
                    active={!showArchived}
                    onClick={() => switchTab(false)}
                    icon={<Users className="size-3.5" />}
                    label="Active"
                  />
                  <TabButton
                    active={showArchived}
                    onClick={() => switchTab(true)}
                    icon={<Archive className="size-3.5" />}
                    label="Archived"
                  />
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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

                  {!showArchived && (
                    <Button
                      type="button"
                      onClick={openAddForm}
                      className="w-full gap-1.5 sm:w-auto"
                    >
                      <Plus className="size-4" />
                      Add Athlete
                    </Button>
                  )}
                </div>
              </div>

              <RosterTable
                athletes={filteredAthletes}
                selectedId={selectedId}
                showArchived={showArchived}
                onSelect={handleSelect}
                onEdit={openEditForm}
                onArchive={openArchiveDialog}
                onRestore={handleRestore}
              />

              {filteredAthletes.length === 0 && (
                <div className="py-12 text-center">
                  <p className="text-sm text-muted-foreground">
                    {searchQuery
                      ? "No athletes match your search."
                      : showArchived
                        ? "No archived athletes."
                        : "No active athletes."}
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
                <AthleteDetailPanel
                  athlete={selectedAthlete}
                  onEdit={openEditForm}
                  onArchive={openArchiveDialog}
                  onRestore={handleRestore}
                />
              ) : (
                <div className="flex h-full items-center justify-center rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
                  Select an athlete to view details.
                </div>
              )}
            </section>
          </div>
        </div>
      </main>

      <AthleteFormDialog
        isOpen={isFormOpen}
        onClose={closeForm}
        athlete={formAthlete}
        onSave={handleSaveAthlete}
      />

      <ArchiveConfirmDialog
        isOpen={archivingAthlete !== null}
        onClose={closeArchiveDialog}
        onConfirm={handleArchiveConfirm}
        athleteName={archivingAthlete?.name ?? ""}
      />
    </div>
  );
}

/* ── Private sub-components ─────────────────────────────────────────────── */

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

function TabButton({ active, onClick, icon, label }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
        active
          ? "bg-brand text-brand-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
