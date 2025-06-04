import { authRouter } from "~/server/api/routers/auth";
import { nodeRouter } from "~/server/api/routers/nodes"; // Importing nodeRouter
import { roomRouter } from "~/server/api/routers/rooms"; // Importing roomRouter
import { keyUsersRouter } from "~/server/api/routers/keyUsers"; // Importing keyUsersRouter
import { userRouter } from "~/server/api/routers/users"; // Importing userRouter
import { accessControlRouter } from "~/server/api/routers/accessControl"; // Import the new access control router
import { accessLogRouter } from "~/server/api/routers/accessLogs"; // Added import for accessLogRouter
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
  rooms: roomRouter, // Adding roomRouter to the appRouter
  keyUsers: keyUsersRouter, // Adding keyUsersRouter to the appRouter
  users: userRouter, // Adding userRouter to the appRouter
  accessControl: accessControlRouter, // Add the access control router
  accessLogs: accessLogRouter, // Added accessLogRouter to the appRouter
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
