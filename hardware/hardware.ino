#include <ESPmDNS.h>
#include <WiFi.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <PubSubClient.h> // Added MQTT client library
#include <ArduinoOTA.h>   // For Over-the-Air updates

// --- Configuration Constants ---
// OLED Display Settings
#define I2C_SDA 21       // ESP32 pin D21 for OLED SDA
#define I2C_SCL 22       // ESP32 pin D22 for OLED SCL
#define SCREEN_WIDTH 128 // OLED display width, in pixels
#define SCREEN_HEIGHT 64 // OLED display height, in pixels
#define OLED_RESET -1    // Reset pin # (or -1 if sharing ESP32 reset pin)

// MQTT Broker Settings
const char *MQTT_SERVER_IP = "192.168.1.108"; // Your MQTT broker IP address
const uint16_t MQTT_SERVER_PORT = 1883;       // Your MQTT broker port

// --- WiFi Credentials ---
// Define a structure to hold Wi-Fi credentials
struct WiFiCredentials
{
  const char *ssid;
  const char *password;
};

WiFiCredentials wifiNetworks[] = {
    {"line.chof64.me", "Passcode7-Defrost-Tanned"},
};
const int numNetworks = sizeof(wifiNetworks) / sizeof(wifiNetworks[0]);

// --- Global Variables & Object Instances ---
// Device Settings
char hostname[32]; // Dynamic hostname for the device, set in setup()

// OLED Display Object
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// WiFi & MQTT Client Objects
WiFiClient espClient;
PubSubClient mqttClient(espClient);

// MQTT Settings (Topics, Timers)
const char *mqttHealthCheckTopic = "devices/keylock/health"; // MQTT Topic for Health Check
unsigned long mqttLastAttemptMillis = 0;                     // For MQTT connection retry timing
const long mqttRetryInterval = 5000;                         // Retry MQTT connection every 5 seconds

// General Timers
unsigned long previousMillis = 0;        // For Wi-Fi check timing
const long interval = 10000;             // Interval to check Wi-Fi status (10 seconds)
unsigned long lastHealthCheckMillis = 0; // Timer for health check
const long healthCheckInterval = 5000;   // Interval for health check (5 seconds)

// --- Function Prototypes (Optional for .ino, but good for clarity) ---
void updateOledStatus(String line1, String line2 = "");
void mqttCallback(char *topic, byte *payload, unsigned int length);
void publishHealthCheck();
void connectToMqttBroker();
void connectToWiFi();
void setupOTA();

// --- Main Functions ---
void setup()
{
  Serial.begin(115200);
  delay(100); // Wait for serial to initialize

  // Initialize hostname based on MAC address
  WiFi.mode(WIFI_STA); // Initialize WiFi station mode early to get MAC address
  String mac = WiFi.macAddress();
  mac.replace(":", ""); // Remove colons from MAC address
  sprintf(hostname, "keylock-%s", mac.c_str());
  Serial.print("Device Hostname (MQTT Client ID & OTA Hostname) set to: ");
  Serial.println(hostname);

  // Initialize OLED Display
  Wire.begin(I2C_SDA, I2C_SCL);
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C))
  {
    Serial.println(F("SSD1306 allocation failed"));
    // Don't hang indefinitely, let the rest of the setup proceed or handle error
  }
  else
  {
    Serial.println(F("SSD1306 Initialized"));
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);
    updateOledStatus("Booting...", String(hostname)); // Initial message
  }

  connectToWiFi(); // Connect to WiFi (this will also attempt MQTT connection if WiFi succeeds)

  setupOTA(); // Setup Over-the-Air updates
}

void loop()
{
  unsigned long currentMillis = millis();

  ArduinoOTA.handle(); // Must be called regularly to handle OTA requests

  // Check Wi-Fi status periodically and attempt to reconnect if lost
  if (WiFi.status() != WL_CONNECTED && (currentMillis - previousMillis >= interval))
  {
    previousMillis = currentMillis;
    if (mqttClient.connected())
    {
      mqttClient.disconnect(); // Disconnect MQTT if WiFi is lost
      updateOledStatus("MQTT Disconnected", "WiFi Lost");
    }
    Serial.println("WiFi connection lost. Attempting to reconnect...");
    updateOledStatus("WiFi Lost!", "Reconnecting...");
    connectToWiFi(); // Attempt to reconnect. This will also try MQTT connection if WiFi connects.
  }

  // If WiFi is connected, but MQTT client is not connected, try to connect
  // connectToMqttBroker() has its own retry timing logic
  if (WiFi.status() == WL_CONNECTED && !mqttClient.connected())
  {
    connectToMqttBroker();
  }

  // If MQTT is connected, run the client loop and publish health checks
  if (mqttClient.connected())
  {
    mqttClient.loop(); // Process incoming messages and maintain connection

    // Publish health check periodically
    if (currentMillis - lastHealthCheckMillis >= healthCheckInterval)
    {
      lastHealthCheckMillis = currentMillis;
      publishHealthCheck();
    }
  }

  // Add other tasks for your loop here
  delay(10); // Small delay to allow ESP32 background tasks and prevent watchdog reset
}

