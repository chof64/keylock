import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createUser, getUserByEmail } from "~/lib/auth";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

// Schema for registration input validation
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().optional(),
});

export const authRouter = createTRPCRouter({
  register: publicProcedure
    .input(registerSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const { email, password, name } = input;

        // Check if user already exists
        const existingUser = await getUserByEmail(email);
        if (existingUser) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Email already in use",
          });
        }

        // Create the user (password will be hashed in the createUser function)
        const user = await createUser(email, password, name);

        // Return the created user (without sensitive information)
        return {
          id: user.id,
          email: user.email,
          name: user.name,
        };
      } catch (error) {
        // If it's already a TRPC error, rethrow it
        if (error instanceof TRPCError) {
          throw error;
        }

        console.error("Registration error:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to register user",
        });
      }
    }),
});
