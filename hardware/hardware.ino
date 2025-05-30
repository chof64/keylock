// Centralized Door Lock System - ESP32 Firmware

// ======================================================================================
// 0. LIBRARY IMPORTS
// ======================================================================================
#include <WiFi.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <SPI.h>
#include <MFRC522v2.h>
#include <MFRC522DriverSPI.h>
#include <MFRC522DriverPinSimple.h>
#include <MFRC522Debug.h>
#include <ArduinoJson.h> // For JSON parsing in admin commands

// ======================================================================================
// 1. VARIABLES
// ======================================================================================

// 1.1 Pin Definitions
// --------------------------------------------------------------------------------------
// OLED Display (0.96 inch)
#define OLED_SDA_PIN 26 // D26
#define OLED_SCL_PIN 27 // D27
#define SCREEN_WIDTH 128 // OLED display width, in pixels
#define SCREEN_HEIGHT 64 // OLED display height, in pixels
#define OLED_RESET -1    // Reset pin # (or -1 if sharing Arduino reset pin)

// Active Buzzer
#define BUZZER_PIN 25 // D25

// Mini RFID-RC522 Module
#define RFID_RST_PIN 21  // D21
#define RFID_SS_PIN 5    // D5 (SDA on components.md, SPI SS)
#define RFID_IRQ_PIN 33  // D33 (Not connected as per components.md, but define kept)
// SPI Pins for RFID
#define RFID_SCK_PIN 18  // D18
#define RFID_MISO_PIN 19 // D19
#define RFID_MOSI_PIN 23 // D23

// 1.2 WiFi Credentials and related configuration
// --------------------------------------------------------------------------------------
struct WifiNetwork
{
  const char *ssid;
  const char *password;
};

WifiNetwork wifiNetworks[] = {
    // {"line.chof64.me", "Passcode7-Defrost-Tanned"},
    {"aabbcc00xxyyzz", "a1b2c300"},
    // {"milqueTEAcafe_5G", "MilqueTea_80"},
    // {"milqueTEAcafe", "MilqueTea_80"}
};
const int numWifiNetworks = sizeof(wifiNetworks) / sizeof(wifiNetworks[0]);

// Variables for enhanced WiFi/MQTT connection logic
int currentWifiNetworkIndex = 0;

// 1.3 MQTT and related configuration
// --------------------------------------------------------------------------------------
IPAddress mqtt_server_ip(192, 168, 57, 97); // Static IP address of the MQTT server
const int mqtt_port = 1883;                 // MQTT server port
// const char *health_topic = "devices/keylock/health"; // Old static health topic
char health_topic_dynamic[100]; // Buffer for device-specific health topic: devices/keylock/health/[hostname]

char read_topic[100];         // Buffer for device-specific read topic: devices/keylock/read/[hostname] (renamed from scanned_rfid_topic)
char access_topic[100];       // Buffer for device-specific access control topic: devices/keylock/access/[hostname]
char admin_topic[100];        // Buffer for device-specific admin commands: devices/keylock/admin/[hostname]
// char register_key_topic[100]; // Removed: Key registration will use the read_topic with a flag

// IPAddress mqttServerIp; // Removed: Redundant, mqtt_server_ip is used directly

// unsigned long lastMqttAttemptMillis = 0; // Removed: Not used in current retry logic
const long mqttRetryInterval = 15000;    // Interval for retrying MQTT connection (15 seconds)
int mqttConnectRetryCount = 0;
const int MAX_MQTT_RETRIES_PER_WIFI = 3; // Max MQTT retries before trying next WiFi

// Global variables for MQTT Health Check
unsigned long lastHealthCheck = 0;
const unsigned long healthCheckInterval = 30000; // 30 seconds health check interval
const unsigned long KEY_REGISTRATION_TIMEOUT = 10000; // 10 seconds for key registration mode

// 1.4 Other Global Variables and Object Instances
// --------------------------------------------------------------------------------------
String hostname;                    // Device hostname, e.g., keylock-[MAC_ADDRESS]
bool keyCreationModeActive = false;         // Flag to indicate if the device is in key creation mode
unsigned long lastRFIDScanMessageTime = 0;  // Timestamp of the last periodic message in key creation mode
unsigned long keyCreationModeStartTime = 0; // Timestamp when key creation mode was started

WiFiClient espClient;               // TCP client for MQTT
PubSubClient mqttClient(espClient); // MQTT client

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET); // OLED display object

MFRC522DriverPinSimple ss_pin(RFID_SS_PIN); // Define SS Pin for MFRC522v2 driver
MFRC522DriverSPI driver{ss_pin};            // Create SPI driver instance
MFRC522 mfrc522{driver};                    // Create MFRC522 instance

const unsigned long rfidScanMessageInterval = 5000; // Interval for RFID scan messages

// Forward declarations for functions used before their full definition (if any)
// Note: Arduino (.ino) files often don't strictly need these if functions are ordered correctly or
// the IDE pre-processes, but it's good practice for clarity in complex sketches.
// With the new structure, most of these should become unnecessary if helpers are above setup/loop.
void displayOLED(String line1, String line2 = "", String line3 = "", String line4 = "", bool clear = true, bool invertColors = false);
void displayLogo();
String getMacAddressString(bool withColons = false);
bool attemptSingleWifiConnection(int networkIndex);
bool connectMQTT();
void mqttCallback(char *topic, byte *payload, unsigned int length);
void setDeviceSpecificIdentifiers();
void beepBuzzer(int duration_ms, int times); // Added for initializeApp


