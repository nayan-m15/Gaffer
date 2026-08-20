import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Check,
  Loader2,
  Mail,
  Pencil,
  Shield,
  UserCircle,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  getProfile,
  updateProfile,
  type BackendProfile,
} from "@/services/profile";

const PROFILE_QUERY_KEY = ["profile"] as const;

interface ProfileEditorDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * ProfileEditorDialog — modal for viewing and editing the current user's
 * profile.
 *
 * Opens from the sidebar's user area. Fetches the profile via TanStack Query
 * (enabled only while open) and persists name changes through PATCH /profile.
 * After a successful save the profile query is invalidated and the auth
 * session is refreshed so the sidebar immediately reflects the new name.
 */
export function ProfileEditorDialog({
  isOpen,
  onClose,
}: ProfileEditorDialogProps) {
  const { user, team, refreshSession } = useAuth();
  const queryClient = useQueryClient();

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const profileQuery = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: getProfile,
    enabled: isOpen,
  });

  const updateMutation = useMutation({
    mutationFn: updateProfile,
  });

  // Reset to view mode whenever the dialog closes.
  useEffect(() => {
    if (!isOpen) {
      setIsEditing(false);
      setValidationError(null);
      setShowSuccess(false);
      updateMutation.reset();
    }
  }, [isOpen, updateMutation]);

  // Auto-dismiss the success banner after a few seconds.
  useEffect(() => {
    if (!showSuccess) return;
    const timer = setTimeout(() => setShowSuccess(false), 4000);
    return () => clearTimeout(timer);
  }, [showSuccess]);

  const handleEdit = () => {
    setEditName(profileQuery.data?.name ?? user?.name ?? "");
    setValidationError(null);
    updateMutation.reset();
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setValidationError(null);
    updateMutation.reset();
  };

  const handleSave = async () => {
    const trimmed = editName.trim();

    if (!trimmed) {
      setValidationError("Name is required.");
      return;
    }

    if (trimmed.length > 100) {
      setValidationError("Name must be 100 characters or fewer.");
      return;
    }

    setValidationError(null);

    try {
      await updateMutation.mutateAsync({ name: trimmed });
      await queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });
      await refreshSession();
      setIsEditing(false);
      setShowSuccess(true);
    } catch {
      // Error surfaced via updateMutation.error below.
    }
  };

  if (!isOpen) return null;

  const initials = (profileQuery.data?.name ?? user?.name ?? "C")
    .split(" ")
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-title"
        className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl"
      >
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h2
            id="profile-title"
            className="text-lg font-bold text-foreground"
          >
            Profile
          </h2>
          <Button
            variant="ghost"
            size="icon-xs"
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X className="size-4" />
          </Button>
        </div>

        {/* Success banner */}
        {showSuccess && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-brand/30 bg-brand/10 px-3 py-2.5 text-sm text-brand">
            <Check className="size-4 shrink-0" />
            Profile updated successfully.
          </div>
        )}

        {/* Body */}
        {profileQuery.isPending ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading profile…
          </div>
        ) : profileQuery.isError ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <AlertCircle className="size-8 text-destructive" />
            <p className="text-sm text-muted-foreground">
              {profileQuery.error instanceof ApiError
                ? profileQuery.error.message
                : "Failed to load profile."}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void profileQuery.refetch()}
            >
              Try again
            </Button>
          </div>
        ) : profileQuery.data ? (
          <ProfileBody
            profile={profileQuery.data}
            initials={initials}
            teamName={team?.name ?? null}
            teamRole={team?.role ?? null}
            isEditing={isEditing}
            editName={editName}
            validationError={validationError}
            mutationError={updateMutation.error ?? null}
            isSaving={updateMutation.isPending}
            onEditNameChange={setEditName}
            onEdit={handleEdit}
            onCancel={handleCancelEdit}
            onSave={handleSave}
          />
        ) : null}
      </div>
    </div>
  );
}

/* ── Private sub-components ─────────────────────────────────────────────── */

interface ProfileBodyProps {
  profile: BackendProfile;
  initials: string;
  teamName: string | null;
  teamRole: string | null;
  isEditing: boolean;
  editName: string;
  validationError: string | null;
  mutationError: Error | null;
  isSaving: boolean;
  onEditNameChange: (value: string) => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
}

