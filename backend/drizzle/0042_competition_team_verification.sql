DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'competition_invite_status'
  ) THEN
    CREATE TYPE competition_invite_status AS ENUM (
      'pending',
      'used',
      'revoked',
      'verification'
    );
  ELSE
    ALTER TYPE competition_invite_status
      ADD VALUE IF NOT EXISTS 'verification';
  END IF;
END
$$;