// ======================================================================================
// 4. HELPER/OTHER FUNCTIONS (Initialization functions first, then others)
// ======================================================================================

// 4.1 Initialization Functions
// --------------------------------------------------------------------------------------
/**
 * @brief Initializes the OLED display.
 */
void initOLED()
{
  // Initialize I2C communication for OLED with specified SDA and SCL pins
  Wire.begin(OLED_SDA_PIN, OLED_SCL_PIN);

  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C))
  { // I2C address 0x3C for 128x64 OLED
    Serial.println(F("SSD1306 allocation failed"));
    // Loop forever if OLED initialization fails
    for (;;)
      ;
  }
  display.clearDisplay();
  display.setTextSize(1);              // Default text size
  display.setTextColor(SSD1306_WHITE); // White text on black background
  display.setCursor(0, 0);
  display.println(F("OLED Initialized"));
  display.display();
  delay(500); // Show message briefly
}

/**
 * @brief Initializes the RFID reader.
 */
void initRFID()
{
  Serial.println("Initializing RFID reader (MFRC522v2)...");
  displayOLED("RFID Setup", "SPI Init (v2)...");

  // Initialize SPI communication with custom pins.
  SPI.begin(RFID_SCK_PIN, RFID_MISO_PIN, RFID_MOSI_PIN); // Ensure SPI is begun before PCD_Init
  delay(50); // Short delay after SPI.begin()

  displayOLED("RFID Setup", "PCD Init (v2)...");
  mfrc522.PCD_Init(); // Initialize MFRC522 board
  delay(50);

  // Perform self-test
  Serial.println("Performing MFRC522 self-test (v2)...");
  displayOLED("RFID Setup", "Self-Test (v2)...");
  bool selfTestResult = mfrc522.PCD_PerformSelfTest();
  if (selfTestResult)
  {
    Serial.println(F("MFRC522 Self-Test (v2): PASSED"));
    displayOLED("RFID Self-Test", "Result: PASSED", "(MFRC522v2)");
  }
  else
  {
    Serial.println(F("MFRC522 Self-Test (v2): FAILED"));
    Serial.println(F("WARNING: RFID reader may not be functioning correctly."));
    displayOLED("RFID Self-Test", "Result: FAILED!", "(MFRC522v2)", "Check Wiring!");
  }
  delay(1500); // Show self-test result

  displayOLED("RFID Setup", "Version Info...");
  // MFRC522Debug::PCD_DumpVersionToSerial(mfrc522, Serial); // Optional: for detailed debug
  Serial.println(F("RFID reader (MFRC522v2) initialized post self-test."));
}

/**
 * @brief Centralized function to initialize all application components and services.
 *        Handles Serial, Buzzer, OLED, WiFi, device identifiers, RFID, and MQTT.
 * @return True if all critical initializations (WiFi, MQTT) are successful, false otherwise.
 */
