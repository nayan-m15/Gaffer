import { useMemo, useState } from "react";
import { Search, Plus, Users, Archive, Loader2, AlertCircle, UserPlus, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArchiveConfirmDialog } from "@/components/roster/ArchiveConfirmDialog";
import { AthleteDetailPanel } from "@/components/roster/AthleteDetailPanel";
import { AthleteFormDialog } from "@/components/roster/AthleteFormDialog";
import { ClaimInviteDialog } from "@/components/roster/ClaimInviteDialog";
import { AssistantInviteDialog } from "@/components/roster/AssistantInviteDialog";
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
  createClaimInvite,
  getArchivedAthletes,
  getAthletes,
  restoreAthlete,
  revokeClaimInvite,
  toFormValues,
  toUiAthlete,
  updateAthlete,
  type AthleteFormValues,
  type BackendAthlete,
  type ClaimInviteResult,
  type CreateAthleteInput,
  type UpdateAthleteInput,
} from "@/services/athletes";
import { useAuth } from "@/hooks/useAuth";
import {
  createTeamInvite,
  getTeamAssistants,
  getTeamInvites,
  revokeTeamInvite,
  type TeamInviteResult,
} from "@/services/team-invites";

const QUERY_KEY_ACTIVE = ["athletes", "active"] as const;
const QUERY_KEY_ARCHIVED = ["athletes", "archived"] as const;
const QUERY_KEY_TEAM_INVITES = ["team-invites"] as const;
const QUERY_KEY_TEAM_ASSISTANTS = ["team-assistants"] as const;

/**
 * AthletesPage — Squad roster command centre (S1-03).
 *
 * Active and archived athletes are loaded from the backend through
 * TanStack Query. Add, edit, archive and restore operations are persisted
 * via the API and the relevant roster queries are invalidated afterwards.
 */
