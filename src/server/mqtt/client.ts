import mqtt from "mqtt";
import { db } from "~/server/db";
import { env } from "~/env.js";

const MQTT_BROKER_URL = env.MQTT_BROKER_URL;
const HEALTH_TOPIC = "devices/keylock/health";
const SCANNED_RFID_TOPIC = "devices/keylock/scanned"; // New topic for scanned RFID tags

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
          console.log(`Subscribed to topic: ${HEALTH_TOPIC}`);
        }
      });
      // Subscribe to Scanned RFID Topic
      client?.subscribe(SCANNED_RFID_TOPIC, (err) => {
        if (err) {
          console.error("Failed to subscribe to scanned RFID topic:", err);
        } else {
          console.log(`Subscribed to topic: ${SCANNED_RFID_TOPIC}`);
        }
      });
    });

    client.on("message", async (topic, message) => {
      if (topic === HEALTH_TOPIC) {
        const rawMessage = message.toString();
        console.log(`Raw message received on topic ${topic}: ${rawMessage}`);
        try {
          const healthData = JSON.parse(rawMessage);
          const { nodeId, name, ...rest } = healthData;

          if (!nodeId) {
            console.warn(
              "Received healthcheck without nodeId. Full data:",
              healthData,
            );
            return;
          }

          console.log(
            `Parsed healthcheck from nodeId '${nodeId}'. Full data:`,
            healthData,
          );

          const result = await db.node.upsert({
            where: { id: nodeId },
            update: {
              name: name || undefined,
              lastSeen: new Date(),
            },
            create: {
              id: nodeId,
              name: name || undefined,
              lastSeen: new Date(),
            },
          });
          console.log(
            `Node '${nodeId}' upserted successfully. DB Result:`,
            result,
          );
        } catch (error) {
          console.error(
            `Error processing healthcheck message. Raw message: '${rawMessage}'. Error:`,
            error,
          );
        }
      } else if (topic === SCANNED_RFID_TOPIC) {
        const rawMessage = message.toString();
        console.log(`Raw message received on topic ${topic}: ${rawMessage}`);
        try {
          const scannedData = JSON.parse(rawMessage) as {
            nodeId: string;
            rfidTagId: string;
          };
          // Store the scanned tag with a timestamp
          lastScannedTags.set(scannedData.nodeId, {
            rfidTagId: scannedData.rfidTagId,
            timestamp: Date.now(),
          });
          console.log(
            `Stored scanned RFID from Node \'${scannedData.nodeId}\': ${scannedData.rfidTagId}`,
          );
        } catch (error) {
          console.error(
            `Error processing scanned RFID message. Raw message: \'${rawMessage}\'. Error:`,
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
