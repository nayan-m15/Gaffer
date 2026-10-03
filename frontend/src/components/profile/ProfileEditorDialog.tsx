import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Cake,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Mail,
  Pencil,
  Phone,
  Shield,
  Trash2,
  UserCircle,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatefulButton } from "@/components/ui/stateful-button";
import { PasswordRequirements } from "@/components/ui/password-requirements";
import { useAuth } from "@/hooks/useAuth";
import { ApiError } from "@/lib/api";
import { getNewPasswordValidationError } from "@/lib/password-policy";
import { cn } from "@/lib/utils";
import {
  changePassword,
  deleteProfile,
  getPasswordStatus,
  getProfile,
  setPassword,
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
        className="relative flex max-h-[calc(100vh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
      >
        {/* Header stays fixed while only the content area scrolls when needed. */}
        <div className="flex shrink-0 items-center justify-between px-6 pb-4 pt-6">
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

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
  onSave: () => Promise<void>;
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
      <div className={cn("flex flex-col items-center text-center", isEditing ? "mb-4 gap-2" : "mb-5 gap-3")}>
        {profile.image ? (
          <img
            src={profile.image}
            alt=""
            className={cn("shrink-0 rounded-full object-cover", isEditing ? "size-16" : "size-20")}
          />
        ) : (
          <div className={cn("flex shrink-0 items-center justify-center rounded-full bg-primary/20 font-bold text-primary", isEditing ? "size-16 text-xl" : "size-20 text-2xl")}>
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
  onSave: () => Promise<void>;
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
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await onSave();
  };

  const inputClass = cn(
    "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/50",
    errorMessage && "border-destructive",
    isSaving && "opacity-60",
  );
  const labelClass =
    "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground";

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
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
        </div>

        {/* Security stays compact; password editing happens in its own modal. */}
        <div className="border-t border-border pt-4">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 p-3.5">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <KeyRound className="size-4 shrink-0 text-muted-foreground" />
                Password
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Manage your email and password sign-in security.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setPasswordNotice(null);
                setIsPasswordDialogOpen(true);
              }}
              disabled={isSaving}
              className="shrink-0"
            >
              Manage
            </Button>
          </div>

          {passwordNotice && (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-brand">
              <Check className="size-3.5 shrink-0" />
              {passwordNotice}
            </p>
          )}
        </div>

        {/* Destructive account actions are deliberately separated from normal profile controls. */}
        <div className="border-t border-border pt-4">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3.5">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
                <Trash2 className="size-4 shrink-0" />
                Delete account
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Permanently remove your sign-in access and personal profile data.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsDeleteDialogOpen(true)}
              disabled={isSaving}
              className="shrink-0 border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              Delete
            </Button>
          </div>
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
            {isSaving ? "Saving…" : "Save Profile"}
          </StatefulButton>
        </div>
      </form>

      <PasswordManagementDialog
        isOpen={isPasswordDialogOpen}
        onClose={() => setIsPasswordDialogOpen(false)}
        onSuccess={(message) => {
          setPasswordNotice(message);
          setIsPasswordDialogOpen(false);
        }}
      />

      <DeleteAccountDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
      />
    </>
  );
}

interface DeleteAccountDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

