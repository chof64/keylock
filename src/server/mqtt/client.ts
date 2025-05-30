import mqtt from "mqtt";
import { env } from "~/env";
import { db } from "~/server/db"; // Import db for logging
import { createCaller } from "~/server/api/root"; // To call the new tRPC procedure

const MQTT_BROKER_URL = env.MQTT_BROKER_URL;
const HEALTH_TOPIC_PATTERN = "devices/keylock/health/+"; // Updated to wildcard
const READ_TOPIC_PATTERN = "devices/keylock/read/+"; // Updated to wildcard and new name
const ADMIN_TOPIC_BASE = "devices/keylock/admin"; // Base for admin topics

// In-memory store for the last scanned RFID tag per node
// Stores { cardId: string, timestamp: number, isCreateMode: boolean }
const lastScannedCards = new Map<
  string,
  { cardId: string; timestamp: number; isCreateMode: boolean }
>();
const SCANNED_TAG_TTL_MS = 30000; // Tag is valid for 30 seconds for regular scans
// For create mode, the UI will poll. We store it here so getScannedRfidTag can pick it up.

let client: mqtt.MqttClient | null = null;

export function connectMqtt() {
  if (!client?.connected) {
    client = mqtt.connect(MQTT_BROKER_URL);

    client.on("connect", () => {
      console.log("Connected to MQTT broker");
      // Subscribe to Health Topic Pattern
      client?.subscribe(HEALTH_TOPIC_PATTERN, (err) => {
        if (err) {
          console.error("Failed to subscribe to health topic pattern:", err);
        } else {
          console.log(
            "Subscribed to health topic pattern:",
            HEALTH_TOPIC_PATTERN,
          );
        }
      });
      // Subscribe to device-specific Read Topics
      client?.subscribe(READ_TOPIC_PATTERN, (err) => {
        if (err) {
          console.error("Failed to subscribe to read topic pattern:", err);
        } else {
          console.log("Subscribed to read topic pattern:", READ_TOPIC_PATTERN);
        }
      });
    });

    client.on("message", async (topic, message) => {
      const messageString = message.toString();
      console.log(`[MQTT] Received on '${topic}': '${messageString}'`);

      if (topic.startsWith("devices/keylock/health/")) {
        try {
          const healthData = JSON.parse(messageString);
          // New payload: { "nodeId", "ipAddress", "macAddress", "signalStrength", "uptime" }
          const { nodeId, ipAddress, macAddress, signalStrength, uptime } =
            healthData;

          if (nodeId) {
            // Assuming nodeId is the primary identifier (hostname from ESP32)
            await db.node.upsert({
              where: { id: nodeId },
              update: {
                name: nodeId, // Assuming name is the same as nodeId/hostname
                lastSeen: new Date(),
                ipAddress: ipAddress,
                macAddress: macAddress, // Store MAC address
                signalStrength: String(signalStrength), // Store signal strength
                uptime: String(uptime), // Store uptime
              },
              create: {
                id: nodeId,
                name: nodeId,
                lastSeen: new Date(),
                ipAddress: ipAddress,
                macAddress: macAddress,
                signalStrength: String(signalStrength),
                uptime: String(uptime),
              },
            });
            console.log(`[MQTT Health] Node '${nodeId}' updated/created.`);
          } else {
            console.warn(
              "[MQTT Health] Invalid health data (missing nodeId):",
              healthData,
            );
          }
        } catch (error) {
          console.error(
            "[MQTT Health] Error processing health message:",
            error,
          );
        }
      } else if (topic.startsWith("devices/keylock/read/")) {
        // const extractedNodeIdFromTopic = topic.substring("devices/keylock/read/".length);
        try {
          const readData = JSON.parse(messageString);
          // New payload: { "nodeId", "ipAddress", "macAddress", "cardId", "isCreateMode" }
          const { nodeId, ipAddress, macAddress, cardId, isCreateMode } =
            readData;

          console.log(
            `[MQTT Read] Card '${cardId}' read at Node '${nodeId}' (isCreateMode: ${isCreateMode}). IP: ${ipAddress}, MAC: ${macAddress}`,
          );

          // Store the scanned card temporarily, including its mode
          lastScannedCards.set(nodeId, {
            cardId,
            timestamp: Date.now(),
            isCreateMode: !!isCreateMode, // Ensure boolean
          });

          if (!isCreateMode) {
            const trpcCaller = createCaller({
              db,
              session: null,
              headers: new Headers(),
            });
            const result =
              await trpcCaller.accessControl.checkAccessAndNotifyDevice({
                rfidTagId: cardId, // Use cardId from payload
                nodeId: nodeId, // Use nodeId from payload
              });
            console.log(
              `[AccessCheck] Result for Card '${cardId}' at Node '${nodeId}': Granted: ${result.granted}, Status: ${result.status}`,
            );
          } else {
            console.log(
              `[MQTT Read] Node '${nodeId}' is in key creation mode. Card '${cardId}' logged for UI pickup.`,
            );
            // The UI (page.tsx) polls `keyUsers.getScannedRfidTag` which will now get this cardId.
            // The actual key creation is initiated by the UI via `keyUsers.createKey` mutation.
            // After `createKey` succeeds or fails, the UI should then call another tRPC mutation
            // (e.g., `keyManagement.notifyDeviceRegistrationStatus`) which will publish
            // KEY_REG_SUCCESS or KEY_REG_FAIL back to the device.
            // For now, we just log it here. The ESP32 will timeout if no KEY_REG_SUCCESS/FAIL is received.
          }
        } catch (error) {
          console.error(
            `[MQTT Read] Error processing read message for topic '${topic}':`,
            error,
          );
        }
      }
    });

    client.on("error", (err) => {
      console.error("MQTT client error:", err);
      // Optional: attempt to reconnect or handle error appropriately
      // client?.end(); // Close connection if error is critical
      // client = null; // Reset client to allow reconnection attempt
    });

    client.on("close", () => {
      console.log("MQTT connection closed");
      // Optional: attempt to reconnect
      // client = null;
    });

    client.on("offline", () => {
      console.log("MQTT client offline");
      // Optional: attempt to reconnect
      // client = null;
    });
  }
  return client;
}