bool initializeApp() {
  // 1. Initialize Serial
  Serial.begin(115200);
  unsigned long serialStartTime = millis();
  while (!Serial && (millis() - serialStartTime < 2000)) { // Wait max 2 seconds for serial
    delay(10);
  }
  Serial.println(F("\n==================================="));
  Serial.println(F("KeyLock System Booting..."));
  Serial.println(F("==================================="));
  Serial.println(F("Serial Initialized."));

  // 2. Initialize Buzzer
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW); // Ensure buzzer is off
  Serial.println(F("Buzzer Initialized."));
  beepBuzzer(50, 1); // Short beep to indicate power/boot

  // 3. Initialize OLED
  initOLED(); // Displays "OLED Initialized" internally
  displayOLED("KeyLock System", "Booting Up...", "Please Wait...");
  delay(1000);

  // 4. Connect to WiFi
  bool wifiConnected = false;
  Serial.println(F("Starting WiFi connection process..."));
  displayOLED("WiFi Setup", "Scanning networks...");

  for (int i = 0; i < numWifiNetworks; ++i) {
    currentWifiNetworkIndex = i;
    Serial.print(F("Attempting WiFi Network: "));
    Serial.println(wifiNetworks[currentWifiNetworkIndex].ssid);
    // attemptSingleWifiConnection handles its own OLED updates for "Connecting", "Connected", "Failed"
    if (attemptSingleWifiConnection(currentWifiNetworkIndex)) {
      wifiConnected = true;
      break; // Exit loop on successful connection
    }
    // If attemptSingleWifiConnection failed, it shows a message and the loop continues
    if (i < numWifiNetworks - 1) {
        displayOLED("WiFi Setup", "Next network...", wifiNetworks[currentWifiNetworkIndex].ssid, "Failed");
        delay(1000); // Brief pause before trying next network
    }
  }

  if (!wifiConnected) {
    Serial.println(F("FATAL: Failed to connect to any WiFi network."));
    displayOLED("WiFi FAILED", "No Network Found", "Check Credentials", "System Halted");
    delay(2000); // Show message
    return false; // Critical failure
  }

  // WiFi is connected at this point
  Serial.println(F("WiFi Connection Successful."));
  // OLED already shows "WiFi Connected!" from attemptSingleWifiConnection
  displayOLED("WiFi Connected!", WiFi.localIP().toString(), wifiNetworks[currentWifiNetworkIndex].ssid, "Next: Device Setup");
  delay(1500);

  // 5. Set Device Specific Identifiers (Hostname, MQTT Topics)
  Serial.println(F("Setting device identifiers (hostname, MQTT topics)..."));
  setDeviceSpecificIdentifiers(); // hostname and topics are set here
  displayOLED("Device Setup", "Hostname:", hostname, "Topics Configured");
  delay(1500);

  // 6. Initialize RFID Reader
  // initRFID() displays its own status messages like "RFID Setup", "Self-Test PASSED/FAILED"
  initRFID();
  // Display might be overwritten by initRFID, so a summary after:
  displayOLED("RFID Initialized", "Status: OK", "Next: MQTT Setup", hostname);
  delay(1000);

  // 7. Connect to MQTT
  bool mqttConnected = false;
  Serial.println(F("Starting MQTT connection process..."));
  displayOLED("MQTT Setup", "Connecting to:", mqtt_server_ip.toString(), hostname); // Use mqtt_server_ip directly

  mqttConnectRetryCount = 0; // Reset retry count for this session

  while (mqttConnectRetryCount < MAX_MQTT_RETRIES_PER_WIFI && !mqttClient.connected()) {
    Serial.print(F("MQTT connection attempt #"));
    Serial.println(mqttConnectRetryCount + 1);
    // connectMQTT will set mqttServerIp and attempt connection.
    // It displays its own error on OLED if connection fails.
    if (connectMQTT()) {
      mqttConnected = true;
      Serial.println(F("MQTT Connection Successful."));
      displayOLED("MQTT Connected!", mqtt_server_ip.toString(), "Status: Online", hostname); // Use configured mqtt_server_ip for display
      delay(2000);
      break;
    } else {
      mqttConnectRetryCount++;
      // connectMQTT already displayed the failure details and "rc=" code.
      // We can add a retry message here.
      displayOLED("MQTT Retrying (" + String(mqttConnectRetryCount) + "/" + String(MAX_MQTT_RETRIES_PER_WIFI) + ")", mqtt_server_ip.toString(), "State: " + String(mqttClient.state()), hostname);
      if (mqttConnectRetryCount < MAX_MQTT_RETRIES_PER_WIFI && WiFi.status() == WL_CONNECTED) { // Only retry if WiFi still good
        Serial.print(F("Retrying MQTT in "));
        Serial.print(mqttRetryInterval / 1000);
        Serial.println(F(" seconds..."));
        delay(mqttRetryInterval); // Wait before retrying
      } else if (WiFi.status() != WL_CONNECTED) {
        Serial.println(F("WiFi disconnected during MQTT retry. Aborting MQTT."));
        displayOLED("MQTT Aborted", "WiFi Lost", "Retrying WiFi...", hostname);
        delay(2000);
        return false; // WiFi lost, critical failure for MQTT too
      }
    }
  }

  if (!mqttConnected) {
    Serial.println(F("FATAL: Failed to connect to MQTT broker after multiple retries."));
    // The last error from connectMQTT or the retry loop should be on OLED.
    // We can ensure a final clear message.
    displayOLED("MQTT FAILED", "Max Retries Reached", mqtt_server_ip.toString(), "System Halted");
    delay(2000);
    return false; // Critical failure
  }

  // All critical initializations successful
  Serial.println(F("Application initialized successfully (WiFi & MQTT OK)."));
  displayOLED("System Online", WiFi.localIP().toString(), "MQTT: Connected", hostname);
  delay(2000);
  return true;
}


// 4.2 Core Logic Helper Functions
// --------------------------------------------------------------------------------------
/**
 * @brief Retrieves the MAC address of the ESP32.
 * @param withColons True to include colons (e.g., AA:BB:CC:DD:EE:FF), false for no colons.
 * @return String containing the MAC address.
 */
String getMacAddressString(bool withColons)
{
  String mac = WiFi.macAddress();
  if (!withColons)
  {
    mac.replace(":", "");
  }
  return mac;
}

/**
 * @brief Sets the device hostname and MQTT topics based on the MAC address.
 *        This function should be called after WiFi is connected and MAC is available.
 */
void setDeviceSpecificIdentifiers() {
  String macAddr = getMacAddressString(false); // Get MAC without colons for hostname consistency
  macAddr.toLowerCase();
  hostname = "keylock-" + macAddr;
  Serial.print("Hostname set/updated: ");
  Serial.println(hostname);

  snprintf(health_topic_dynamic, sizeof(health_topic_dynamic), "devices/keylock/health/%s", hostname.c_str());
  snprintf(read_topic, sizeof(read_topic), "devices/keylock/read/%s", hostname.c_str());
  snprintf(access_topic, sizeof(access_topic), "devices/keylock/access/%s", hostname.c_str());
  snprintf(admin_topic, sizeof(admin_topic), "devices/keylock/admin/%s", hostname.c_str());
  // snprintf(register_key_topic, sizeof(register_key_topic), "devices/keylock/registerkey/%s", hostname.c_str()); // Removed

  Serial.print("Health Topic: "); Serial.println(health_topic_dynamic);
  Serial.print("Read Topic (Card Scans): "); Serial.println(read_topic);
  Serial.print("Access Control Topic: "); Serial.println(access_topic);
  Serial.print("Admin Topic: "); Serial.println(admin_topic);
  // Serial.print("Register Key Topic: "); Serial.println(register_key_topic); // Removed
}