function DeleteAccountDialog({ isOpen, onClose }: DeleteAccountDialogProps) {
  const { user, signOut } = useAuth();
  const [confirmation, setConfirmation] = useState("");

  const deleteMutation = useMutation({
    mutationFn: deleteProfile,
  });

  useEffect(() => {
    if (isOpen) return;
    setConfirmation("");
    deleteMutation.reset();
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  const canDelete = confirmation.trim().toUpperCase() === "DELETE";
  const errorMessage = getMutationMessage(deleteMutation.error ?? null);

  const handleDelete = async () => {
    if (!canDelete || deleteMutation.isPending) return;

    try {
      await deleteMutation.mutateAsync();
      // The backend has already removed every auth session/account. Clear all
      // cached/offline client state as well, then fully leave the protected app.
      await signOut({ pendingData: "discard" });
      window.location.assign("/login?accountDeleted=1");
    } catch {
      // Error is rendered below from deleteMutation.error.
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        onClick={deleteMutation.isPending ? undefined : onClose}
        aria-hidden="true"
      />

      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-account-title"
        aria-describedby="delete-account-description"
        className="relative w-full max-w-md rounded-2xl border border-destructive/30 bg-card p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <Trash2 className="size-5 text-destructive" />
              <h3 id="delete-account-title" className="text-lg font-bold text-foreground">
                Delete account
              </h3>
            </div>
            <p id="delete-account-description" className="text-sm text-muted-foreground">
              This permanently removes your sign-in access and personal profile data.
              Historical team and match records may retain an anonymous “Deleted User”
              reference so shared sporting records are not destroyed.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            type="button"
            onClick={onClose}
            disabled={deleteMutation.isPending}
            aria-label="Close delete account dialog"
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-sm">
          <p className="font-semibold text-foreground">This action cannot be undone.</p>
          {user?.email && (
            <p className="mt-1 break-all text-xs text-muted-foreground">
              Account: {user.email}
            </p>
          )}
        </div>

        <div className="mt-4">
          <label
            htmlFor="delete-account-confirmation"
            className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Type DELETE to confirm
          </label>
          <input
            id="delete-account-confirmation"
            type="text"
            value={confirmation}
            onChange={(event) => {
              setConfirmation(event.target.value);
              deleteMutation.reset();
            }}
            disabled={deleteMutation.isPending}
            autoComplete="off"
            autoFocus
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-destructive focus:ring-2 focus:ring-destructive/20"
            placeholder="DELETE"
          />
        </div>

        {errorMessage && (
          <p className="mt-3 flex items-center gap-1.5 text-sm text-destructive">
            <AlertCircle className="size-3.5 shrink-0" />
            {errorMessage}
          </p>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={deleteMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void handleDelete()}
            disabled={!canDelete || deleteMutation.isPending}
            className="gap-1.5"
          >
            {deleteMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
            {deleteMutation.isPending ? "Deleting…" : "Delete account"}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface PasswordManagementDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

function PasswordManagementDialog({
  isOpen,
  onClose,
  onSuccess,
}: PasswordManagementDialogProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const passwordStatusQuery = useQuery({
    queryKey: ["password-status"],
    queryFn: getPasswordStatus,
    enabled: isOpen,
  });
  const hasPassword = passwordStatusQuery.data?.hasPassword ?? true;

  const passwordMutation = useMutation({
    mutationFn: async () => {
      if (hasPassword) {
        return changePassword({ currentPassword, newPassword });
      }
      return setPassword({ newPassword });
    },
  });

  useEffect(() => {
    if (isOpen) return;
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setValidationError(null);
    passwordMutation.reset();
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearFeedback = () => {
    setValidationError(null);
    passwordMutation.reset();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (passwordStatusQuery.isPending) {
      setValidationError("Checking your sign-in methods. Please try again in a moment.");
      return;
    }
    if (passwordStatusQuery.isError) {
      setValidationError("Could not determine whether this account already has a password.");
      return;
    }

    if (hasPassword) {
      if (!currentPassword) {
        setValidationError("Current password is required.");
        return;
      }
      if (currentPassword.length > 128) {
        setValidationError("Current password must be 128 characters or fewer.");
        return;
      }
    }

    const newPasswordError = getNewPasswordValidationError(newPassword);
    if (newPasswordError) {
      setValidationError(newPasswordError.replace(/^Password/, "New password"));
      return;
    }
    if (hasPassword && newPassword === currentPassword) {
      setValidationError("New password must be different from your current password.");
      return;
    }
    if (!confirmPassword) {
      setValidationError("Please confirm your new password.");
      return;
    }
    if (confirmPassword !== newPassword) {
      setValidationError("Passwords do not match.");
      return;
    }

    setValidationError(null);

    try {
      await passwordMutation.mutateAsync();
      if (!hasPassword) {
        await passwordStatusQuery.refetch();
      }
      onSuccess(
        hasPassword
          ? "Password changed successfully. Other signed-in sessions have been revoked."
          : "Password set successfully. You can now sign in with your email and password.",
      );
    } catch {
      // Error surfaced below via passwordMutation.error.
    }
  };

  if (!isOpen) return null;

  const passwordError =
    validationError ?? getPasswordMutationMessage(passwordMutation.error ?? null);
  const title = passwordStatusQuery.isPending
    ? "Password Security"
    : hasPassword
      ? "Change Password"
      : "Set Password";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={passwordMutation.isPending ? undefined : onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="password-dialog-title"
        className="relative w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <KeyRound className="size-5 text-primary" />
              <h3 id="password-dialog-title" className="text-lg font-bold text-foreground">
                {title}
              </h3>
            </div>
            <p className="text-sm text-muted-foreground">
              {passwordStatusQuery.isPending
                ? "Checking your account security settings…"
                : hasPassword
                  ? "Enter your current password, then choose a secure new password."
                  : "Create a password to enable email and password sign-in alongside your existing sign-in method."}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            type="button"
            onClick={onClose}
            disabled={passwordMutation.isPending}
            aria-label="Close password dialog"
          >
            <X className="size-4" />
          </Button>
        </div>

        {passwordStatusQuery.isError ? (
          <div className="space-y-4">
            <p className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              Could not load your password settings. Please try again.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="button" variant="outline" onClick={() => void passwordStatusQuery.refetch()}>
                Try again
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {hasPassword && !passwordStatusQuery.isPending && (
              <PasswordField
                id="current-password"
                label="Current Password"
                value={currentPassword}
                onChange={(value) => {
                  setCurrentPassword(value);
                  clearFeedback();
                }}
                visible={showCurrentPassword}
                onToggle={() => setShowCurrentPassword((value) => !value)}
                autoComplete="current-password"
                disabled={passwordMutation.isPending}
              />
            )}

            {!passwordStatusQuery.isPending && (
              <>
                <PasswordField
                  id="new-password"
                  label="New Password"
                  value={newPassword}
                  onChange={(value) => {
                    setNewPassword(value);
                    clearFeedback();
                  }}
                  visible={showNewPassword}
                  onToggle={() => setShowNewPassword((value) => !value)}
                  autoComplete="new-password"
                  disabled={passwordMutation.isPending}
                />

                <PasswordRequirements password={newPassword} />

                <PasswordField
                  id="confirm-new-password"
                  label="Confirm New Password"
                  value={confirmPassword}
                  onChange={(value) => {
                    setConfirmPassword(value);
                    clearFeedback();
                  }}
                  visible={showConfirmPassword}
                  onToggle={() => setShowConfirmPassword((value) => !value)}
                  autoComplete="new-password"
                  disabled={passwordMutation.isPending}
                />
              </>
            )}

            {passwordError && (
              <p className="flex items-center gap-1.5 text-sm text-destructive">
                <AlertCircle className="size-3.5 shrink-0" />
                {passwordError}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                disabled={passwordMutation.isPending}
              >
                Cancel
              </Button>
              <StatefulButton
                type="submit"
                disabled={
                  passwordMutation.isPending ||
                  passwordStatusQuery.isPending ||
                  passwordStatusQuery.isError
                }
                status={passwordMutation.isPending ? "loading" : passwordError ? "error" : "idle"}
                loadingText={hasPassword ? "Changing..." : "Setting..."}
                errorText="Try again"
              >
                {passwordMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <KeyRound className="size-4" />
                )}
                {hasPassword ? "Update Password" : "Set Password"}
              </StatefulButton>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggle: () => void;
  autoComplete: string;
  disabled: boolean;
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  visible,
  onToggle,
  autoComplete,
  disabled,
}: PasswordFieldProps) {
  return (
    <div>
      <label
        className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        htmlFor={id}
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          autoComplete={autoComplete}
          maxLength={128}
          className={cn(
            "h-10 w-full rounded-lg border border-input bg-background px-3 pr-10 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/50",
            disabled && "opacity-60",
          )}
        />
        <button
          type="button"
          onClick={onToggle}
          disabled={disabled}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </div>
  );
}

function getPasswordMutationMessage(error: Error | null): string | null {
  if (!error) return null;
  if (error instanceof ApiError) return error.message;
  return "Failed to change password. Please try again.";
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