export default function AthletesPage() {
  const queryClient = useQueryClient();
  const { team } = useAuth();
  const canManageRoster = team?.role === "coach";
  const canManageClaims = team?.role === "coach" || team?.role === "assistant";

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const [editingBackendAthlete, setEditingBackendAthlete] = useState<BackendAthlete | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const [archivingAthlete, setArchivingAthlete] = useState<Athlete | null>(null);

  // Claim-invite dialog state
  const [claimInviteTarget, setClaimInviteTarget] = useState<{
    athleteName: string;
    athleteId: string;
  } | null>(null);
  const [claimInviteResult, setClaimInviteResult] =
    useState<ClaimInviteResult | null>(null);

  // Assistant-invite dialog state
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [inviteResult, setInviteResult] = useState<TeamInviteResult | null>(null);

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

  const claimInviteMutation = useMutation({
    mutationFn: createClaimInvite,
    onSuccess: (result) => {
      setClaimInviteResult(result);
      // Refresh roster to show "Invited" status
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY_ACTIVE });
    },
  });

  const revokeInviteMutation = useMutation({
    mutationFn: (athleteId: string) => revokeClaimInvite(athleteId),
    onSuccess: () => {
      setClaimInviteTarget(null);
      setClaimInviteResult(null);
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY_ACTIVE });
    },
  });

  /* ── Team-invite queries & mutations (coach-only) ──────────────────── */
  const invitesQuery = useQuery({
    queryKey: QUERY_KEY_TEAM_INVITES,
    queryFn: getTeamInvites,
    enabled: canManageRoster,
  });

  const assistantsQuery = useQuery({
    queryKey: QUERY_KEY_TEAM_ASSISTANTS,
    queryFn: getTeamAssistants,
    enabled: canManageRoster,
  });

  const assistantInviteMutation = useMutation({
    mutationFn: createTeamInvite,
    onSuccess: (result) => {
      setInviteResult(result);
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY_TEAM_INVITES });
    },
  });

  const revokeTeamInviteMutation = useMutation({
    mutationFn: revokeTeamInvite,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY_TEAM_INVITES });
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
      status: values.status,
    };

    if (editingBackendAthlete) {
      updateMutation.mutate({
        id: editingBackendAthlete.id,
        input: {
          ...input,
          dateOfBirth: values.dateOfBirth || null,
          position: values.position || null,
          squadNumber: values.squadNumber || null,
        },
      });
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

  const handleInviteClaim = (athlete: Athlete) => {
    setClaimInviteTarget({
      athleteName: athlete.name,
      athleteId: athlete.id,
    });
    setClaimInviteResult(null);
    claimInviteMutation.reset();
    revokeInviteMutation.reset();
  };

  const handleCloseClaimDialog = () => {
    setClaimInviteTarget(null);
    setClaimInviteResult(null);
    claimInviteMutation.reset();
    revokeInviteMutation.reset();
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

                  {!showArchived && canManageRoster && (
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
                    readOnly={!canManageRoster}
                    showClaimStatus={canManageClaims}
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
                  onInviteClaim={canManageClaims ? handleInviteClaim : undefined}
                  readOnly={!canManageRoster}
                />
              ) : (
                <div className="flex h-full items-center justify-center rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
                  Select an athlete to view details.
                </div>
              )}
            </section>
          </div>

        {/* ── Assistants management card (coach-only) ────────────────── */}
        {canManageRoster && (
          <section className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-widest text-foreground">
                  Assistants
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Invite assistants to help manage your squad. They can view
                  the roster, events and statistics but cannot make changes.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setInviteResult(null);
                  setIsInviteDialogOpen(true);
                }}
                className="gap-1.5"
              >
                <UserPlus className="size-4" />
                Invite Assistant
              </Button>
            </div>

            <div className="space-y-6">
              <div>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-foreground">
                  Accepted Assistants
                </h3>

                {assistantsQuery.isLoading ? (
                  <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Loading assistants…
                  </div>
                ) : assistantsQuery.error ? (
                  <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                    <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                    <span>
                      {assistantsQuery.error instanceof ApiError
                        ? assistantsQuery.error.message
                        : "Failed to load assistants."}
                    </span>
                  </div>
                ) : (assistantsQuery.data ?? []).length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                    No assistants have joined the team yet.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {assistantsQuery.data!.map((assistant) => (
                      <li
                        key={assistant.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {assistant.name}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {assistant.email}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                          Active
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-foreground">
                  Pending Invitations
                </h3>

                {invitesQuery.isLoading ? (
                  <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Loading invites…
                  </div>
                ) : invitesQuery.error ? (
                  <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                    <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                    <span>
                      {invitesQuery.error instanceof ApiError
                        ? invitesQuery.error.message
                        : "Failed to load pending invites."}
                    </span>
                  </div>
                ) : (invitesQuery.data ?? []).length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                    No pending assistant invites.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {invitesQuery.data!.map((inv) => (
                      <li
                        key={inv.id}
                        className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {inv.email}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            Expires{" "}
                            {new Date(inv.expiresAt).toLocaleDateString(undefined, {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => revokeTeamInviteMutation.mutate(inv.id)}
                          disabled={revokeTeamInviteMutation.isPending}
                          className="gap-1 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                          Revoke
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        )}
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

      <ClaimInviteDialog
        isOpen={claimInviteTarget !== null}
        onClose={handleCloseClaimDialog}
        athleteName={claimInviteTarget?.athleteName ?? ""}
        onInvite={(email) => {
          if (!claimInviteTarget) return;
          claimInviteMutation.mutate({
            athleteId: claimInviteTarget.athleteId,
            email,
          });
        }}
        isSubmitting={claimInviteMutation.isPending}
        submitError={
          claimInviteMutation.error instanceof Error
            ? claimInviteMutation.error.message
            : null
        }
        result={claimInviteResult}
        onRevoke={() => {
          if (claimInviteTarget) {
            revokeInviteMutation.mutate(claimInviteTarget.athleteId);
          }
        }}
        isRevoking={revokeInviteMutation.isPending}
      />

      <AssistantInviteDialog
        isOpen={isInviteDialogOpen}
        onClose={() => {
          setIsInviteDialogOpen(false);
          setInviteResult(null);
          assistantInviteMutation.reset();
        }}
        onInvite={(email) => assistantInviteMutation.mutate(email)}
        isSubmitting={assistantInviteMutation.isPending}
        submitError={
          assistantInviteMutation.error instanceof Error
            ? assistantInviteMutation.error.message
            : null
        }
        result={inviteResult}
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