/**
 * @brief Initializes and connects to a specific Wi-Fi network from the predefined list.
 * @param networkIndex The index of the network in wifiNetworks array to attempt connection.
 * @return True if connection is successful, false otherwise.
 */
bool attemptSingleWifiConnection(int networkIndex)
{
  if (networkIndex < 0 || networkIndex >= numWifiNetworks)
  {
    Serial.println("Invalid network index for WiFi connection attempt.");
    displayOLED("WiFi Error", "Invalid Index", String(networkIndex));
    delay(1500);
    return false;
  }

  Serial.print("Attempting WiFi connection to: ");
  Serial.println(wifiNetworks[networkIndex].ssid);
  displayOLED("WiFi Connecting", wifiNetworks[networkIndex].ssid, "IP: DHCP...");

  WiFi.mode(WIFI_STA);
  delay(100); // Allow time for mode change or previous disconnect

  WiFi.begin(wifiNetworks[networkIndex].ssid, wifiNetworks[networkIndex].password);

  unsigned long startTime = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - startTime < 15000)) // 15-second timeout
  {
    Serial.print(".");
    delay(500);
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED)
  {
    Serial.print("Successfully connected to ");
    Serial.println(wifiNetworks[networkIndex].ssid);
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());
    displayOLED("WiFi Connected!", WiFi.localIP().toString(), wifiNetworks[networkIndex].ssid);
    delay(1500); // Show success message
    return true;
  }
  else
  {
    Serial.println("Failed to connect to " + String(wifiNetworks[networkIndex].ssid));
    displayOLED("WiFi Failed", wifiNetworks[networkIndex].ssid, "Timeout/Error");
    WiFi.disconnect(true); // Clean up this attempt
    delay(1500);           // Show failure message
    return false;
  }
}

/**
 * @brief Connects to the MQTT broker.
 * @return True if connection is successful, false otherwise.
 */
bool connectMQTT()
{
  if (hostname == "" || hostname.startsWith("keylock-000000000000") || strlen(access_topic) == 0 || strlen(admin_topic) == 0) {
    Serial.println("MQTT Connect: Hostname or topics not set. Aborting.");
    displayOLED("MQTT Error", "Device ID Invalid", "Check Setup", hostname);
    delay(2000);
    return false;
  }

  // mqttServerIp = mqtt_server_ip; // Use mqtt_server_ip directly
  mqttClient.setServer(mqtt_server_ip, mqtt_port); // Simplified
  mqttClient.setCallback(mqttCallback);

  Serial.print("Attempting MQTT connection to ");
  Serial.print(mqtt_server_ip.toString()); // Use mqtt_server_ip directly
  Serial.print(" as ");
  Serial.println(hostname);
  // Do not display "MQTT Connecting" here, caller should handle intermediate display.

  if (mqttClient.connect(hostname.c_str()))
  {
    Serial.println("MQTT connected!");
    // Subscribe to device-specific access and admin topics
    mqttClient.subscribe(access_topic);
    mqttClient.subscribe(admin_topic);
    Serial.println("Subscribed to: " + String(access_topic));
    Serial.println("Subscribed to: " + String(admin_topic));

    publishHealthCheck(); // Publish initial health check on connect
    return true;
  }
  else
  {
    Serial.print("MQTT connection failed, rc=");
    Serial.print(mqttClient.state());
    // MQTT states: https://pubsubclient.knolleary.net/api.html#state
    // -4 : MQTT_CONNECTION_TIMEOUT
    // -3 : MQTT_CONNECTION_LOST
    // -2 : MQTT_CONNECT_FAILED
    // -1 : MQTT_DISCONNECTED
    //  0 : MQTT_CONNECTED
    //  1 : MQTT_CONNECT_BAD_PROTOCOL
    //  2 : MQTT_CONNECT_BAD_CLIENT_ID
    //  3 : MQTT_CONNECT_UNAVAILABLE
    //  4 : MQTT_CONNECT_BAD_CREDENTIALS
    //  5 : MQTT_CONNECT_UNAUTHORIZED
    String errorMsg = "rc=" + String(mqttClient.state());
    displayOLED("MQTT Failed", mqtt_server_ip.toString(), errorMsg, hostname);
    delay(2000); // Show error
    return false;
  }
}

/**
 * @brief Publishes a health check message to the MQTT broker.
 */
