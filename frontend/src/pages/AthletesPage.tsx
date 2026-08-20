import { useMemo, useState } from "react";
import { Search, Plus, Users, Archive, Loader2, AlertCircle } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArchiveConfirmDialog } from "@/components/roster/ArchiveConfirmDialog";
import { AthleteDetailPanel } from "@/components/roster/AthleteDetailPanel";
import { AthleteFormDialog } from "@/components/roster/AthleteFormDialog";
import type { Athlete } from "@/components/roster/data";
import "@/components/roster/roster-light.css";
import { RosterTable } from "@/components/roster/RosterTable";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  archiveAthlete,
  createAthlete,
  getArchivedAthletes,
  getAthletes,
  restoreAthlete,
  toFormValues,
  toUiAthlete,
  updateAthlete,
  type AthleteFormValues,
  type BackendAthlete,
  type CreateAthleteInput,
  type UpdateAthleteInput,
} from "@/services/athletes";

const QUERY_KEY_ACTIVE = ["athletes", "active"] as const;
const QUERY_KEY_ARCHIVED = ["athletes", "archived"] as const;

/**
 * AthletesPage — Squad roster command centre (S1-03).
 *
 * Active and archived athletes are loaded from the backend through
 * TanStack Query. Add, edit, archive and restore operations are persisted
 * via the API and the relevant roster queries are invalidated afterwards.
 */
export default function AthletesPage() {
  const queryClient = useQueryClient();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const [editingBackendAthlete, setEditingBackendAthlete] = useState<BackendAthlete | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const [archivingAthlete, setArchivingAthlete] = useState<Athlete | null>(null);

  const activeQuery = useQuery({
    queryKey: QUERY_KEY_ACTIVE,
    queryFn: getAthletes,
  });

  const archivedQuery = useQuery({
    queryKey: QUERY_KEY_ARCHIVED,
    queryFn: getArchivedAthletes,
  });

  const activeAthletes = useMemo(
    () => (activeQuery.data ?? []).map(toUiAthlete),
    [activeQuery.data],
  );
  const archivedAthletes = useMemo(
    () => (archivedQuery.data ?? []).map(toUiAthlete),
    [archivedQuery.data],
  );

  const currentAthletes = showArchived ? archivedAthletes : activeAthletes;
  const isLoading = showArchived ? archivedQuery.isLoading : activeQuery.isLoading;
  const isPending = showArchived ? archivedQuery.isPending : activeQuery.isPending;
  const error = showArchived ? archivedQuery.error : activeQuery.error;

  /**
   * Filter the roster by the search query.
   * Search matches name, position, status or jersey number.
   */
  const filteredAthletes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) return currentAthletes;

    return currentAthletes.filter(
      (athlete) =>
        athlete.name.toLowerCase().includes(query) ||
        athlete.position.toLowerCase().includes(query) ||
        athlete.status.toLowerCase().includes(query) ||
        athlete.jerseyNumber.toString().includes(query),
    );
  }, [currentAthletes, searchQuery]);

  /** Selected athlete must belong to the current filtered view. */
  const selectedAthlete = useMemo(() => {
    const match = filteredAthletes.find((athlete) => athlete.id === selectedId);
    return match ?? filteredAthletes[0] ?? null;
  }, [filteredAthletes, selectedId]);

  const activeCount = activeAthletes.length;
  const archivedCount = archivedAthletes.length;

  const createMutation = useMutation({
    mutationFn: createAthlete,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY_ACTIVE });
      closeForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAthleteInput }) =>
      updateAthlete(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY_ACTIVE });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY_ARCHIVED });
      closeForm();
    },
  });

  const archiveMutation = useMutation({
    mutationFn: archiveAthlete,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY_ACTIVE });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY_ARCHIVED });

      if (selectedId === archivingAthlete?.id) {
        setSelectedId(null);
      }

      closeArchiveDialog();
    },
  });

  const restoreMutation = useMutation({
    mutationFn: restoreAthlete,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY_ARCHIVED });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY_ACTIVE });
    },
  });

  const handleSelect = (athlete: Athlete) => setSelectedId(athlete.id);

  const openAddForm = () => {
    setEditingBackendAthlete(null);
    setIsFormOpen(true);
  };

  const openEditForm = (athlete: Athlete) => {
    const backend =
      activeQuery.data?.find((a) => a.id === athlete.id) ??
      archivedQuery.data?.find((a) => a.id === athlete.id) ??
      null;

    setEditingBackendAthlete(backend);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingBackendAthlete(null);
    createMutation.reset();
    updateMutation.reset();
  };

  const handleFormSubmit = (values: AthleteFormValues) => {
    const input: CreateAthleteInput = {
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      dateOfBirth: values.dateOfBirth || undefined,
      position: values.position || undefined,
      squadNumber: values.squadNumber || undefined,
    };

    if (editingBackendAthlete) {
      updateMutation.mutate({ id: editingBackendAthlete.id, input });
    } else {
      createMutation.mutate(input);
    }
  };

  const openArchiveDialog = (athlete: Athlete) => setArchivingAthlete(athlete);

  const closeArchiveDialog = () => setArchivingAthlete(null);

  const handleArchiveConfirm = () => {
    if (!archivingAthlete) return;
    archiveMutation.mutate(archivingAthlete.id);
  };

  const handleRestore = (athlete: Athlete) => {
    restoreMutation.mutate(athlete.id);
  };

  const switchTab = (archived: boolean) => {
    setShowArchived(archived);
    setSelectedId(null);
    setSearchQuery("");
  };

  return (
    <>
      <PageHeader
        title="Roster Command"
        subtitle="Manage active squad players, squad status, and athlete archives."
        actions={
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-75" />
              <span className="relative inline-flex size-2.5 rounded-full bg-brand" />
            </span>
            Sideline Active Mode
          </div>
        }
      />

      <div className="space-y-6 p-6 sm:p-8">
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

              {isPending || isLoading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading roster…
                </div>
              ) : error ? (
                <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <div>
                    <p className="font-semibold">Failed to load athletes</p>
                    <p>{error instanceof ApiError ? error.message : "Please try again later."}</p>
                  </div>
                </div>
              ) : (
                <>
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
                </>
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

      <AthleteFormDialog
        isOpen={isFormOpen}
        onClose={closeForm}
        initialValues={editingBackendAthlete ? toFormValues(editingBackendAthlete) : null}
        onSubmit={handleFormSubmit}
      />

      <ArchiveConfirmDialog
        isOpen={archivingAthlete !== null}
        onClose={closeArchiveDialog}
        onConfirm={handleArchiveConfirm}
        athleteName={archivingAthlete?.name ?? ""}
      />
    </>
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
