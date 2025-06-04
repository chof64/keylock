import mqtt from "mqtt";
import { db } from "~/server/db";
import { env } from "~/env.js";

const MQTT_BROKER_URL = env.MQTT_BROKER_URL;
const HEALTH_TOPIC = "devices/keylock/health";

let client: mqtt.MqttClient | null = null;

export function connectMqtt() {
  if (!client?.connected) {
    client = mqtt.connect(MQTT_BROKER_URL);

    client.on("connect", () => {
      console.log("Connected to MQTT broker");
      client?.subscribe(HEALTH_TOPIC, (err) => {
        if (err) {
          console.error("Failed to subscribe to health topic:", err);
        } else {
          console.log(`Subscribed to topic: ${HEALTH_TOPIC}`);
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
            console.warn("Received healthcheck without nodeId. Full data:", healthData);
            return;
          }

          console.log(`Parsed healthcheck from nodeId '${nodeId}'. Full data:`, healthData);

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
          console.log(`Node '${nodeId}' upserted successfully. DB Result:`, result);
        } catch (error) {
          console.error(`Error processing healthcheck message. Raw message: '${rawMessage}'. Error:`, error);
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
