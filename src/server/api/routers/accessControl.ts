import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc"; // db might be directly from trpc if exported there
import { db } from "~/server/db";
import { getMqttClient } from "~/server/mqtt/client"; // To publish GRANT/DENY
import { createCaller } from "~/server/api/root"; // For internal tRPC calls
import { createTRPCContext } from "~/server/api/trpc"; // To create context for internal calls

export const accessControlRouter = createTRPCRouter({
  checkAccessAndNotifyDevice: publicProcedure
    .input(
      z.object({
        rfidTagId: z.string(),
        nodeId: z.string(), // This is the ESP32 hostname / MQTT client ID
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Add ctx here
      const { rfidTagId, nodeId } = input;
      console.log(
        `[AccessControl] Check: RFID '${rfidTagId}' at Node '${nodeId}'`,
      );

      let accessGranted = false;
      let finalLogStatus = "ERROR_UNINITIALIZED";
      let finalLogMessage = `Initial access check for RFID ${rfidTagId} at Node ${nodeId}.`;
      // let keyRecordIdForLog: string | null = null; // No longer needed here for logging
      // let keyUserRecordIdForLog: string | null = null; // No longer needed here for logging
      // let roomRecordIdForLog: string | null = null; // No longer needed here for logging

      try {
        const key = await db.key.findUnique({
          // Use db from ctx if available, or imported db
          where: { keyId: rfidTagId },
          include: { keyUser: { include: { roomPermissions: true } } },
        });

        if (!key) {
          finalLogStatus = "DENIED_RFID_NOT_FOUND";
          finalLogMessage = `RFID Tag '${rfidTagId}' not found in database.`;
          accessGranted = false;
        } else {
          // keyRecordIdForLog = key.id; // Store original key ID (RFID tag) for logging if needed, but recordAccess uses rfidTagId
          if (!key.isActive) {
            finalLogStatus = "DENIED_KEY_INACTIVE";
            finalLogMessage = `Key (RFID Tag '${rfidTagId}') is inactive.`;
            accessGranted = false;
          } else if (!key.keyUser) {
            finalLogStatus = "DENIED_KEY_NOT_ASSIGNED_TO_USER";
            finalLogMessage = `Key (RFID Tag '${rfidTagId}') is not assigned to any user.`;
            accessGranted = false;
          } else if (!key.keyUser.isActive) {
            finalLogStatus = "DENIED_USER_INACTIVE";
            finalLogMessage = `User '${key.keyUser.name}' (assigned to RFID '${rfidTagId}') is inactive.`;
            accessGranted = false;
            // keyUserRecordIdForLog = key.keyUser.id;
          } else {
            // keyUserRecordIdForLog = key.keyUser.id;
            const node = await db.node.findUnique({
              // Use db from ctx or imported db
              where: { id: nodeId },
              select: { roomId: true, name: true },
            });

            if (!node) {
              finalLogStatus = "ERROR_NODE_NOT_FOUND";
              finalLogMessage = `Node with ID '${nodeId}' not found in database. Cannot verify room access.`;
              accessGranted = false;
            } else if (!node.roomId) {
              finalLogStatus = "DENIED_NODE_NOT_IN_ROOM";
              finalLogMessage = `Node '${node.name ?? nodeId}' is not assigned to any room. Access denied by default.`;
              accessGranted = false;
            } else {
              // roomRecordIdForLog = node.roomId;
              const hasPermission = key.keyUser.roomPermissions.some(
                (permission) => permission.roomId === node.roomId,
              );

              if (hasPermission) {
                accessGranted = true;
                finalLogStatus = "GRANTED";
                finalLogMessage = `Access GRANTED for User '${key.keyUser.name}' (RFID '${rfidTagId}') to Room via Node '${node.name ?? nodeId}'.`;
              } else {
                finalLogStatus = "DENIED_NO_ROOM_PERMISSION";
                finalLogMessage = `User '${key.keyUser.name}' (RFID '${rfidTagId}') does not have permission for the room associated with Node '${node.name ?? nodeId}'.`;
                accessGranted = false;
              }
            }
          }
        }
        console.log(
          `[AccessControlOutcome] ${finalLogStatus}: ${finalLogMessage}`,
        );

        // Call accessLogs.recordAccess to log the attempt
        try {
          const internalCallerContext = await createTRPCContext({
            headers: new Headers(),
          });
          const accessLogCaller = createCaller(internalCallerContext);

          await accessLogCaller.accessLogs.recordAccess({
            nodeId: nodeId,
            rfidTag: rfidTagId,
            accessGranted: accessGranted,
            reason: finalLogMessage,
          });
          console.log(
            `[AccessControl] Access attempt logged for RFID '${rfidTagId}' at Node '${nodeId}'.`,
          );
        } catch (logError) {
          console.error(
            `[AccessControl] Failed to record access log for RFID '${rfidTagId}' at Node '${nodeId}':`,
            logError,
          );
          // Do not let logging failure prevent MQTT response
        }
      } catch (error) {
        accessGranted = false;
        finalLogStatus = "ERROR_PROCESSING_ACCESS_CHECK";
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        finalLogMessage = `Error during access check for RFID ${rfidTagId} at Node ${nodeId}: ${errorMessage}`;
        console.error(`[AccessControlError] ${finalLogMessage}`, error);
        // Attempt to log this error event as well
        try {
          const internalCallerContext = await createTRPCContext({
            headers: new Headers(),
          });
          const accessLogCaller = createCaller(internalCallerContext);

          await accessLogCaller.accessLogs.recordAccess({
            nodeId: nodeId,
            rfidTag: rfidTagId,
            accessGranted: false, // Access was not granted due to error
            reason: finalLogMessage,
          });
          console.log(
            `[AccessControl] Error event logged for RFID '${rfidTagId}' at Node '${nodeId}'.`,
          );
        } catch (logError) {
          console.error(
            `[AccessControl] Failed to record error event log for RFID '${rfidTagId}' at Node '${nodeId}':`,
            logError,
          );
        }
      }

      const mqttClientInstance = getMqttClient();
      if (mqttClientInstance?.connected) {
        const accessTopic = `devices/keylock/access/${nodeId}`;
        const message = accessGranted ? "ALLOW" : "DENY"; // Changed from GRANT/DENY to ALLOW/DENY
        mqttClientInstance.publish(accessTopic, message, { qos: 1 }, (err) => {
          if (err) {
            console.error(`[MQTT] Failed to publish to ${accessTopic}: ${err}`);
          } else {
            console.log(`[MQTT] Published '${message}' to ${accessTopic}`);
          }
        });
      } else {
        console.error(
          "[MQTT] Client not connected. Cannot publish access result.",
        );
      }
      return {
        granted: accessGranted,
        status: finalLogStatus,
        details: finalLogMessage,
      };
    }),
});
