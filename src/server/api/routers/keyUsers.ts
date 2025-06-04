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
        key: true, // Corrected: Include the related key (singular)
      },
    });
  }),

  // Procedure to get the last scanned RFID tag for a specific node, specifically for create mode
  getScannedRfidTag: publicProcedure
    .input(
      z.object({ nodeId: z.string(), forCreateMode: z.boolean().optional() }),
    ) // Added forCreateMode
    .query(({ input }) => {
      // Pass the forCreateMode input to the MQTT client method
      const tagInfo = mqttClient.getLastScannedCard(
        input.nodeId,
        input.forCreateMode,
      );
      // Rename rfidTagId to cardId for consistency if it's part of the return type
      // Assuming getLastScannedCard returns { cardId: string } | null
      return tagInfo
        ? { cardId: tagInfo.cardId, rfidTagId: tagInfo.cardId } // Ensure rfidTagId is also returned if frontend expects it
        : null;
    }),

  // Renamed Procedure to clear the last scanned card for a specific node
  clearLastScannedCardForNode: publicProcedure // Renamed from clearRfidCacheForNode
    .input(z.object({ nodeId: z.string() }))
    .mutation(({ input }) => {
      mqttClient.clearLastScannedCard(input.nodeId); // Updated to new method name
      return {
        success: true,
        message: `Scanned card cache cleared for node ${input.nodeId}`,
      };
    }),

  // Procedure to command a node to enter key registration mode
  startKeyRegistrationOnNode: publicProcedure
    .input(z.object({ nodeId: z.string() }))
    .mutation(({ input }) => {
      const success = mqttClient.publishAdminCommand(input.nodeId, {
        command: "START_KEY_REGISTRATION",
      });
      if (!success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "Failed to send START_KEY_REGISTRATION command to node. MQTT client might be disconnected.",
        });
      }
      return {
        success: true,
        message: `Key registration mode started on node ${input.nodeId}.`,
      };
    }),

  // Procedure to notify the device of key registration success or failure
  notifyDeviceKeyRegistrationResult: publicProcedure
    .input(
      z.object({
        nodeId: z.string(),
        cardId: z.string(),
        registrationSuccess: z.boolean(),
      }),
    )
    .mutation(({ input }) => {
      const command = input.registrationSuccess
        ? "KEY_REG_SUCCESS"
        : "KEY_REG_FAIL";
      const success = mqttClient.publishAdminCommand(input.nodeId, {
        command: command,
        cardId: input.cardId,
      });
      if (!success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to send ${command} to node. MQTT client might be disconnected.`,
        });
      }
      return {
        success: true,
        message: `${command} notification sent for card ${input.cardId} to node ${input.nodeId}.`,
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
