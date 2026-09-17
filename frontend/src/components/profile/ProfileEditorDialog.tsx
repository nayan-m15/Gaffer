import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Cake,
  Check,
  Loader2,
  Mail,
  Pencil,
  Phone,
  Shield,
  UserCircle,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatefulButton } from "@/components/ui/stateful-button";
import { useAuth } from "@/hooks/useAuth";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  getProfile,
  updateProfile,
  type BackendProfile,
  type Sex,
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
  const [editPhoneNumber, setEditPhoneNumber] = useState("");
  const [editSex, setEditSex] = useState<Sex | "">("");
  const [editDateOfBirth, setEditDateOfBirth] = useState("");
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
  const { reset: resetMutation } = updateMutation;

  // Reset to view mode whenever the dialog closes.
  useEffect(() => {
    if (!isOpen) {
      setIsEditing(false);
      setValidationError(null);
      setShowSuccess(false);
      resetMutation();
    }
  }, [isOpen, resetMutation]);

  // Auto-dismiss the success banner after a few seconds.
  useEffect(() => {
    if (!showSuccess) return;
    const timer = setTimeout(() => setShowSuccess(false), 4000);
    return () => clearTimeout(timer);
  }, [showSuccess]);

  const handleEdit = () => {
    setEditName(profileQuery.data?.name ?? user?.name ?? "");
    setEditPhoneNumber(profileQuery.data?.phoneNumber ?? "");
    setEditSex(profileQuery.data?.sex ?? "");
    setEditDateOfBirth(profileQuery.data?.dateOfBirth ?? "");
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

    const trimmedPhone = editPhoneNumber.trim() || null;
    const sexValue: Sex | null = editSex || null;
    const dobValue = editDateOfBirth || null;

    if (dobValue) {
      const dob = new Date(dobValue + "T00:00:00");
      if (dob > new Date()) {
        setValidationError("Date of birth cannot be in the future.");
        return;
      }
    }

    setValidationError(null);

    try {
      await updateMutation.mutateAsync({
        name: trimmed,
        phoneNumber: trimmedPhone,
        sex: sexValue,
        dateOfBirth: dobValue,
      });
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
            editPhoneNumber={editPhoneNumber}
            editSex={editSex}
            editDateOfBirth={editDateOfBirth}
            validationError={validationError}
            mutationError={updateMutation.error ?? null}
            isSaving={updateMutation.isPending}
            onEditNameChange={setEditName}
            onEditPhoneNumberChange={setEditPhoneNumber}
            onEditSexChange={setEditSex}
            onEditDateOfBirthChange={setEditDateOfBirth}
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
  editPhoneNumber: string;
  editSex: Sex | "";
  editDateOfBirth: string;
  validationError: string | null;
  mutationError: Error | null;
  isSaving: boolean;
  onEditNameChange: (value: string) => void;
  onEditPhoneNumberChange: (value: string) => void;
  onEditSexChange: (value: Sex | "") => void;
  onEditDateOfBirthChange: (value: string) => void;
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
  editPhoneNumber,
  editSex,
  editDateOfBirth,
  validationError,
  mutationError,
  isSaving,
  onEditNameChange,
  onEditPhoneNumberChange,
  onEditSexChange,
  onEditDateOfBirthChange,
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
        {profile.image ? (
          <img
            src={profile.image}
            alt=""
            className="size-20 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex size-20 shrink-0 items-center justify-center rounded-full bg-primary/20 text-2xl font-bold text-primary">
            {initials || <UserCircle className="size-10" />}
          </div>
        )}
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
          editPhoneNumber={editPhoneNumber}
          editSex={editSex}
          editDateOfBirth={editDateOfBirth}
          validationError={validationError}
          mutationError={mutationError}
          isSaving={isSaving}
          onSave={onSave}
          onCancel={onCancel}
          onNameChange={onEditNameChange}
          onPhoneNumberChange={onEditPhoneNumberChange}
          onSexChange={onEditSexChange}
          onDateOfBirthChange={onEditDateOfBirthChange}
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
            {profile.phoneNumber && (
              <DetailRow
                icon={<Phone className="size-4" />}
                label="Phone"
                value={profile.phoneNumber}
              />
            )}
            {profile.sex && (
              <DetailRow
                icon={<UserCircle className="size-4" />}
                label="Sex"
                value={formatSex(profile.sex)}
              />
            )}
            {profile.dateOfBirth && (
              <DetailRow
                icon={<Cake className="size-4" />}
                label="Age"
                value={`${calculateAge(profile.dateOfBirth)} years`}
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
  editPhoneNumber: string;
  editSex: Sex | "";
  editDateOfBirth: string;
  validationError: string | null;
  mutationError: Error | null;
  isSaving: boolean;
  onSave: () => void;
  onCancel: () => void;
  onNameChange: (value: string) => void;
  onPhoneNumberChange: (value: string) => void;
  onSexChange: (value: Sex | "") => void;
  onDateOfBirthChange: (value: string) => void;
}

function EditForm({
  editName,
  editPhoneNumber,
  editSex,
  editDateOfBirth,
  validationError,
  mutationError,
  isSaving,
  onSave,
  onCancel,
  onNameChange,
  onPhoneNumberChange,
  onSexChange,
  onDateOfBirthChange,
}: EditFormProps) {
  const errorMessage = validationError ?? getMutationMessage(mutationError);
  const today = new Date().toISOString().slice(0, 10);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void onSave();
  };

  const inputClass = cn(
    "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/50",
    errorMessage && "border-destructive",
    isSaving && "opacity-60",
  );
  const labelClass =
    "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Name */}
      <div>
        <label className={labelClass} htmlFor="edit-name">
          Name
        </label>
        <input
          id="edit-name"
          type="text"
          value={editName}
          onChange={(event) => onNameChange(event.target.value)}
          disabled={isSaving}
          autoFocus
          maxLength={100}
          className={inputClass}
        />
      </div>

      {/* Phone number */}
      <div>
        <label className={labelClass} htmlFor="edit-phone">
          Phone Number
        </label>
        <input
          id="edit-phone"
          type="tel"
          value={editPhoneNumber}
          onChange={(event) => onPhoneNumberChange(event.target.value)}
          disabled={isSaving}
          placeholder="e.g. 07123 456789"
          maxLength={30}
          className={inputClass}
        />
      </div>

      {/* Sex */}
      <div>
        <label className={labelClass} htmlFor="edit-sex">
          Sex
        </label>
        <select
          id="edit-sex"
          value={editSex}
          onChange={(event) =>
            onSexChange(event.target.value as Sex | "")
          }
          disabled={isSaving}
          className={inputClass}
        >
          <option value="">—</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="prefer_not_to_say">Prefer not to say</option>
        </select>
      </div>

      {/* Date of birth */}
      <div>
        <label className={labelClass} htmlFor="edit-dob">
          Date of Birth
        </label>
        <input
          id="edit-dob"
          type="date"
          value={editDateOfBirth}
          onChange={(event) => onDateOfBirthChange(event.target.value)}
          disabled={isSaving}
          max={today}
          className={inputClass}
        />
      </div>

      {errorMessage && (
        <p className="flex items-center gap-1.5 text-sm text-destructive">
          <AlertCircle className="size-3.5" />
          {errorMessage}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={isSaving}
        >
          <X className="size-4" />
          Cancel
        </Button>
        <StatefulButton
          type="submit"
          disabled={isSaving}
          className="gap-1.5"
          status={isSaving ? "loading" : errorMessage ? "error" : "idle"}
          loadingText="Saving..."
          errorText="Try again"
        >
          {isSaving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Check className="size-4" />
          )}
          {isSaving ? "Saving…" : "Save Changes"}
        </StatefulButton>
      </div>
    </form>
  );
}

function getMutationMessage(error: Error | null): string | null {
  if (!error) return null;
  if (error instanceof ApiError) return error.message;
  return "Failed to update profile. Please try again.";
}

/** Derives a whole-number age from a YYYY-MM-DD date string. */
function calculateAge(dateOfBirth: string): number {
  const birth = new Date(dateOfBirth + "T00:00:00");
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && now.getDate() < birth.getDate())
  ) {
    age--;
  }
  return age;
}

/** Maps the raw enum value to a human-readable label. */
function formatSex(sex: Sex): string {
  switch (sex) {
    case "male":
      return "Male";
    case "female":
      return "Female";
    case "prefer_not_to_say":
      return "Prefer not to say";
  }
}
