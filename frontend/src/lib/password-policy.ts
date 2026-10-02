export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

export interface PasswordRequirement {
  key: "length" | "uppercase" | "lowercase" | "number" | "special";
  label: string;
  met: boolean;
}

export function getPasswordRequirements(password: string): PasswordRequirement[] {
  return [
    {
      key: "length",
      label: `${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} characters`,
      met: password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH,
    },
    { key: "uppercase", label: "At least one uppercase letter", met: /[A-Z]/.test(password) },
    { key: "lowercase", label: "At least one lowercase letter", met: /[a-z]/.test(password) },
    { key: "number", label: "At least one number", met: /[0-9]/.test(password) },
    {
      key: "special",
      label: "At least one special character",
      met: /[^A-Za-z0-9\s]/.test(password),
    },
  ];
}

export function getNewPasswordValidationError(password: string): string | null {
  if (!password) return "Password is required.";
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be ${PASSWORD_MAX_LENGTH} characters or fewer.`;
  }
  if (!/[A-Z]/.test(password)) return "Password must include at least one uppercase letter.";
  if (!/[a-z]/.test(password)) return "Password must include at least one lowercase letter.";
  if (!/[0-9]/.test(password)) return "Password must include at least one number.";
  if (!/[^A-Za-z0-9\s]/.test(password)) {
    return "Password must include at least one special character.";
  }
  return null;
}
