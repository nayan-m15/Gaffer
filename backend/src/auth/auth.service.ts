import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { user } from '../database/schema';

/**
 * Read-only lookups over the user rows Better Auth maintains.
 *
 * Exists so the auth controller can tell a sign-in failure caused by an
 * entirely unknown address apart from a bad password, without touching
 * Better Auth's own sign-in logic.
 */
@Injectable()
export class AuthService {
  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Whether any user row exists with this email address.
   *
   * The email is lower-cased first because Better Auth normalises emails the
   * same way when storing them and when looking them up on sign-in, so the
   * two checks must agree to avoid false "not found" results.
   */
  async userEmailExists(email: string): Promise<boolean> {
    const [row] = await this.databaseService.database
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email.toLowerCase()))
      .limit(1);

    return row !== undefined;
  }
}