void publishHealthCheck()
{
  if (mqttClient.connected())
  {
    // Payload: nodeId (hostname), ipAddress, macAddress, network signal strength, uptime
    String mac = getMacAddressString(true); // Get MAC with colons
    long rssi = WiFi.RSSI();
    unsigned long currentUptime = millis();

    String healthPayload = "{";
    healthPayload += "\"nodeId\":\"" + hostname + "\",";
    healthPayload += "\"ipAddress\":\"" + WiFi.localIP().toString() + "\",";
    healthPayload += "\"macAddress\":\"" + mac + "\",";
    healthPayload += "\"signalStrength\":" + String(rssi) + ",";
    healthPayload += "\"uptime\":" + String(currentUptime);
    healthPayload += "}";

    if (mqttClient.publish(health_topic_dynamic, healthPayload.c_str()))
    {
      Serial.println("Health check published to " + String(health_topic_dynamic) + ": " + healthPayload);
    }
    else
    {
      Serial.println("Health check publish failed to " + String(health_topic_dynamic));
    }
  }
  else
  {
    Serial.println("Cannot publish health check, MQTT not connected.");
  }
}

/**
 * @brief Callback function for handling incoming MQTT messages.
 * @param topic The topic of the incoming message.
 * @param payload The payload of the message.
 * @param length The length of the payload.
 */
void mqttCallback(char *topic, byte *payload, unsigned int length)
{
  String topicStr = String(topic);
  String payloadStr = "";
  for (unsigned int i = 0; i < length; i++)
  {
    payloadStr += (char)payload[i];
  }

  Serial.print("MQTT Message arrived [");
  Serial.print(topicStr);
  Serial.print("] ");
  Serial.println(payloadStr);

  // Check if the message is on the device-specific access topic
  if (topicStr.equals(access_topic))
  {
    if (payloadStr.equals("ALLOW")) // Changed from GRANT to ALLOW
    {
      Serial.println("Access ALLOWED by server.");
      displayOLED("Access Control", "Access ALLOWED", "", hostname, true, false);
      beepBuzzer(100, 2); // Two short beeps for allowed
      // TODO: Add logic to unlock the door
      delay(3000); // Display message for a few seconds
      displayLogo(); // Return to default screen
    }
    else if (payloadStr.equals("DENY"))
    {
      Serial.println("Access DENIED by server.");
      displayOLED("Access Control", "Access DENIED", "", hostname, true, true); // Invert colors for DENIED
      beepBuzzer(500, 1); // One long beep for denied
      delay(3000); // Display message for a few seconds
      displayLogo(); // Return to default screen
    }
    else
    {
      Serial.print("Unknown access control message: ");
      Serial.println(payloadStr);
      displayOLED("Access Control", "Unknown Reply:", payloadStr, hostname, true, true);
      delay(2000);
      displayLogo();
    }
  }
  // Check if the message is on the device-specific admin topic
  else if (topicStr.equals(admin_topic))
  {
    Serial.println("Admin command received: " + message);
    // Attempt to parse JSON
    StaticJsonDocument<256> doc; // Adjust size as needed
    DeserializationError error = deserializeJson(doc, message);

    if (error) {
      Serial.print(F("deserializeJson() failed: "));
      Serial.println(error.f_str());
      // Handle as plain text if JSON parsing fails (for backward compatibility or simple commands)
      if (message.equalsIgnoreCase("START_KEY_REGISTRATION_MODE")) { // Legacy command, prefer JSON
        keyCreationModeActive = true;
        keyCreationModeStartTime = millis();
        lastRFIDScanMessageTime = millis(); // Reset for immediate display
        displayOLED("Key Creation Mode", "Scan Card...", "Timeout: 10s", hostname, true, true);
        beepBuzzer(100, 1);
      } else if (message.equalsIgnoreCase("STOP_KEY_REGISTRATION_MODE")) { // Legacy command
        keyCreationModeActive = false;
        displayOLED("Key Creation", "Mode Stopped", "By Admin", hostname);
        beepBuzzer(100, 1);
        delay(1500);
        displayLogo();
      } else {
        displayOLED("Admin Command", message, "Unknown", hostname);
        beepBuzzer(50, 3); // Error beep
      }
      return;
    }

    // Process JSON command
    const char* command = doc["command"];
    if (command) {
      String cmdStr = String(command);
      if (cmdStr.equalsIgnoreCase("START_KEY_REGISTRATION")) {
        keyCreationModeActive = true;
        keyCreationModeStartTime = millis();
        lastRFIDScanMessageTime = millis(); // Reset for immediate display
        displayOLED("Key Creation Mode", "Scan Card...", "Timeout: 10s", hostname, true, true);
        beepBuzzer(100, 1);
        Serial.println("Key registration mode STARTED.");
      } else if (cmdStr.equalsIgnoreCase("STOP_KEY_REGISTRATION")) {
        keyCreationModeActive = false;
        displayOLED("Key Creation", "Mode Stopped", "By Admin", hostname);
        beepBuzzer(100, 1);
        delay(1500);
        displayLogo();
        Serial.println("Key registration mode STOPPED.");
      } else if (cmdStr.equalsIgnoreCase("KEY_REG_SUCCESS")) {
        const char* cardIdRegistered = doc["cardId"];
        String cardIdStr = cardIdRegistered ? String(cardIdRegistered) : "Unknown";
        displayOLED("Key Registered!", cardIdStr.substring(0,15), "Successfully", hostname, true);
        beepBuzzer(150, 2); // Success beep
        keyCreationModeActive = false; // Exit mode on success
        delay(2000);
        displayLogo();
        Serial.println("Key registration SUCCESS for card: " + cardIdStr);
      } else if (cmdStr.equalsIgnoreCase("KEY_REG_FAIL")) {
        const char* cardIdFailed = doc["cardId"];
        String cardIdStr = cardIdFailed ? String(cardIdFailed) : "Unknown";
        displayOLED("Registration", "Failed!", cardIdStr.substring(0,15), hostname, true);
        beepBuzzer(300, 1); // Failure beep
        // Optionally, stay in key creation mode or exit. For now, let's exit.
        keyCreationModeActive = false;
        delay(2000);
        // Could revert to "Scan Card..." or logo. Let's go to logo.
        displayLogo();
        Serial.println("Key registration FAILED for card: " + cardIdStr);
      } else {
        displayOLED("Admin Command", cmdStr, "Unknown JSON cmd", hostname);
        beepBuzzer(50, 3);
        Serial.println("Unknown JSON admin command: " + cmdStr);
      }
    } else {
      Serial.println("Admin command received (JSON, but no 'command' field): " + message);
      displayOLED("Admin Command", "Invalid JSON", message.substring(0,15), hostname);
      beepBuzzer(50,3);
    }
  }
  else
  {
    Serial.println("Message on unhandled topic: " + topicStr);
  }
}

