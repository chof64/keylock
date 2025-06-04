import { createTRPCRouter, publicProcedure } from "../trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { Prisma } from "@prisma/client"; // Use "import type"

export const accessLogRouter = createTRPCRouter({
  list: publicProcedure
    .input(
      z.object({
        roomId: z.string().optional(),
        keyUserId: z.string().optional(),
        nodeId: z.string().optional(),
        cursor: z.string().nullish(),
        limit: z.number().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { roomId, keyUserId, nodeId, cursor, limit } = input;
      const where: Prisma.AccessLogWhereInput = {};

      if (roomId) {
        where.roomId = roomId;
      }
      if (keyUserId) {
        where.keyUserId = keyUserId;
      }
      if (nodeId) {
        where.nodeId = nodeId;
      }

      const items = await ctx.db.accessLog.findMany({
        take: limit + 1,
        where,
        cursor: cursor ? { id: cursor } : undefined,
        orderBy: {
          timestamp: "desc",
        },
        include: {
          keyUser: { select: { name: true, email: true } },
          node: { select: { name: true, id: true } },
          room: { select: { name: true, id: true } },
        },
      });

      let nextCursor: typeof cursor | undefined = undefined;
      if (items.length > limit) {
        const nextItem = items.pop();
        if (nextItem) {
          nextCursor = nextItem.id;
        }
      }
      return { items, nextCursor };
    }),

  recordAccess: publicProcedure
    .input(
      z.object({
        nodeId: z.string(),
        rfidTag: z.string(),
        accessGranted: z.boolean(),
        reason: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { nodeId, rfidTag, accessGranted, reason } = input;

      const node = await ctx.db.node.findUnique({
        where: { id: nodeId },
        select: { roomId: true },
      });

      if (!node) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Node with ID '${nodeId}' not found.`,
        });
      }

      let keyUserIdForLog: string | null = null;
      const key = await ctx.db.key.findUnique({
        where: { keyId: rfidTag }, // keyId is the unique RFID tag on Key model
        select: { keyUserId: true },
      });

      if (key?.keyUserId) {
        keyUserIdForLog = key.keyUserId;
      }

      const accessLog = await ctx.db.accessLog.create({
        data: {
          nodeId: nodeId,
          rfidTag: rfidTag, // This field exists in the AccessLog model
          accessGranted: accessGranted,
          reason: reason,
          roomId: node.roomId,
          keyUserId: keyUserIdForLog,
        },
      });
      return accessLog;
    }),
});