// --- Helper Functions ---

// Function to update OLED display
void updateOledStatus(String line1, String line2) // Default argument removed from definition
{
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println(line1);
  if (line2 != "")
  {
    display.setCursor(0, 10); // Adjust Y position for the second line
    display.println(line2);
  }
  display.display();
}

// MQTT Callback function (called when a message arrives)
void mqttCallback(char *topic, byte *payload, unsigned int length)
{
  Serial.print("Message arrived [");
  Serial.print(topic);
  Serial.print("] ");
  String messageTemp;
  for (unsigned int i = 0; i < length; i++)
  {
    messageTemp += (char)payload[i];
  }
  Serial.println(messageTemp);
  // Add OLED display update for received message if desired
  updateOledStatus("MQTT Msg Rcvd", topic);
}

// Function to publish health check status
void publishHealthCheck()
{
  if (!mqttClient.connected())
  {
    return;
  }

  // Gather information
  String macAddress = WiFi.macAddress();
  String ipAddress = WiFi.localIP().toString();
  String ssid = WiFi.SSID();
  long uptimeMillis = millis(); // Uptime in milliseconds

  // Create JSON payload (example)
  // Note: For more complex JSON, consider using the ArduinoJson library
  String payload = "{";
  payload += "\"macAddress\":\"" + macAddress + "\",";
  payload += "\"ipAddress\":\"" + ipAddress + "\",";
  payload += "\"ssid\":\"" + ssid + "\",";
  payload += "\"uptimeMillis\":" + String(uptimeMillis) + ",";
  payload += "\"mqttConnected\":true,";                     // Assuming this function is called when MQTT is connected
  payload += "\"timestamp\":\"" + String(millis()) + "\"}"; // Simple timestamp

  if (mqttClient.publish(mqttHealthCheckTopic, payload.c_str()))
  {
    Serial.print("Health check published to ");
    Serial.println(mqttHealthCheckTopic);
    // updateOledStatus("Health Check Sent", ""); // Optional: Update OLED
  }
  else
  {
    Serial.println("Failed to publish health check.");
    // updateOledStatus("Health Check Fail", ""); // Optional: Update OLED
  }
}

// Function to connect to the MQTT Broker
void connectToMqttBroker()
{
  if (WiFi.status() != WL_CONNECTED) // Simplified check: only attempt if WiFi is connected
  {
    return; // Don't attempt if WiFi is down
  }

  if (mqttClient.connected())
  {
    return; // Already connected
  }

  unsigned long currentMillis = millis();
  // Check if it's time to retry MQTT connection
  if (currentMillis - mqttLastAttemptMillis < mqttRetryInterval)
  {
    return; // Not time to retry yet
  }
  mqttLastAttemptMillis = currentMillis; // Update last attempt time

  Serial.print("Attempting MQTT connection to ");
  Serial.print(MQTT_SERVER_IP);
  Serial.print(":");
  Serial.print(MQTT_SERVER_PORT);
  Serial.print(" as ");
  Serial.println(hostname);
  updateOledStatus("MQTT Connecting...", String(MQTT_SERVER_IP) + ":" + String(MQTT_SERVER_PORT));

  // Configure MQTT server and callback
  mqttClient.setServer(MQTT_SERVER_IP, MQTT_SERVER_PORT);
  mqttClient.setCallback(mqttCallback);

  if (mqttClient.connect(hostname))
  {
    Serial.println("MQTT connected");
    updateOledStatus("MQTT Connected!", String(MQTT_SERVER_IP));

    // Publish an initial health check upon connection
    lastHealthCheckMillis = millis(); // Reset timer to send immediate health check
    publishHealthCheck();
  }
  else
  {
    Serial.print("MQTT connect failed, rc=");
    Serial.print(mqttClient.state());
    Serial.println(" try again in " + String(mqttRetryInterval / 1000) + " seconds");
    String mqttError = "MQTT Failed: " + String(mqttClient.state());
    updateOledStatus(mqttError, String(MQTT_SERVER_IP));
  }
}

