import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";

export const roomRouter = createTRPCRouter({
  create: publicProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return db.room.create({
        data: {
          name: input.name,
          // Ensure you have a way to associate with the user if needed, e.g. createdBy: ctx.session.user.id
        },
      });
    }),

  list: publicProcedure.query(async ({ ctx }) => {
    return db.room.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        nodes: true, // Include nodes associated with each room
      },
    });
  }),

  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return db.room.findUnique({
        where: { id: input.id },
        include: {
          nodes: true,
        },
      });
    }),

  update: publicProcedure
    .input(z.object({ id: z.string(), name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return db.room.update({
        where: { id: input.id },
        data: { name: input.name },
      });
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Consider implications: what happens to nodes in a deleted room?
      // Option 1: Set roomId to null for associated nodes
      await db.node.updateMany({
        where: { roomId: input.id },
        data: { roomId: null },
      });
      // Option 2: Prevent deletion if room has nodes (less common for this kind of management)
      // const room = await db.room.findUnique({ where: { id: input.id }, include: { nodes: true } });
      // if (room?.nodes && room.nodes.length > 0) {
      //   throw new Error("Cannot delete room with associated nodes. Please remove nodes first.");
      // }
      return db.room.delete({
        where: { id: input.id },
      });
    }),

  assignNode: publicProcedure
    .input(z.object({ roomId: z.string(), nodeId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return db.node.update({
        where: { id: input.nodeId },
        data: { roomId: input.roomId },
      });
    }),

  unassignNode: publicProcedure
    .input(z.object({ nodeId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return db.node.update({
        where: { id: input.nodeId },
        data: { roomId: null }, // Set roomId to null to unassign
      });
    }),
});