// 4.3 User Interface and Feedback Functions
// --------------------------------------------------------------------------------------
/**
 * @brief Displays up to 4 lines of text on the OLED.
 * @param line1 Text for the first line.
 * @param line2 Text for the second line (optional).
 * @param line3 Text for the third line (optional).
 * @param line4 Text for the fourth line (optional).
 * @param clear Clear display before writing.
 * @param invertColors True to display black text on white background, false for white text on black.
 */
void displayOLED(String line1, String line2, String line3, String line4, bool clear, bool invertColors)
{
  if (clear)
  {
    display.clearDisplay();
  }
  display.setTextSize(1);
  if (invertColors) {
    display.setTextColor(SSD1306_BLACK, SSD1306_WHITE); // Black text on white background
    if (clear || (line1 != "" && line2 == "" && line3 == "" && line4 == "")) {
        display.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT, SSD1306_WHITE);
    }
  } else {
    display.setTextColor(SSD1306_WHITE); // White text on black background
  }
  display.setCursor(0, 0);

  if (line1 != "") display.println(line1);
  if (line2 != "") display.println(line2);
  if (line3 != "") display.println(line3);
  if (line4 != "") display.println(line4);

  display.display();
}

/**
 * @brief Displays the KeyLock logo and system status on the OLED.
 *        This is typically the default screen when idle and connected.
 */
void displayLogo()
{
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  int16_t logoCenterX = SCREEN_WIDTH / 2;
  int16_t logoCenterY = 25;
  int16_t logoRadius = 20;

  display.drawCircle(logoCenterX, logoCenterY, logoRadius, SSD1306_WHITE);

  float scaleFactor = (float)logoRadius / 10.0;
  int16_t x1 = logoCenterX + (0 * scaleFactor);
  int16_t y1 = logoCenterY + (3 * scaleFactor);
  int16_t x2 = logoCenterX + (3 * scaleFactor);
  int16_t y2 = logoCenterY + (-4 * scaleFactor);
  int16_t x3 = logoCenterX + (-4 * scaleFactor);
  int16_t y3 = logoCenterY + (-2 * scaleFactor);
  int16_t x4 = logoCenterX + (-2 * scaleFactor);
  int16_t y4 = logoCenterY + (4 * scaleFactor);

  display.drawLine(x1, y1, x2, y2, SSD1306_WHITE);
  display.drawLine(x2, y2, x3, y3, SSD1306_WHITE);
  display.drawLine(x3, y3, x4, y4, SSD1306_WHITE);
  display.drawLine(x4, y4, x1, y1, SSD1306_WHITE);
  display.fillCircle(logoCenterX, logoCenterY - (logoRadius / 3), 3, SSD1306_WHITE);

  display.setTextSize(1);
  display.setCursor(0, SCREEN_HEIGHT - 16);
  if (WiFi.status() == WL_CONNECTED)
  {
    display.print("IP: ");
    display.println(WiFi.localIP().toString());
    if (mqttClient.connected())
    {
      display.println("MQTT: Connected");
    }
    else
    {
      display.println("MQTT: Disconnected");
    }
  }
  else
  {
    display.println("WiFi: Disconnected");
    display.println("Status: Offline");
  }
  display.display();
}

/**
 * @brief Activates the buzzer for a specified duration and number of times.
 * @param duration_ms Duration of each beep in milliseconds.
 * @param times Number of beeps.
 */
void beepBuzzer(int duration_ms, int times)
{
  for (int i = 0; i < times; i++)
  {
    digitalWrite(BUZZER_PIN, HIGH);
    delay(duration_ms);
    digitalWrite(BUZZER_PIN, LOW);
    if (i < times - 1)
    {
      delay(duration_ms / 2); // Pause between beeps
    }
  }
}

/**
 * @brief Scans for an RFID card/tag, handles display, beeps, and MQTT publishing.
 *        Differentiates behavior based on keyCreationModeActive.
 */
