import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import { getMqttClient } from "~/server/mqtt/client"; // To publish GRANT/DENY

export const accessControlRouter = createTRPCRouter({
  checkAccessAndNotifyDevice: publicProcedure
    .input(
      z.object({
        rfidTagId: z.string(),
        nodeId: z.string(), // This is the ESP32 hostname / MQTT client ID
      }),
    )
    .mutation(async ({ input }) => {
      const { rfidTagId, nodeId } = input;
      console.log(
        `[AccessControl] Check: RFID '${rfidTagId}' at Node '${nodeId}'`,
      );

      let accessGranted = false;
      let finalLogStatus = "ERROR_UNINITIALIZED";
      let finalLogMessage = `Initial access check for RFID ${rfidTagId} at Node ${nodeId}.`;
      let keyRecordIdForLog: string | null = null;
      let keyUserRecordIdForLog: string | null = null;
      let roomRecordIdForLog: string | null = null;

      try {
        const key = await db.key.findUnique({
          where: { keyId: rfidTagId },
          include: { keyUser: true },
        });

        if (!key) {
          finalLogStatus = "DENIED_RFID_NOT_FOUND";
          finalLogMessage = `RFID tag '${rfidTagId}' not found.`;
        } else {
          keyRecordIdForLog = key.id;
          if (!key.isActive) {
            finalLogStatus = "DENIED_RFID_INACTIVE";
            finalLogMessage = `RFID tag '${rfidTagId}' (ID: ${key.id}) is inactive.`;
          } else if (!key.keyUser) {
            finalLogStatus = "DENIED_KEY_NOT_ASSIGNED_TO_USER";
            finalLogMessage = `RFID tag '${rfidTagId}' (ID: ${key.id}) is not assigned to any KeyUser.`;
          } else {
            keyUserRecordIdForLog = key.keyUser.id;
            if (!key.keyUser.isActive) {
              finalLogStatus = "DENIED_KEYUSER_INACTIVE";
              finalLogMessage = `KeyUser '${key.keyUser.name}' (ID: ${key.keyUser.id}) for RFID '${rfidTagId}' is inactive.`;
            } else {
              const node = await db.node.findUnique({ where: { id: nodeId } });
              if (!node) {
                finalLogStatus = "DENIED_NODE_NOT_FOUND";
                finalLogMessage = `Node '${nodeId}' not found. KeyUser: '${key.keyUser.name}'.`;
              } else if (!node.roomId) {
                finalLogStatus = "DENIED_NODE_NOT_IN_ROOM";
                finalLogMessage = `Node '${nodeId}' (Room: None) is not assigned to a room. KeyUser: '${key.keyUser.name}'.`;
              } else {
                roomRecordIdForLog = node.roomId;
                const permission = await db.keyUserRoomPermission.findUnique({
                  where: {
                    keyUserId_roomId: {
                      keyUserId: key.keyUser.id,
                      roomId: node.roomId,
                    },
                  },
                });
                if (permission) {
                  accessGranted = true;
                  finalLogStatus = "GRANTED";
                  finalLogMessage = `Access GRANTED for KeyUser '${key.keyUser.name}' to Room '${node.roomId}' via Node '${nodeId}'.`;
                } else {
                  finalLogStatus = "DENIED_NO_ROOM_PERMISSION";
                  finalLogMessage = `KeyUser '${key.keyUser.name}' lacks permission for Room '${node.roomId}' at Node '${nodeId}'.`;
                }
              }
            }
          }
        }
        console.log(
          `[AccessControlOutcome] ${finalLogStatus}: ${finalLogMessage}`,
        );

        // if (keyRecordIdForLog) {
        //   await db.accessLog.create({
        //     data: {
        //       keyId: keyRecordIdForLog, // This should be the actual RFID tag ID string
        //       nodeId: nodeId,
        //       // roomId: roomRecordIdForLog, // roomId is not in AccessLog schema, remove or add to schema
        //       accessGranted: accessGranted,
        //       message: finalLogMessage.substring(0, 190), // Prisma default string limit often 191 or 255, check yours
        //       // keyUserId: keyUserRecordIdForLog, // keyUserId is not in AccessLog schema
        //     },
        //   });
        // } else if (finalLogStatus === "DENIED_RFID_NOT_FOUND") {
        //   // Log attempt for unknown RFID. Since keyId (the RFID tag) is the primary link,
        //   // and we don't have a key record, we might need a way to log attempts with unknown tags
        //   // if that's a requirement. For now, this specific case won't create an AccessLog entry
        //   // because `keyRecordIdForLog` (which we used as the RFID tag for logging) would be null.
        //   // We need to log the rfidTagId directly if no key record is found.
        //   await db.accessLog.create({
        //     data: {
        //       keyId: rfidTagId, // Log the scanned RFID tag ID directly
        //       nodeId: nodeId,
        //       accessGranted: false,
        //       message: (`RFID Tag ${rfidTagId} not found. Attempt from Node ${nodeId}.`).substring(0,190),
        //     }
        //   });
        //   console.log(`[AccessControl] RFID tag '${rfidTagId}' not found. AccessLog entry created with RFID tag.`);
        // }
      } catch (error) {
        accessGranted = false;
        finalLogStatus = "ERROR_PROCESSING_ACCESS_CHECK";
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        finalLogMessage = `Error during access check for RFID ${rfidTagId} at Node ${nodeId}: ${errorMessage}`;
        console.error(`[AccessControlError] ${finalLogMessage}`, error);
        // Attempt to log error if keyId was determined, otherwise only console
        // if (keyRecordIdForLog) {
        //     await db.accessLog.create({
        //         data: {
        //             keyId: keyRecordIdForLog, // This should be the actual RFID tag ID string
        //             nodeId: nodeId,
        //             // roomId: roomRecordIdForLog, // Not in schema
        //             accessGranted: false, // Error implies access was not granted
        //             message: finalLogMessage.substring(0, 190),
        //             // keyUserId: keyUserRecordIdForLog, // Not in schema
        //         },
        //     });
        // } else {
        //   // If an error occurred before we could identify the key, log with the raw RFID
        //   const errorMessage = error instanceof Error ? error.message : String(error); // Ensure errorMessage is defined here
        //   await db.accessLog.create({
        //     data: {
        //       keyId: rfidTagId, // Log the scanned RFID tag ID directly
        //       nodeId: nodeId,
        //       accessGranted: false,
        //       message: (`Error processing RFID ${rfidTagId} at Node ${nodeId}. Details: ${errorMessage}`).substring(0,190),
        //     }
        //   });
        // }
      }

      const mqttClientInstance = getMqttClient();
      if (mqttClientInstance?.connected) {
        const accessTopic = `devices/keylock/access/${nodeId}`;
        const message = accessGranted ? "GRANT" : "DENY";
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