// Function to connect to WiFi
void connectToWiFi()
{
  Serial.println("Connecting to WiFi...");
  WiFi.mode(WIFI_STA); // Set ESP32 to Wi-Fi station mode

  for (int i = 0; i < numNetworks; ++i)
  {
    Serial.print("Attempting to connect to SSID: ");
    Serial.println(wifiNetworks[i].ssid);
    updateOledStatus("Trying SSID:", wifiNetworks[i].ssid);
    WiFi.begin(wifiNetworks[i].ssid, wifiNetworks[i].password);

    unsigned long startTime = millis();
    while (WiFi.status() != WL_CONNECTED && (millis() - startTime < 15000))
    { // Try each network for 15 seconds
      delay(500);
      Serial.print(".");
    }
    Serial.println();

    if (WiFi.status() == WL_CONNECTED)
    {
      Serial.println("");
      Serial.println("WiFi connected!");
      Serial.print("IP address: ");
      Serial.println(WiFi.localIP());
      Serial.print("Connected to SSID: ");
      Serial.println(wifiNetworks[i].ssid);
      updateOledStatus("WiFi Connected!", "SSID: " + String(wifiNetworks[i].ssid));

      // After WiFi connection, attempt to connect to MQTT directly
      // Reset MQTT last attempt time to allow immediate connection attempt
      mqttLastAttemptMillis = 0;
      connectToMqttBroker(); // This will attempt connection now
      return;                // Exit function once connected
    }
    else
    {
      Serial.print("Failed to connect to SSID: ");
      Serial.println(wifiNetworks[i].ssid);
      updateOledStatus("Failed to connect", "SSID: " + String(wifiNetworks[i].ssid));
      WiFi.disconnect(); // Ensure we are disconnected before trying the next network
      delay(1000);       // Wait a bit before trying the next network
    }
  }

  Serial.println("Unable to connect to any WiFi network.");
  updateOledStatus("Connection Failed", "Check credentials");
}

// Function to setup OTA
void setupOTA()
{
  if (WiFi.status() == WL_CONNECTED)
  {
    ArduinoOTA.setHostname(hostname); // Use hostname as the OTA hostname

    // Optional: Set a password for OTA updates for security
    // ArduinoOTA.setPassword("your_strong_password");

    ArduinoOTA
        .onStart([]()
                 {
        String type;
        if (ArduinoOTA.getCommand() == U_FLASH) {
          type = "sketch";
        } else { // U_SPIFFS
          type = "filesystem";
        }
        Serial.println("Start updating " + type);
        updateOledStatus("OTA Update Start", type); })
        .onEnd([]()
               {
        Serial.println("\nEnd");
        updateOledStatus("OTA Update End", "Rebooting...");
        delay(1000); })
        .onProgress([](unsigned int progress, unsigned int total)
                    {
        Serial.printf("Progress: %u%%\r", (progress / (total / 100)));
        String progressStr = "Progress: " + String((progress / (total / 100))) + "%";
        updateOledStatus("OTA Updating...", progressStr); })
        .onError([](ota_error_t error)
                 {
        Serial.printf("Error[%u]: ", error);
        String errorMsg = "OTA Error: ";
        if (error == OTA_AUTH_ERROR) errorMsg += "Auth Failed";
        else if (error == OTA_BEGIN_ERROR) errorMsg += "Begin Failed";
        else if (error == OTA_CONNECT_ERROR) errorMsg += "Connect Failed";
        else if (error == OTA_RECEIVE_ERROR) errorMsg += "Receive Failed";
        else if (error == OTA_END_ERROR) errorMsg += "End Failed";
        else errorMsg += String(error);
        Serial.println(errorMsg);
        updateOledStatus("OTA Error!", errorMsg.substring(0,15)); // Show first 15 chars of error
        delay(2000); });

    ArduinoOTA.begin();
    Serial.println("OTA Ready");
    Serial.print("OTA Hostname: ");
    Serial.println(hostname);
    updateOledStatus("OTA Ready", String(hostname));
  }
  else
  {
    Serial.println("OTA Setup Failed: WiFi not connected.");
    updateOledStatus("OTA Setup Failed", "No WiFi");
  }
}
