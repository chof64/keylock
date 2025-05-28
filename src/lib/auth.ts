// Server-only authentication utilities
"use server";

import bcrypt from "bcrypt";
import { db } from "~/server/db";
import "server-only";

/**
 * Hash a password
 *
 * @param password - The password to hash
 * @returns The hashed password
 */
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
}

/**
 * Compare a password against a hash
 *
 * @param password - The password to check
 * @param hashedPassword - The hashed password to compare against
 * @returns Whether the password matches the hash
 */
export async function verifyPassword(
  password: string,
  hashedPassword: string,
): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

/**
 * Create a new user with email and password
 *
 * @param email - User email
 * @param password - User password (will be hashed)
 * @param name - User name (optional)
 * @returns The created user
 */
export async function createUser(
  email: string,
  password: string,
  name?: string,
) {
  const hashedPassword = await hashPassword(password);

  return db.user.create({
    data: {
      email,
      password: hashedPassword,
      name,
    },
  });
}

/**
 * Get a user by their email
 *
 * @param email - The email to look up
 * @returns The user, if found
 */
export async function getUserByEmail(email: string) {
  return db.user.findUnique({
    where: { email },
  });
}
