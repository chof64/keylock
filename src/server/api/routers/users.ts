import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";

export const userRouter = createTRPCRouter({
  list: publicProcedure.query(async ({ ctx }) => {
    return db.user.findMany({
      orderBy: { name: "asc" }, // Default to ordering by name, can be adjusted
      // You might want to select specific fields to avoid over-fetching
      // select: { id: true, name: true, email: true },
    });
  }),
  // Add other user-related procedures here if needed, e.g., getById, create, update, delete
});
