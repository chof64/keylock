"use client";

import mqtt from "mqtt";
import { useEffect, useState } from "react";

interface MqttMessage {
  topic: string;
  payload: string;
  timestamp: Date;
}

export default function MqttMessagesPage() {
  const [messages, setMessages] = useState<MqttMessage[]>([]);
  const [client, setClient] = useState<mqtt.MqttClient | null>(null);
  const [connectionStatus, setConnectionStatus] = useState("Disconnected");

  useEffect(() => {
    const mqttClient = mqtt.connect("ws://localhost:9001"); // Connect to MQTT broker via WebSocket

    mqttClient.on("connect", () => {
      setConnectionStatus("Connected");
      console.log("Connected to MQTT broker");
      mqttClient.subscribe("devices/keylock/health", (err) => {
        if (err) {
          console.error("Subscription error:", err);
          setConnectionStatus(`Subscription error: ${err.message}`);
        } else {
          console.log("Subscribed to devices/keylock/health");
        }
      });
    });

    mqttClient.on("message", (topic, payload) => {
      const newMessage: MqttMessage = {
        topic,
        payload: payload.toString(),
        timestamp: new Date(),
      };
      setMessages((prevMessages) => [newMessage, ...prevMessages].slice(0, 50)); // Keep last 50 messages
    });

    mqttClient.on("error", (err) => {
      console.error("MQTT error:", err);
      setConnectionStatus(`Error: ${err.message}`);
    });

    mqttClient.on("close", () => {
      setConnectionStatus("Disconnected");
      console.log("Disconnected from MQTT broker");
    });

    setClient(mqttClient);

    return () => {
      if (mqttClient) {
        mqttClient.end();
      }
    };
  }, []);

  return (
    <div className="container mx-auto p-4">
      <h1 className="mb-4 font-bold text-2xl">MQTT Messages</h1>
      <p className="mb-2">Connection Status: {connectionStatus}</p>
      <div className="max-h-96 overflow-y-auto rounded-lg bg-gray-100 p-4 shadow">
        {messages.length === 0 && <p>No messages received yet.</p>}
        <ul>
          {messages.map((msg, index) => (
            <li key={index} className="mb-2 border-gray-200 border-b p-2">
              <p className="text-gray-500 text-sm">
                {msg.timestamp.toLocaleTimeString()} - {msg.topic}
              </p>
              <pre className="whitespace-pre-wrap rounded bg-white p-2 text-sm">
                {msg.payload}
              </pre>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
