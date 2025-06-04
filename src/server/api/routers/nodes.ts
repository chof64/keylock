import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { z } from "zod";

export const nodeRouter = createTRPCRouter({
  getAll: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.node.findMany({
      orderBy: {
        lastSeen: "desc",
      },
    });
  }),

  healthcheck: publicProcedure
    .input(z.object({ nodeId: z.string(), name: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { nodeId, name } = input;
      return ctx.db.node.upsert({
        where: { id: nodeId },
        update: { name, lastSeen: new Date() },
        create: { id: nodeId, name, lastSeen: new Date() },
      });
    }),
});