function ProfileBody({
  profile,
  initials,
  teamName,
  teamRole,
  isEditing,
  editName,
  validationError,
  mutationError,
  isSaving,
  onEditNameChange,
  onEdit,
  onCancel,
  onSave,
}: ProfileBodyProps) {
  const joinedDate = new Date(profile.createdAt).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
  });

  return (
    <>
      {/* Avatar + identity */}
      <div className="mb-5 flex flex-col items-center gap-3 text-center">
        <div className="flex size-20 shrink-0 items-center justify-center rounded-full bg-primary/20 text-2xl font-bold text-primary">
          {initials || <UserCircle className="size-10" />}
        </div>
        <div>
          <p className="text-lg font-bold text-foreground">{profile.name}</p>
          <p className="text-sm text-muted-foreground">{profile.email}</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {teamRole && (
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              <Shield className="size-3" />
              {teamRole}
            </span>
          )}
          {profile.emailVerified && (
            <span className="inline-flex items-center gap-1 rounded-full border border-brand/30 bg-brand/10 px-2.5 py-0.5 text-xs font-medium text-brand">
              <Check className="size-3" />
              Verified
            </span>
          )}
        </div>
      </div>

      {/* Edit form or read-only details */}
      {isEditing ? (
        <EditForm
          editName={editName}
          onNameChange={onEditNameChange}
          validationError={validationError}
          mutationError={mutationError}
          isSaving={isSaving}
          onSave={onSave}
          onCancel={onCancel}
        />
      ) : (
        <>
          <dl className="space-y-1">
            <DetailRow
              icon={<UserCircle className="size-4" />}
              label="Name"
              value={profile.name}
            />
            <DetailRow
              icon={<Mail className="size-4" />}
              label="Email"
              value={profile.email}
            />
            {teamRole && (
              <DetailRow
                icon={<Shield className="size-4" />}
                label="Role"
                value={teamRole}
              />
            )}
            {teamName && (
              <DetailRow
                icon={<Users className="size-4" />}
                label="Team"
                value={teamName}
              />
            )}
            <DetailRow
              icon={<Mail className="size-4" />}
              label="Member since"
              value={joinedDate}
            />
          </dl>

          <div className="mt-5 flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={onEdit}
              className="gap-1.5"
            >
              <Pencil className="size-4" />
              Edit Profile
            </Button>
          </div>
        </>
      )}
    </>
  );
}

interface DetailRowProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

function DetailRow({ icon, label, value }: DetailRowProps) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2.5 last:border-b-0">
      <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
        <span className="text-muted-foreground/70">{icon}</span>
        {label}
      </div>
      <p className="text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

interface EditFormProps {
  editName: string;
  onNameChange: (value: string) => void;
  validationError: string | null;
  mutationError: Error | null;
  isSaving: boolean;
  onSave: () => void;
  onCancel: () => void;
}

function EditForm({
  editName,
  onNameChange,
  validationError,
  mutationError,
  isSaving,
  onSave,
  onCancel,
}: EditFormProps) {
  const errorMessage = validationError ?? getMutationMessage(mutationError);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void onSave();
  };

  return (
    <form onSubmit={handleSubmit}>
      <label className="mb-1.5 block">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Name
        </span>
      </label>
      <input
        type="text"
        value={editName}
        onChange={(event) => onNameChange(event.target.value)}
        disabled={isSaving}
        autoFocus
        maxLength={100}
        className={cn(
          "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/50",
          errorMessage && "border-destructive",
          isSaving && "opacity-60",
        )}
      />

      {errorMessage && (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-destructive">
          <AlertCircle className="size-3.5" />
          {errorMessage}
        </p>
      )}

      <div className="mt-5 flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={isSaving}
        >
          <X className="size-4" />
          Cancel
        </Button>
        <Button type="submit" disabled={isSaving} className="gap-1.5">
          {isSaving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Check className="size-4" />
          )}
          {isSaving ? "Saving…" : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}

function getMutationMessage(error: Error | null): string | null {
  if (!error) return null;
  if (error instanceof ApiError) return error.message;
  return "Failed to update profile. Please try again.";
}