// Initialize MQTT connection when the server starts
// Note: In a Next.js app, this will run when the module is first imported.
// For serverless environments, this might mean it connects on each function invocation
// if the instance is not warm. Consider connection management strategies for your deployment.
if (process.env.NODE_ENV !== "test") {
  // Avoid running in test environments if not needed
  connectMqtt();
}

// Optional: Export a function to get the client instance if needed elsewhere
export const getMqttClient = () => client;

// Function to retrieve the last scanned card for a node
// Updated to consider isCreateMode for specific retrieval by the UI
export const getLastScannedCard = (
  nodeId: string,
  forCreateMode?: boolean, // If true, only return if the scan was in create mode
): { cardId: string } | null => {
  const entry = lastScannedCards.get(nodeId);
  if (!entry) return null;

  // If forCreateMode is true, only return if the scan was a create mode scan.
  // The TTL for create mode scans is handled by the UI polling; if it's old, UI won't use it.
  if (forCreateMode) {
    if (entry.isCreateMode) {
      // For create mode, we don't strictly need a TTL here as the UI controls the listening window.
      // However, to prevent very old create mode scans from being picked up if UI state is weird,
      // we can add a longer TTL or rely on UI to clear it.
      // For now, if it's a create mode scan, return it.
      return { cardId: entry.cardId };
    }
    return null; // Not a create mode scan, or no scan for this node
  }

  // For regular scans, respect the TTL
  if (
    !entry.isCreateMode &&
    Date.now() - entry.timestamp < SCANNED_TAG_TTL_MS
  ) {
    return { cardId: entry.cardId };
  }

  // Clear expired non-create-mode card or if it was a create mode scan not requested for create mode
  if (
    Date.now() - entry.timestamp >= SCANNED_TAG_TTL_MS ||
    (entry.isCreateMode && !forCreateMode)
  ) {
    lastScannedCards.delete(nodeId);
  }
  return null;
};

// Function to clear the last scanned card for a node (e.g., when UI starts a new scan session)
export const clearLastScannedCard = (nodeId: string) => {
  lastScannedCards.delete(nodeId);
  console.log(`[MQTT Cache] Cleared for node ${nodeId}.`);
};

// Function to publish admin commands, e.g., to start/stop key registration mode
export const publishAdminCommand = (nodeId: string, command: object) => {
  if (!client || !client.connected) {
    console.error("[MQTT Admin] Client not connected. Cannot send command.");
    return false;
  }
  const topic = `${ADMIN_TOPIC_BASE}/${nodeId}`;
  const message = JSON.stringify(command);
  console.log(`[MQTT Admin] Publishing to '${topic}': ${message}`);
  client.publish(topic, message, { qos: 1 }, (err) => {
    if (err) {
      console.error(`[MQTT Admin] Failed to publish command to ${topic}:`, err);
    }
  });
  return true;
};

// Updated mqttClient export to include new functions
export const mqttClient = {
  connect: connectMqtt,
  getLastScannedCard,
  clearLastScannedCard,
  publishAdminCommand,
  getClient: getMqttClient, // Expose the raw client if needed
};