void scanRFIDAndBeep()
{
  // Periodically update display if in key creation mode and waiting for a card
  if (keyCreationModeActive && (millis() - lastRFIDScanMessageTime > rfidScanMessageInterval)) {
    displayOLED("Key Creation Mode", "Scan New Card...", "Or Stop via Admin", hostname, true, true);
    lastRFIDScanMessageTime = millis(); // Reset the timer
  }

  // 1. Check for new card
  if (!mfrc522.PICC_IsNewCardPresent()) {
    return; // No new card, nothing to do
  }

  // 2. Select the card and read its UID
  if (!mfrc522.PICC_ReadCardSerial()) {
    // Card present but failed to read its serial number
    Serial.println(F("Failed to read RFID card serial."));
    displayOLED("RFID Error", "Read Failed", "Try Again", hostname);
    delay(1000);
    mfrc522.PICC_HaltA();      // Halt PICC
    mfrc522.PCD_StopCrypto1(); // Stop encryption on PCD
    if (!keyCreationModeActive) displayLogo(); // Show logo if not in key creation
    else displayOLED("Key Creation Mode", "Read Error", "Try Again", hostname, true, true);
    return;
  }

  // If we're here, a card is present and its UID has been read.
  String uidString = "";
  Serial.print("Card UID (v2):");
  for (byte i = 0; i < mfrc522.uid.size; i++)
  {
    Serial.print(mfrc522.uid.uidByte[i] < 0x10 ? " 0" : " ");
    Serial.print(mfrc522.uid.uidByte[i], HEX);
    uidString += (mfrc522.uid.uidByte[i] < 0x10 ? "0" : "");
    uidString += String(mfrc522.uid.uidByte[i], HEX);
  }
  Serial.println();
  uidString.toUpperCase();

  // Common device information for payload
  String ipAddr = WiFi.localIP().toString();
  String macAddr = getMacAddressString(true); // MAC with colons

  // Construct JSON payload
  // Payload: nodeId, ipAddress, macAddress, cardId, isCreateMode
  String payload = "{";
  payload += "\"nodeId\":\"" + hostname + "\",";
  payload += "\"ipAddress\":\"" + ipAddr + "\",";
  payload += "\"macAddress\":\"" + macAddr + "\",";
  payload += "\"cardId\":\"" + uidString + "\",";
  payload += "\"isCreateMode\":" + String(keyCreationModeActive ? "true" : "false");
  payload += "}";

  Serial.print("Publishing to " + String(read_topic) + ": ");
  Serial.println(payload);
  displayOLED("Card Scanned", uidString, "Sending...", hostname);
  beepBuzzer(50, 2); // Two short beeps for scan

  if (mqttClient.connected())
  {
    if (mqttClient.publish(read_topic, payload.c_str()))
    {
      Serial.println("Successfully published RFID data.");
      displayOLED("Card Sent", uidString, "To Server", hostname);
    }
    else
    {
      Serial.println("Failed to publish RFID data.");
      displayOLED("Publish Failed", uidString, "Check MQTT", hostname);
    }
  }
  else
  {
    Serial.println("MQTT not connected. Cannot publish RFID data.");
    displayOLED("MQTT Offline", uidString, "Cannot Send", hostname);
  }

  // Halt PICC and stop crypto after processing
  mfrc522.PICC_HaltA();
  mfrc522.PCD_StopCrypto1();

  delay(1500); // Show message for a bit
  if (!keyCreationModeActive) { // If not in key creation mode, show logo
      displayLogo();
  } else { // If in key creation, show key creation prompt again
      displayOLED("Key Creation Mode", "Scan Next Card...", "Or Stop via Admin", hostname, true, true);
      lastRFIDScanMessageTime = millis(); // Reset timer to prevent immediate overwrite by periodic message
  }
}


// ======================================================================================
// 2. SETUP FUNCTION - Runs once at startup
// ======================================================================================
void setup()
{
  // initializeApp() handles Serial, Buzzer, OLED, WiFi, Identifiers, RFID, MQTT
  // It also provides detailed feedback on OLED and Serial during its process.
  bool appInitialized = initializeApp();

  if (appInitialized) {
    Serial.println(F("System initialization successful. Node is operational."));
    // OLED already shows "System Online" from initializeApp
    // A final "Ready" message before showing logo
    displayOLED("System Ready", WiFi.localIP().toString(), "Status: Operational", hostname);
    beepBuzzer(100, 2); // Two short beeps for success
    delay(1500);
    displayLogo(); // Show idle screen, ready for operation
  } else {
    Serial.println(F("CRITICAL: System initialization failed. Node is NOT operational."));
    // initializeApp() would have left the last error message on the OLED.
    // (e.g., "WiFi FAILED" or "MQTT FAILED" or "System Halted")
    // Adding a final explicit message.
    displayOLED("INIT FAILED", "Node Offline", "Check Logs/Config", "Restart Required", true);
    beepBuzzer(500, 1); // One long beep for failure
    // To prevent loop() from running with a non-operational state,
    // you might add an infinite loop here:
    // Serial.println(F("System halted due to initialization failure."));
    // while (true) { delay(10000); /* Do nothing, or blink an error LED */ }
    // For now, allowing it to fall through to loop(), which has its own checks,
    // but the system is effectively offline if initialization failed.
  }
  Serial.println(F("Setup function complete. Proceeding to main loop..."));
}

