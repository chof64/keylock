import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";

export const keyUsersRouter = createTRPCRouter({
  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
        email: z.string().email().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return db.keyUser.create({
        data: {
          name: input.name,
          email: input.email,
          // platformUserId: ctx.session.user.id, // Optional: link to platform user if needed
        },
      });
    }),

  list: publicProcedure.query(async ({ ctx }) => {
    return db.keyUser.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        key: true, // Include the related Key record
      },
    });
  }),

  // Procedure to create a new key for a user
  createKey: publicProcedure
    .input(
      z.object({
        keyUserId: z.string(),
        keyId: z.string().min(1), // RFID tag ID
        name: z.string().optional(), // Optional friendly name for the key
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // In a real scenario, you might want to check if the keyId is already in use
      // or if the user already has a key.
      return db.key.create({
        data: {
          keyId: input.keyId,
          name: input.name,
          keyUserId: input.keyUserId,
          isActive: true,
        },
      });
    }),

  // Future procedures:
  // getById: publicProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
  //   return db.keyUser.findUnique({ where: { id: input.id } });
  // }),

  // update: publicProcedure
  //   .input(
  //     z.object({
  //       id: z.string(),
  //       name: z.string().min(1).optional(),
  //       email: z.string().email().optional(),
  //       isActive: z.boolean().optional(),
  //     }),
  //   )
  //   .mutation(async ({ ctx, input }) => {
  //     const { id, ...data } = input;
  //     return db.keyUser.update({
  //       where: { id },
  //       data,
  //     });
  //   }),

  // delete: publicProcedure
  //   .input(z.object({ id: z.string() }))
  //   .mutation(async ({ ctx, input }) => {
  //     return db.keyUser.delete({ where: { id: input.id } });
  //   }),

  // linkToPlatformUser: publicProcedure
  //  .input(z.object({ keyUserId: z.string(), platformUserId: z.string() }))
  //  .mutation(async ({ ctx, input }) => {
  //    // Ensure the platform user is the one making the request or an admin
  //    if (ctx.session.user.id !== input.platformUserId /* && !ctx.session.user.isAdmin */) {
  //      throw new TRPCError({ code: "FORBIDDEN" });
  //    }
  //    return db.keyUser.update({
  //      where: { id: input.keyUserId },
  //      data: { platformUserId: input.platformUserId },
  //    });
  //  }),
});
