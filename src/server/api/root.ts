import { authRouter } from "~/server/api/routers/auth";
import { nodeRouter } from "~/server/api/routers/nodes"; // Importing nodeRouter
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";
import "~/server/mqtt/client"; // Import MQTT client to initialize it

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  auth: authRouter,
  nodes: nodeRouter, // Adding nodeRouter to the appRouter
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter);