// ======================================================================================
// 3. MAIN LOOP FUNCTION - Runs repeatedly
// ======================================================================================
void loop()
{
  if (WiFi.status() == WL_CONNECTED)
  {
    // Ensure hostname and topics are set if they weren't during setup or if they seem invalid
    // This can happen if WiFi connected but MQTT setup failed, or if WiFi reconnected in loop.
    if (hostname == "" || hostname.startsWith("keylock-000000000000") || strlen(read_topic) == 0 || strlen(access_topic) == 0) { // Changed scanned_rfid_topic to read_topic
        Serial.println("Hostname/topics not set or invalid in loop, (re)initializing.");
        setDeviceSpecificIdentifiers(); // MAC should be available if WiFi is connected
        if (hostname == "" || hostname.startsWith("keylock-000000000000")) { // Check again
             Serial.println("CRITICAL: Failed to set valid hostname even with WiFi connected.");
             displayOLED("Sys Error", "Bad Hostname", "Check MAC/WiFi", "");
             delay(5000); // Prevent rapid loops on critical error
             return; // Avoid proceeding without valid identifiers
        }
    }

    if (!mqttClient.connected())
    {
      // Attempt to connect to MQTT if not already connected
      // Display "MQTT Connecting" before calling connectMQTT which handles its own success/failure display
      Serial.println("MQTT not connected. Attempting to connect in loop...");
      displayOLED("MQTT Connecting", mqtt_server_ip.toString(), "Loop Attempt...");
      if (connectMQTT())
      {
        Serial.println("MQTT connected in loop.");
        displayOLED("MQTT Connected", hostname, "In Loop OK");
        delay(1000);
        displayLogo(); // Show logo after successful MQTT connection
      }
      else
      {
        Serial.println("MQTT connection failed in loop.");
        // displayOLED is handled by connectMQTT on failure
        // No need to display logo here as connectMQTT shows error then returns to main loop flow
        // Consider cycling WiFi if MQTT fails repeatedly for a specific network
        mqttConnectRetryCount++;
        if (mqttConnectRetryCount >= MAX_MQTT_RETRIES_PER_WIFI) {
            Serial.println("Max MQTT retries reached for current WiFi. Disconnecting WiFi to try next.");
            WiFi.disconnect(true);
            mqttConnectRetryCount = 0; // Reset for next WiFi
            currentWifiNetworkIndex = (currentWifiNetworkIndex + 1) % numWifiNetworks; // Move to next network
            // Display will be handled by the "WiFi not connected" block below
          }
      }
    }
    else // Both WiFi and MQTT are connected
    {
      mqttConnectRetryCount = 0; // Reset MQTT retry count on successful connection
      mqttClient.loop(); // Process MQTT messages

      // Publish health check periodically
      if (millis() - lastHealthCheck > healthCheckInterval)
      {
        publishHealthCheck();
        lastHealthCheck = millis();
      }

      // Scan for RFID card (handles its own display logic)
      scanRFIDAndBeep();

      // Key Creation Mode Timeout Check
      if (keyCreationModeActive && (millis() - keyCreationModeStartTime > KEY_REGISTRATION_TIMEOUT)) {
        keyCreationModeActive = false;
        Serial.println("Key creation mode timed out.");
        displayOLED("Key Creation", "Timeout!", "Mode Ended", hostname, true, true);
        beepBuzzer(200, 1);
        delay(2000);
        displayLogo();
      }

    }
  }
  else // WiFi not connected
  {
    mqttConnectRetryCount = 0; // Reset MQTT retries as WiFi is down
    Serial.print("WiFi not connected. Trying network: ");
    Serial.println(wifiNetworks[currentWifiNetworkIndex].ssid);
    // attemptSingleWifiConnection shows "WiFi Connecting", then "WiFi Connected" or "WiFi Failed"
    if (attemptSingleWifiConnection(currentWifiNetworkIndex))
    {
      // WiFi reconnected, set/update identifiers
      setDeviceSpecificIdentifiers();
      // MQTT connection will be attempted in the next loop iteration by the (WiFi.status() == WL_CONNECTED) block
      // Display is handled by attemptSingleWifiConnection and then by MQTT connection logic
    }
    else
    {
      // WiFi connection failed for the current network
      // displayOLED is handled by attemptSingleWifiConnection
      currentWifiNetworkIndex = (currentWifiNetworkIndex + 1) % numWifiNetworks;
      Serial.println("Moving to next WiFi network index: " + String(currentWifiNetworkIndex));
      // Displaying "Next WiFi Attempt" is good, but attemptSingleWifiConnection already shows failure.
      // A brief pause before retrying the next network is good.
      displayOLED("Next WiFi Network", wifiNetworks[currentWifiNetworkIndex].ssid, "After Delay...");
      delay(5000); // Wait before trying the next network
    }
    // After a WiFi attempt (success or fail with delay), show logo if not in key creation mode.
    // If WiFi just connected, MQTT will try next, then logo. If failed, it shows failure then tries next.
    // The displayLogo() here might be too frequent or overwrite important messages.
    // Consider if displayLogo() is needed here or if status messages are sufficient.
    // For now, let's keep it to ensure some default display if connection attempts are long.
    if (!keyCreationModeActive) { // Only show logo if not in a special mode
        displayLogo();
    }
  }
  delay(100); // Small general delay for loop stability
}
