import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Cake,
  Phone,
  Settings,
  Users,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Mail,
  Shield,
  Trash2,
  UserCircle,
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
  requestEmailChange,
  setPassword,
  updateProfile,
  type BackendProfile,
  type Sex,
} from "@/services/profile";

const PROFILE_QUERY_KEY = ["profile"] as const;
export type AccountView = "profile" | "settings";

interface ProfileEditorDialogProps {
  view: AccountView | null;
  onClose: () => void;
  onViewChange: (view: AccountView) => void;
}

export function ProfileEditorDialog({
  view,
  onClose,
  onViewChange,
}: ProfileEditorDialogProps) {
  const { team, claimedAthletes, accountKind } = useAuth();
  const dialogRef = useRef<HTMLDivElement>(null);
  const profileQuery = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: getProfile,
    enabled: view !== null,
  });

  useEffect(() => {
    if (!view) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLElement>("h2")?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]');
      const activeDialog = dialogs[dialogs.length - 1];
      if (!activeDialog) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (activeDialog === dialogRef.current) onClose();
        else
          activeDialog
            .querySelector<HTMLButtonElement>('button[aria-label^="Close"]')
            ?.click();
      }
      if (event.key === "Tab") {
        const focusable = Array.from(
          activeDialog.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]',
          ),
        ).filter((element) => element.getClientRects().length > 0);
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!first) {
          event.preventDefault();
          activeDialog.focus();
          return;
        }
        const current = document.activeElement;
        if (
          event.shiftKey &&
          (current === first || !focusable.includes(current as HTMLElement))
        ) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          (current === last || !focusable.includes(current as HTMLElement))
        ) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
      else {
        Array.from(document.querySelectorAll<HTMLElement>('[aria-label="Open account menu"], [aria-controls="mobile-more-menu"], [aria-label="Open navigation menu"]'))
          .find((element) => element.getClientRects().length > 0)?.focus();
      }
    };
  }, [view, onClose]);

  if (!view) return null;
  const profile = profileQuery.data;
  const initials = (profile?.name ?? "")
    .split(" ")
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-dialog-title"
        tabIndex={-1}
        className={cn(
          "relative flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl",
          view === "profile" ? "max-w-lg" : "max-w-2xl",
        )}
      >
        <div className={cn("flex shrink-0 items-start justify-between gap-3", view === "settings" ? "px-5 pb-3 pt-4" : "px-6 pb-4 pt-6")}>
          <div>
            <h2
              id="account-dialog-title"
              tabIndex={-1}
              className="text-lg font-bold text-foreground outline-none"
            >
              {view === "profile" ? "Profile" : "Account settings"}
            </h2>
            {view === "settings" && (
              <p className="mt-1 text-sm text-muted-foreground">
                Manage your personal details, email, and password.
              </p>
            )}
          </div>
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
        <div className={cn("min-h-0 flex-1 overflow-y-auto", view === "settings" ? "px-5 pb-4" : "px-6 pb-6")}>
          {profileQuery.isPending ? (
            <div
              role="status"
              className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"
            >
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Loading profile...
            </div>
          ) : profileQuery.isError ? (
            <div role="alert" className="space-y-3 py-6 text-center">
              <p className="text-sm text-destructive">
                {profileQuery.error instanceof ApiError
                  ? profileQuery.error.message
                  : "Failed to load profile."}
              </p>
              <Button
                variant="outline"
                onClick={() => void profileQuery.refetch()}
              >
                Try again
              </Button>
            </div>
          ) : profile ? (
            view === "profile" ? (
              <ProfileOverview
                profile={profile}
                initials={initials}
                teamName={team?.name ?? claimedAthletes[0]?.teamName ?? null}
                teamRole={
                  team?.role ?? (accountKind === "player" ? "player" : null)
                }
                onSettings={() => onViewChange("settings")}
              />
            ) : (
              <div className="space-y-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onViewChange("profile")}
                >
                  View profile
                </Button>
                <AccountSettingsContent key={profile.id} profile={profile} />
              </div>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ProfileOverview({
  profile,
  initials,
  teamName,
  teamRole,
  onSettings,
}: {
  profile: BackendProfile;
  initials: string;
  teamName: string | null;
  teamRole: string | null;
  onSettings: () => void;
}) {
  const joinedDate = new Date(profile.createdAt).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
  });
  return (
    <>
      {/* Avatar + identity */}
      <div
        className={cn("flex flex-col items-center text-center", "mb-5 gap-3")}
      >
        {profile.image ? (
          <img
            src={profile.image}
            alt=""
            className={cn("shrink-0 rounded-full object-cover", "size-20")}
          />
        ) : (
          <div
            className={cn(
              "flex shrink-0 items-center justify-center rounded-full bg-primary/20 font-bold text-primary",
              "size-20 text-2xl",
            )}
          >
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
          onClick={onSettings}
          className="gap-1.5"
        >
          <Settings className="size-4" />
          Account settings
        </Button>
      </div>
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

function AccountSettingsContent({ profile }: { profile: BackendProfile }) {
  const { refreshSession } = useAuth();
  const queryClient = useQueryClient();
  const [editName, setEditName] = useState(profile.name);
  const [editPhoneNumber, setEditPhoneNumber] = useState(
    profile.phoneNumber ?? "",
  );
  const [editSex, setEditSex] = useState<Sex | "">(profile.sex ?? "");
  const [editDateOfBirth, setEditDateOfBirth] = useState(
    profile.dateOfBirth ?? "",
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const updateMutation = useMutation({ mutationFn: updateProfile });
  const handleReset = () => {
    setEditName(profile.name);
    setEditPhoneNumber(profile.phoneNumber ?? "");
    setEditSex(profile.sex ?? "");
    setEditDateOfBirth(profile.dateOfBirth ?? "");
    setValidationError(null);
    setShowSuccess(false);
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
      const updated = await updateMutation.mutateAsync({
        name: trimmed,
        phoneNumber: trimmedPhone,
        sex: sexValue,
        dateOfBirth: dobValue,
      });
      queryClient.setQueryData(PROFILE_QUERY_KEY, updated);
      setEditName(updated.name);
      setEditPhoneNumber(updated.phoneNumber ?? "");
      setEditSex(updated.sex ?? "");
      setEditDateOfBirth(updated.dateOfBirth ?? "");
      await refreshSession();
      setShowSuccess(true);
    } catch {
      // Error surfaced via updateMutation.error below.
    }
  };

  return (
    <>
      {showSuccess && (
        <p
          role="status"
          className="rounded-lg border border-brand/30 bg-brand/10 p-3 text-sm text-brand"
        >
          Personal details saved.
        </p>
      )}
      <EditForm
        currentEmail={profile.email}
        editName={editName}
        editPhoneNumber={editPhoneNumber}
        editSex={editSex}
        editDateOfBirth={editDateOfBirth}
        validationError={validationError}
        mutationError={updateMutation.error}
        isSaving={updateMutation.isPending}
        onSave={handleSave}
        onCancel={handleReset}
        onNameChange={(value) => {
          setEditName(value);
          setShowSuccess(false);
        }}
        onPhoneNumberChange={(value) => {
          setEditPhoneNumber(value);
          setShowSuccess(false);
        }}
        onSexChange={(value) => {
          setEditSex(value);
          setShowSuccess(false);
        }}
        onDateOfBirthChange={(value) => {
          setEditDateOfBirth(value);
          setShowSuccess(false);
        }}
      />
    </>
  );
}

interface EditFormProps {
  currentEmail: string;
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
  currentEmail,
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
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [emailNotice, setEmailNotice] = useState<string | null>(null);
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null);
  const passwordStatusQuery = useQuery({
    queryKey: ["password-status"],
    queryFn: getPasswordStatus,
  });

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await onSave();
  };

  const inputClass = cn(
    "h-9 min-w-0 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/50",
    errorMessage && "border-destructive",
    isSaving && "opacity-60",
  );
  const labelClass =
    "mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground";

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className="space-y-3 rounded-xl border border-border bg-card p-4"
        aria-labelledby="personal-details-title"
      >
        <div>
          <h2 id="personal-details-title" className="text-lg font-semibold">
            Personal details
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-3">
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
              onChange={(event) => onSexChange(event.target.value as Sex | "")}
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

        {errorMessage && (
          <p
            role="alert"
            className="flex items-center gap-1.5 text-sm text-destructive"
          >
            <AlertCircle className="size-3.5" />
            {errorMessage}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={isSaving}
          >
            <X className="size-4" />
            Reset changes
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
            {isSaving ? "Saving…" : "Save changes"}
          </StatefulButton>
        </div>
      </form>
      {/* Account security actions stay compact and open in dedicated dialogs. */}
      <section
        aria-labelledby="security-title"
        className="space-y-2 rounded-xl border border-border bg-card p-4"
      >
        <h2 id="security-title" className="text-lg font-semibold">
          Email &amp; password
        </h2>
        <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 p-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Mail className="size-4 shrink-0 text-muted-foreground" />
              Email address
            </div>
            <p className="mt-0.5 break-all text-xs text-muted-foreground">
              {currentEmail}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setEmailNotice(null);
              setIsEmailDialogOpen(true);
            }}
            disabled={isSaving}
            className="shrink-0"
          >
            Change email
          </Button>
        </div>

        {emailNotice && (
          <p className="flex items-center gap-1.5 text-sm text-brand">
            <Check className="size-3.5 shrink-0" />
            {emailNotice}
          </p>
        )}

        <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 p-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <KeyRound className="size-4 shrink-0 text-muted-foreground" />
              Password
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Manage your sign-in password.
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
            {passwordStatusQuery.data
              ? passwordStatusQuery.data.hasPassword
                ? "Change password"
                : "Set password"
              : "Manage password"}
          </Button>
        </div>

        {passwordNotice && (
          <p className="flex items-center gap-1.5 text-sm text-brand">
            <Check className="size-3.5 shrink-0" />
            {passwordNotice}
          </p>
        )}
      </section>

      {/* Destructive account actions are deliberately separated from normal profile controls. */}
      <section aria-label="Delete account">
        <div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
              <Trash2 className="size-4 shrink-0" />
              Delete account
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Permanently remove your account and personal data.
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
      </section>

      <EmailManagementDialog
        isOpen={isEmailDialogOpen}
        currentEmail={currentEmail}
        onClose={() => setIsEmailDialogOpen(false)}
        onRequested={(message) => {
          setEmailNotice(message);
          setIsEmailDialogOpen(false);
        }}
      />

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

interface EmailManagementDialogProps {
  isOpen: boolean;
  currentEmail: string;
  onClose: () => void;
  onRequested: (message: string) => void;
}

function EmailManagementDialog({
  isOpen,
  currentEmail,
  onClose,
  onRequested,
}: EmailManagementDialogProps) {
  const [newEmail, setNewEmail] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const emailMutation = useMutation({
    mutationFn: requestEmailChange,
  });

  useEffect(() => {
    if (isOpen) return;
    setNewEmail("");
    setConfirmEmail("");
    setValidationError(null);
    emailMutation.reset();
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  const mutationError = getMutationMessage(emailMutation.error ?? null);
  const errorMessage = validationError ?? mutationError;

  const clearFeedback = () => {
    setValidationError(null);
    emailMutation.reset();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const next = newEmail.trim().toLowerCase();
    const confirmation = confirmEmail.trim().toLowerCase();
    const current = currentEmail.trim().toLowerCase();

    if (!next) {
      setValidationError("New email address is required.");
      return;
    }
    if (next.length > 255) {
      setValidationError("Email must be 255 characters or fewer.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) {
      setValidationError("Enter a valid email address.");
      return;
    }
    if (next === current) {
      setValidationError("New email address must be different from your current email address.");
      return;
    }
    if (!confirmation) {
      setValidationError("Please confirm your new email address.");
      return;
    }
    if (confirmation !== next) {
      setValidationError("Email addresses do not match.");
      return;
    }

    setValidationError(null);

    try {
      await emailMutation.mutateAsync({ newEmail: next });
      onRequested(
        `Email change requested. Check ${currentEmail} to approve the change, then verify ${next}.`,
      );
    } catch {
      // Error is rendered below from emailMutation.error.
    }
  };

  const inputClass = cn(
    "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/50",
    errorMessage && "border-destructive",
    emailMutation.isPending && "opacity-60",
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={emailMutation.isPending ? undefined : onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="email-dialog-title"
        className="relative w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <Mail className="size-5 text-primary" />
              <h3 id="email-dialog-title" className="text-lg font-bold text-foreground">
                Change Email Address
              </h3>
            </div>
            <p className="text-sm text-muted-foreground">
              For security, you will approve the request from your current email first, then verify the new address.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            type="button"
            onClick={onClose}
            disabled={emailMutation.isPending}
            aria-label="Close email dialog"
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="mb-4 rounded-xl border border-border bg-muted/20 p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Current email
          </p>
          <p className="mt-1 break-all text-sm font-medium text-foreground">{currentEmail}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="new-email"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              New email
            </label>
            <input
              id="new-email"
              type="email"
              value={newEmail}
              onChange={(event) => {
                setNewEmail(event.target.value);
                clearFeedback();
              }}
              disabled={emailMutation.isPending}
              autoComplete="email"
              maxLength={255}
              autoFocus
              className={inputClass}
              placeholder="name@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="confirm-new-email"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Confirm new email
            </label>
            <input
              id="confirm-new-email"
              type="email"
              value={confirmEmail}
              onChange={(event) => {
                setConfirmEmail(event.target.value);
                clearFeedback();
              }}
              disabled={emailMutation.isPending}
              autoComplete="off"
              maxLength={255}
              className={inputClass}
              placeholder="name@example.com"
            />
          </div>

          {errorMessage && (
            <p className="flex items-center gap-1.5 text-sm text-destructive">
              <AlertCircle className="size-3.5 shrink-0" />
              {errorMessage}
            </p>
          )}

          <div className="rounded-xl border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
            Your account will continue using <strong className="text-foreground">{currentEmail}</strong> until both confirmation steps are complete.
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={emailMutation.isPending}
            >
              Cancel
            </Button>
            <StatefulButton
              type="submit"
              disabled={emailMutation.isPending}
              status={emailMutation.isPending ? "loading" : errorMessage ? "error" : "idle"}
              loadingText="Sending…"
              errorText="Try again"
              className="gap-1.5"
            >
              {emailMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Mail className="size-4" />
              )}
              Send Confirmation
            </StatefulButton>
          </div>
        </form>
      </div>
    </div>
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
  const [showPasswordRequirements, setShowPasswordRequirements] = useState(false);

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
    setShowPasswordRequirements(false);
    passwordMutation.reset();
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearFeedback = () => {
    setValidationError(null);
    passwordMutation.reset();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setShowPasswordRequirements(true);

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

                {showPasswordRequirements && (
                  <PasswordRequirements password={newPassword} />
                )}

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
