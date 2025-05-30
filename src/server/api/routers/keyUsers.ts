import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import { TRPCError } from "@trpc/server";
import { mqttClient } from "~/server/mqtt/client"; // Import the MQTT client

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

  // Procedure to create a new key for a user
  createKey: publicProcedure
    .input(
      z.object({
        keyUserId: z.string(),
        keyId: z.string(),
        name: z.string().optional(),
        // nodeId: z.string(), // No longer expecting nodeId here based on frontend correction
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check if the RFID tag (keyId) is already registered for another user or as a standalone key
      const existingKey = await ctx.db.key.findFirst({
        where: {
          keyId: input.keyId,
          // NOT: {
          //   keyUserId: input.keyUserId, // Allow updating/reassigning to the same user if needed by future logic
          // },
        },
      });

      if (existingKey && existingKey.keyUserId !== input.keyUserId) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `RFID Tag ${input.keyId} is already assigned to another user.`,
        });
      }
      if (existingKey && existingKey.keyUserId === input.keyUserId) {
        // If the key exists and is already assigned to this user, it's a bit of an edge case.
        // For now, let's prevent creating a duplicate entry implicitly.
        // Depending on desired behavior, this could update the existing key or throw an error.
        // Or, if keys are unique by keyId, this scenario might be handled by an earlier check.
        throw new TRPCError({
          code: "CONFLICT",
          message: `RFID Tag ${input.keyId} is already assigned to this user.`,
        });
      }

      return ctx.db.key.create({
        data: {
          keyId: input.keyId,
          name: input.name,
          isActive: true,
          keyUser: {
            connect: { id: input.keyUserId },
          },
        },
      });
    }),

  // Procedure to delete a key
  deleteKey: publicProcedure
    .input(z.object({ keyId: z.string() })) // Input is the actual ID of the Key record
    .mutation(async ({ ctx, input }) => {
      // First, check if the key exists
      const keyToDelete = await ctx.db.key.findUnique({
        where: { id: input.keyId },
      });

      if (!keyToDelete) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Key not found.",
        });
      }

      // Delete the key
      await ctx.db.key.delete({
        where: { id: input.keyId },
      });

      return { success: true, message: "Key deleted successfully." };
    }),

  list: publicProcedure.query(({ ctx }) => {
    return db.keyUser.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        key: true, // Include the related Key record
      },
    });
  }),

  // Procedure to get the last scanned RFID tag for a specific node
  getScannedRfidTag: publicProcedure
    .input(z.object({ nodeId: z.string() }))
    .query(({ input }) => {
      const tagInfo = mqttClient.getLastScannedTag(input.nodeId);
      return tagInfo;
    }),

  // Procedure to clear the RFID cache for a specific node
  clearRfidCacheForNode: publicProcedure
    .input(z.object({ nodeId: z.string() }))
    .mutation(({ input }) => {
      mqttClient.clearScannedTagForNode(input.nodeId);
      return {
        success: true,
        message: `Cache cleared for node ${input.nodeId}`,
      };
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
