import mqtt from "mqtt";
import { env } from "~/env";
import { db } from "~/server/db"; // Import db for logging
import { createCaller } from "~/server/api/root"; // To call the new tRPC procedure

const MQTT_BROKER_URL = env.MQTT_BROKER_URL;
const HEALTH_TOPIC = "devices/keylock/health";
const SCANNED_RFID_TOPIC_PREFIX = "devices/keylock/scanned/"; // Prefix for scanned RFID topics

// In-memory store for the last scanned RFID tag per node
// Stores { rfidTagId: string, timestamp: number }
const lastScannedTags = new Map<
  string,
  { rfidTagId: string; timestamp: number }
>();
const SCANNED_TAG_TTL_MS = 30000; // Tag is valid for 30 seconds

let client: mqtt.MqttClient | null = null;

export function connectMqtt() {
  if (!client?.connected) {
    client = mqtt.connect(MQTT_BROKER_URL);

    client.on("connect", () => {
      console.log("Connected to MQTT broker");
      // Subscribe to Health Topic
      client?.subscribe(HEALTH_TOPIC, (err) => {
        if (err) {
          console.error("Failed to subscribe to health topic:", err);
        } else {
          console.log("Subscribed to health topic:", HEALTH_TOPIC);
        }
      });
      // Subscribe to device-specific Scanned RFID Topics
      const deviceSpecificScannedTopic = `${SCANNED_RFID_TOPIC_PREFIX}+`; // '+' is a single-level wildcard
      client?.subscribe(deviceSpecificScannedTopic, (err) => {
        if (err) {
          console.error(
            "Failed to subscribe to scanned RFID topic pattern:",
            err,
          );
        } else {
          console.log(
            "Subscribed to scanned RFID topic pattern:",
            deviceSpecificScannedTopic,
          );
        }
      });
    });

    client.on("message", async (topic, message) => {
      const messageString = message.toString();
      console.log(`[MQTT] Received on '${topic}': '${messageString}'`);

      if (topic === HEALTH_TOPIC) {
        try {
          const healthData = JSON.parse(messageString);
          const { hostname, ip, status } = healthData;

          if (hostname && status === "online") {
            await db.node.upsert({
              where: { id: hostname }, // Assuming hostname is the unique ID for the node
              update: {
                name: hostname,
                lastSeen: new Date(),
                ipAddress: ip,
                status: status,
              }, // Added ipAddress and status
              create: {
                id: hostname,
                name: hostname,
                lastSeen: new Date(),
                ipAddress: ip,
                status: status,
              }, // Added ipAddress and status
            });
            console.log(`[MQTT Health] Node '${hostname}' updated/created.`);
          } else {
            console.warn("[MQTT Health] Invalid health data:", healthData);
          }
        } catch (error) {
          console.error(
            "[MQTT Health] Error processing health message:",
            error,
          );
        }
      } else if (topic.startsWith(SCANNED_RFID_TOPIC_PREFIX)) {
        const nodeId = topic.substring(SCANNED_RFID_TOPIC_PREFIX.length);
        const rfidTagId = messageString;
        console.log(
          `[MQTT Scan] RFID '${rfidTagId}' scanned at Node '${nodeId}'`,
        );

        // Store the scanned tag temporarily (optional, if needed for other purposes)
        lastScannedTags.set(nodeId, {
          rfidTagId,
          timestamp: Date.now(),
        });

        // Call the tRPC mutation to check access and notify the device
        try {
          const trpcCaller = createCaller({
            db,
            session: null,
            headers: new Headers(),
          }); // Create a caller instance
          const result =
            await trpcCaller.accessControl.checkAccessAndNotifyDevice({
              rfidTagId,
              nodeId,
            });
          console.log(
            `[AccessCheck] Result for RFID '${rfidTagId}' at Node '${nodeId}': Granted: ${result.granted}, Status: ${result.status}`,
          );
        } catch (error) {
          console.error(
            `[AccessCheck] Error calling checkAccessAndNotifyDevice for RFID '${rfidTagId}' at Node '${nodeId}':`,
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

// Function to retrieve the last scanned tag for a node
export const getLastScannedTag = (
  nodeId: string,
): { rfidTagId: string } | null => {
  const entry = lastScannedTags.get(nodeId);
  if (entry && Date.now() - entry.timestamp < SCANNED_TAG_TTL_MS) {
    // Optionally, clear the tag after retrieval to ensure it's used once
    // lastScannedTags.delete(nodeId);
    return { rfidTagId: entry.rfidTagId };
  }
  // Clear expired tag
  if (entry && Date.now() - entry.timestamp >= SCANNED_TAG_TTL_MS) {
    lastScannedTags.delete(nodeId);
  }
  return null;
};

// Function to get the last scanned tag for a node, respecting TTL
export const mqttClient = {
  connect: connectMqtt,
  getLastScannedTag: (nodeId: string): { rfidTagId: string } | null => {
    const entry = lastScannedTags.get(nodeId);
    if (entry && Date.now() - entry.timestamp < SCANNED_TAG_TTL_MS) {
      return { rfidTagId: entry.rfidTagId };
    }
    if (entry) {
      // Entry exists but expired
      lastScannedTags.delete(nodeId); // Clean up expired entry
    }
    return null;
  },

  /**
   * Clears the cached RFID tag for a specific node.
   * @param nodeId The ID of the node for which to clear the cache.
   */
  clearScannedTagForNode: (nodeId: string): void => {
    const deleted = lastScannedTags.delete(nodeId);
    if (deleted) {
      console.log(`MQTT Cache: Cleared tag for node ${nodeId}`);
    } else {
      // Optional: log if no tag was found to clear, or handle silently
      // console.log(`MQTT Cache: No tag to clear for node ${nodeId}, or node not found.`);
    }
  },

  // ...any other existing methods...
};
