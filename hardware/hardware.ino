// Centralized Door Lock System - ESP32 Firmware

// Include necessary libraries
#include <WiFi.h>
#include <ArduinoOTA.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <SPI.h>
#include <MFRC522.h>

// Pin Definitions
// OLED Display (0.96 inch)
#define OLED_SDA_PIN 23
#define OLED_SCL_PIN 22
#define SCREEN_WIDTH 128 // OLED display width, in pixels
#define SCREEN_HEIGHT 64 // OLED display height, in pixels
#define OLED_RESET    -1 // Reset pin # (or -1 if sharing Arduino reset pin)

// Active Buzzer
#define BUZZER_PIN 4

// Mini RFID-RC522 Module
#define RFID_RST_PIN  14 // RST
#define RFID_SS_PIN   32 // SDA (SPI Chip Select / Slave Select)
#define RFID_IRQ_PIN  33 // IRQ (Interrupt Request) - defined but not used in this basic example
// SPI Pins for RFID
#define RFID_SCK_PIN  27 // SCK
#define RFID_MISO_PIN 25 // MISO
#define RFID_MOSI_PIN 26 // MOSI

// WiFi Credentials Structure
struct WifiNetwork {
  const char* ssid;
  const char* password;
};

// List of WiFi networks to connect to (in order of priority)
// Replace with your actual Wi-Fi credentials
WifiNetwork wifiNetworks[] = {
{"line.chof64.me", "Passcode7-Defrost-Tanned"}
  // Add more networks if needed, e.g.:
  // {"HomeNetwork", "password123"},
  // {"OfficeGuest", "guestpass"}
};
const int numWifiNetworks = sizeof(wifiNetworks) / sizeof(wifiNetworks[0]);

// MQTT Configuration
IPAddress mqtt_server_ip(192, 168, 1, 200); // Static IP address of the MQTT server
const int mqtt_port = 1883;                     // MQTT server port
const char* health_topic = "devices/keylock/health"; // MQTT topic for health checks
IPAddress mqttServerIp; // Stores the resolved IP of the MQTT server

// Global Variables
String hostname; // Device hostname, e.g., keylock-[MAC_ADDRESS]

WiFiClient espClient; // TCP client for MQTT
PubSubClient mqttClient(espClient); // MQTT client

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET); // OLED display object
MFRC522 rfid(RFID_SS_PIN, RFID_RST_PIN); // RFID reader object

unsigned long lastHealthCheckMillis = 0;    // Timestamp of the last health check
const long healthCheckInterval = 5000;      // Interval for sending health checks (5 seconds)
unsigned long lastMqttAttemptMillis = 0;    // Timestamp of the last MQTT connection attempt
const long mqttRetryInterval = 15000;       // Interval for retrying MQTT connection (15 seconds)


// Function Prototypes
void setupWifi();
String getMacAddressString(bool withColons = false);
void initOLED();
void displayOLED(String line1, String line2 = "", String line3 = "", String line4 = "", bool clear = true);
void displayLogo();
void setupOTA();
void initRFID();
void scanRFIDAndBeep();
void beepBuzzer(int duration_ms = 150, int times = 1);
void connectMQTT();
void publishHealthCheck();
// void mqttCallback(char* topic, byte* payload, unsigned int length); // If subscribing

// =========================================================================
// SETUP FUNCTION - Runs once at startup
// =========================================================================
void setup() {
  Serial.begin(115200);
  while (!Serial) { delay(10); } // Wait for serial connection

  // Initialize Buzzer Pin
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW); // Ensure buzzer is off

  // Initialize OLED Display
  initOLED();
  displayOLED("KeyLock System", "Initializing...");
  delay(1000);

  // Connect to Wi-Fi
  setupWifi();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("WiFi Connected!");
    Serial.print("IP Address: "); Serial.println(WiFi.localIP());
    displayOLED("WiFi Connected", WiFi.localIP().toString());
    delay(1000);

    // Generate Hostname from MAC Address
    String macAddr = getMacAddressString(false); // Get MAC without colons
    macAddr.toLowerCase();
    hostname = "keylock-" + macAddr;
    Serial.print("Hostname: "); Serial.println(hostname);

    // Setup Arduino OTA (Over-The-Air Updates)
    setupOTA();

    // Initialize RFID Reader
    initRFID();

    // Initial attempt to connect to MQTT broker
    connectMQTT();

  } else {
    Serial.println("Failed to connect to any WiFi network.");
    displayOLED("WiFi Failed", "Check Credentials", "Retrying later...");
    // The loop will handle reconnection attempts.
  }

  displayLogo(); // Display logo after initial setup phase
}

// =========================================================================
// MAIN LOOP FUNCTION - Runs repeatedly
// =========================================================================
void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    ArduinoOTA.handle(); // Handle OTA update requests

    // Handle MQTT connection and messages
    if (!mqttClient.connected()) {
      if (millis() - lastMqttAttemptMillis > mqttRetryInterval) {
        connectMQTT(); // Attempt to reconnect to MQTT if disconnected
        lastMqttAttemptMillis = millis();
      }
    }
    mqttClient.loop(); // Process MQTT messages and maintain connection

    // Periodically publish health check information
    if (millis() - lastHealthCheckMillis > healthCheckInterval && mqttClient.connected()) {
      publishHealthCheck();
      lastHealthCheckMillis = millis();
    }

    // Scan for RFID card and beep buzzer
    scanRFIDAndBeep();

  } else {
    // WiFi is not connected, attempt to reconnect
    Serial.println("WiFi disconnected. Attempting to reconnect...");
    displayOLED("WiFi Lost", "Reconnecting...");
    setupWifi(); // This function has its own display updates
    if (WiFi.status() != WL_CONNECTED) {
        displayOLED("WiFi Lost", "Check Network", "Will retry...");
        delay(5000); // Wait before showing logo again or retrying in loop
    }
    displayLogo(); // Show logo while waiting for next WiFi attempt
  }

  // If no specific action is updating the display, ensure the logo is shown or an idle message.
  // The functions scanRFIDAndBeep and others manage their display changes and should restore an idle state.
  // A brief delay to prevent tight looping if no other delays are present
  delay(100);
}

// =========================================================================
// HELPER FUNCTIONS
// =========================================================================

/**
 * @brief Initializes and connects to a Wi-Fi network from the predefined list.
 */
void setupWifi() {
  Serial.println("Connecting to WiFi...");
  displayOLED("WiFi Setup", "Connecting...");
  WiFi.mode(WIFI_STA); // Set ESP32 to Wi-Fi station mode
  WiFi.disconnect(); // Disconnect from any previous connection
  delay(100);

  // --- Static IP Configuration ---
  // Replace these with your desired static IP, gateway, subnet, and DNS servers
  // Ensure this IP is outside your router's DHCP range or reserved.
  IPAddress local_IP(192, 168, 1, 201); // Example Static IP
  IPAddress gateway(192, 168, 1, 1);    // Example Gateway
  IPAddress subnet(255, 255, 255, 0);  // Example Subnet Mask
  IPAddress primaryDNS(1, 1, 1, 1);     // Example Primary DNS (e.g., Google's DNS)
  IPAddress secondaryDNS(1, 0, 0, 1);   // Example Secondary DNS (e.g., Google's DNS)
  // --- End Static IP Configuration ---

  for (int i = 0; i < numWifiNetworks; ++i) {
    Serial.print("Attempting to connect to SSID: ");
    Serial.println(wifiNetworks[i].ssid);
    displayOLED("Connecting to:", wifiNetworks[i].ssid, "Attempt " + String(i+1) + "/" + String(numWifiNetworks));

    // Configure static IP before WiFi.begin()
    // This example applies static IP configuration for all networks in the list.
    // You might want to make this conditional, e.g., only for a specific SSID:
    // if (strcmp(wifiNetworks[i].ssid, "YourTargetSSIDForStaticIP") == 0) {
    //   if (!WiFi.config(local_IP, gateway, subnet, primaryDNS, secondaryDNS)) {
    //     Serial.println("STA Failed to configure static IP for " + String(wifiNetworks[i].ssid));
    //   }
    // }
    // For simplicity, applying to all attempts here. If you have multiple networks,
    // consider if static IP is appropriate for all or only specific ones.
    if (!WiFi.config(local_IP, gateway, subnet, primaryDNS, secondaryDNS)) {
      Serial.println("STA Failed to configure static IP. Proceeding with DHCP for this attempt might be an option or indicate an error.");
      // Depending on desired behavior, you might display an error or attempt DHCP
      // For this example, we'll proceed, but WiFi.begin might override or fail differently.
    }

    WiFi.begin(wifiNetworks[i].ssid, wifiNetworks[i].password);

    unsigned long startTime = millis();
    // Wait for connection (timeout: 15 seconds per network)
    while (WiFi.status() != WL_CONNECTED && (millis() - startTime < 15000)) {
      Serial.print(".");
      delay(500);
    }
    Serial.println();

    if (WiFi.status() == WL_CONNECTED) {
      Serial.print("Successfully connected to "); Serial.println(wifiNetworks[i].ssid);
      Serial.print("IP Address: "); Serial.println(WiFi.localIP());
      displayOLED("WiFi Connected!", WiFi.localIP().toString(), wifiNetworks[i].ssid);
      delay(2000);
      return; // Exit function once connected
    } else {
      Serial.println("Failed to connect.");
      displayOLED("Connection Failed", wifiNetworks[i].ssid, "Trying next...");
      WiFi.disconnect(true); // Disconnect and erase credentials for this attempt
      delay(1000);
    }
  }

  Serial.println("Could not connect to any WiFi network.");
  displayOLED("WiFi Failed", "No Network Found", "Check Config");
  // Further attempts will be made in the main loop or by restarting
}

/**
 * @brief Retrieves the MAC address of the ESP32.
 * @param withColons True to include colons (e.g., AA:BB:CC:DD:EE:FF), false for no colons.
 * @return String containing the MAC address.
 */
String getMacAddressString(bool withColons) {
  String mac = WiFi.macAddress();
  if (!withColons) {
    mac.replace(":", "");
  }
  return mac;
}

/**
 * @brief Initializes the OLED display.
 */
void initOLED() {
  // Initialize I2C communication for OLED with specified SDA and SCL pins
  Wire.begin(OLED_SDA_PIN, OLED_SCL_PIN);

  if(!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) { // I2C address 0x3C for 128x64 OLED
    Serial.println(F("SSD1306 allocation failed"));
    // Loop forever if OLED initialization fails
    for(;;);
  }
  display.clearDisplay();
  display.setTextSize(1);      // Default text size
  display.setTextColor(SSD1306_WHITE); // White text on black background
  display.setCursor(0,0);
  display.println(F("OLED Initialized"));
  display.display();
  delay(500); // Show message briefly
}

/**
 * @brief Displays up to 4 lines of text on the OLED.
 * @param line1 Text for the first line.
 * @param line2 Text for the second line (optional).
 * @param line3 Text for the third line (optional).
 * @param line4 Text for the fourth line (optional).
 * @param clear Clear display before writing.
 */
void displayOLED(String line1, String line2, String line3, String line4, bool clear) {
  if (clear) {
    display.clearDisplay();
  }
  display.setTextSize(1);             // Use small text size for messages
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0,0);

  if (line1 != "") { display.println(line1); }
  if (line2 != "") { display.println(line2); }
  if (line3 != "") { display.println(line3); }
  if (line4 != "") { display.println(line4); }

  display.display();
}

/**
 * @brief Displays the KeyLock logo and system status on the OLED.
 */
void displayLogo() {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE); // Set color for all drawing operations

  // Define logo parameters
  int16_t logoCenterX = SCREEN_WIDTH / 2;
  int16_t logoCenterY = 25; // Vertically position the logo towards the top
  int16_t logoRadius = 20;  // Radius of the outer circle of the logo

  // Draw outer circle
  display.drawCircle(logoCenterX, logoCenterY, logoRadius, SSD1306_WHITE);

  // Define inner key shape points based on SVG path, scaled and translated
  // SVG path: M12 15 L15 8 L8 10 L10 16 Z (within a 24x24 viewBox)
  // SVG circle center: (12,12), radius: 10
  // Relative coordinates of key shape points from SVG center (12,12):
  // P1: (0, 3)   corresponding to SVG (12, 15)
  // P2: (3, -4)  corresponding to SVG (15, 8)
  // P3: (-4, -2) corresponding to SVG (8, 10)
  // P4: (-2, 4)  corresponding to SVG (10, 16)

  float scaleFactor = (float)logoRadius / 10.0; // Scale based on OLED logo radius vs SVG radius

  int16_t p1x = logoCenterX + static_cast<int16_t>(round(0 * scaleFactor));
  int16_t p1y = logoCenterY + static_cast<int16_t>(round(3 * scaleFactor));

  int16_t p2x = logoCenterX + static_cast<int16_t>(round(3 * scaleFactor));
  int16_t p2y = logoCenterY + static_cast<int16_t>(round(-4 * scaleFactor));

  int16_t p3x = logoCenterX + static_cast<int16_t>(round(-4 * scaleFactor));
  int16_t p3y = logoCenterY + static_cast<int16_t>(round(-2 * scaleFactor));

  int16_t p4x = logoCenterX + static_cast<int16_t>(round(-2 * scaleFactor));
  int16_t p4y = logoCenterY + static_cast<int16_t>(round(4 * scaleFactor));

  // Draw inner key shape (as two filled triangles to form the quadrilateral P1-P2-P3-P4)
  display.fillTriangle(p1x, p1y, p2x, p2y, p3x, p3y, SSD1306_WHITE);
  display.fillTriangle(p1x, p1y, p3x, p3y, p4x, p4y, SSD1306_WHITE);

  // Status text display
  display.setTextSize(1);
  // Position text below the logo (bottom of circle is logoCenterY + logoRadius)
  int16_t textYPosition = logoCenterY + logoRadius + 3; // Start text a few pixels below logo
  if (textYPosition > SCREEN_HEIGHT - 16) { // Ensure space for two lines (8px height each)
      textYPosition = SCREEN_HEIGHT - 16;
  }
   // Fallback if calculation is too low, ensure it's reasonably placed
  if (textYPosition < 47) textYPosition = 47;


  if (WiFi.status() == WL_CONNECTED) {
    // Center hostname text
    int16_t textWidthHostname = hostname.length() * 6; // Approx width: num_chars * 6px/char for size 1
    int16_t textXHostname = (SCREEN_WIDTH - textWidthHostname) / 2;
    if (textXHostname < 0) textXHostname = 0; // Prevent negative X coordinate
    display.setCursor(textXHostname, textYPosition);
    display.println(hostname);

    // Center IP address text
    String ipText = "IP: " + WiFi.localIP().toString();
    int16_t textWidthIP = ipText.length() * 6;
    int16_t textXIP = (SCREEN_WIDTH - textWidthIP) / 2;
    if (textXIP < 0) textXIP = 0;
    display.setCursor(textXIP, textYPosition + 8); // Position on the next line
    display.println(ipText);
  } else {
    // Center "SYSTEM OFFLINE"
    String offlineMsg1 = "SYSTEM OFFLINE";
    int16_t textWidthOffline1 = offlineMsg1.length() * 6;
    int16_t textXOffline1 = (SCREEN_WIDTH - textWidthOffline1) / 2;
    if (textXOffline1 < 0) textXOffline1 = 0;
    display.setCursor(textXOffline1, textYPosition);
    display.println(F("SYSTEM OFFLINE"));

    // Center "Awaiting Network..."
    String offlineMsg2 = "Awaiting Network...";
    int16_t textWidthOffline2 = offlineMsg2.length() * 6;
    int16_t textXOffline2 = (SCREEN_WIDTH - textWidthOffline2) / 2;
    if (textXOffline2 < 0) textXOffline2 = 0;
    display.setCursor(textXOffline2, textYPosition + 8); // Position on the next line
    display.println(F("Awaiting Network..."));
  }
  display.display();
}

/**
 * @brief Sets up Arduino OTA for wireless sketch uploads.
 */
void setupOTA() {
  ArduinoOTA.setHostname(hostname.c_str()); // Set OTA hostname

  ArduinoOTA
    .onStart([]() {
      String type;
      if (ArduinoOTA.getCommand() == U_FLASH) type = "sketch";
      else type = "filesystem"; // U_SPIFFS
      Serial.println("Start updating " + type);
      displayOLED("OTA Update", "Receiving " + type + "...", "Do Not Power Off!");
      mqttClient.disconnect(); // Disconnect MQTT during OTA
    })
    .onEnd([]() {
      Serial.println("End");
      displayOLED("OTA Update", "Update Finished!", "Rebooting...");
      delay(1000);
    })
    .onProgress([](unsigned int progress, unsigned int total) {
      Serial.printf("Progress: %u%%", (progress / (total / 100)));
      char progressStr[20];
      sprintf(progressStr, "Progress: %u%%", (progress / (total / 100)));
      displayOLED("OTA Update", progressStr, "", "", false); // Don't clear, update progress line
    })
    .onError([](ota_error_t error) {
      Serial.printf("Error[%u]: ", error);
      String errorMsg = "OTA Error: ";
      if (error == OTA_AUTH_ERROR) { Serial.println("Auth Failed"); errorMsg += "Auth"; }
      else if (error == OTA_BEGIN_ERROR) { Serial.println("Begin Failed"); errorMsg += "Begin"; }
      else if (error == OTA_CONNECT_ERROR) { Serial.println("Connect Failed"); errorMsg += "Connect"; }
      else if (error == OTA_RECEIVE_ERROR) { Serial.println("Receive Failed"); errorMsg += "Receive"; }
      else if (error == OTA_END_ERROR) { Serial.println("End Failed"); errorMsg += "End"; }
      displayOLED("OTA Error", errorMsg, "Please Retry");
      delay(2000);
      displayLogo(); // Revert to logo on error
    });

  ArduinoOTA.begin();
  Serial.println("ArduinoOTA initialized. Ready for updates.");
}

/**
 * @brief Initializes the RFID reader.
 */
void initRFID() {
  // Configure SPI bus for RFID module with specified pins
  // The MFRC522 library constructor already knows the SS pin.
  SPI.begin(RFID_SCK_PIN, RFID_MISO_PIN, RFID_MOSI_PIN); // RFID_SS_PIN removed from here

  rfid.PCD_Init(); // Initialize MFRC522 PCD (Proximity Coupling Device)
  delay(4);        // Small delay recommended after init
  rfid.PCD_DumpVersionToSerial(); // Print RFID reader version details to Serial
  Serial.println(F("RFID Initialized. Scan a card to see UID."));
  displayOLED(hostname, "RFID Ready", "Scan Card...");
  delay(1000);
}

/**
 * @brief Scans for an RFID card and beeps the buzzer if a card is detected.
 */
void scanRFIDAndBeep() {
  // Look for new RFID cards
  if (!rfid.PICC_IsNewCardPresent()) {
    return; // No new card present
  }

  // Select one of the cards
  if (!rfid.PICC_ReadCardSerial()) {
    return; // Failed to read card serial
  }

  // Card detected and read successfully
  Serial.print(F("Card UID:"));
  String uid = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    Serial.print(rfid.uid.uidByte[i] < 0x10 ? " 0" : " "); // Add leading zero if needed
    Serial.print(rfid.uid.uidByte[i], HEX);
    uid += String(rfid.uid.uidByte[i] < 0x10 ? "0" : ""); // Append byte to UID string
    uid += String(rfid.uid.uidByte[i], HEX);
  }
  uid.toUpperCase();
  Serial.println();
  Serial.print(F("PICC type: "));
  MFRC522::PICC_Type piccType = rfid.PICC_GetType(rfid.uid.sak);
  Serial.println(rfid.PICC_GetTypeName(piccType));

  // Display card information on OLED
  displayOLED("Card Scanned!", "UID: " + uid.substring(0,8), uid.substring(8)); // Display first part of UID

  // Beep the buzzer
  beepBuzzer(150, 2); // Beep twice for 150ms each

  // Halt PICC (Proximity Integrated Circuit Card) and stop encryption
  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();

  delay(2000); // Display card info on OLED for a few seconds
  displayLogo(); // Revert to logo/idle screen
}

/**
 * @brief Activates the buzzer for a specified duration and number of times.
 * @param duration_ms Duration of each beep in milliseconds.
 * @param times Number of beeps.
 */
void beepBuzzer(int duration_ms, int times) {
  for (int i = 0; i < times; i++) {
    digitalWrite(BUZZER_PIN, HIGH); // Turn buzzer on
    delay(duration_ms);
    digitalWrite(BUZZER_PIN, LOW);  // Turn buzzer off
    if (i < times - 1) {
      delay(duration_ms / 2); // Pause between beeps
    }
  }
}

/**
 * @brief Connects to the MQTT broker. Uses mDNS to resolve server IP.
 */
void connectMQTT() {
  if (!WiFi.isConnected()) {
    Serial.println("MQTT: WiFi not connected. Cannot connect.");
    return;
  }

  Serial.print("Attempting MQTT connection to static IP: "); Serial.println(mqtt_server_ip);
  displayOLED(hostname, "MQTT Connecting", "Server: " + mqtt_server_ip.toString());

  // Directly use the static IP
  mqttClient.setServer(mqtt_server_ip, mqtt_port);
  // mqttClient.setCallback(mqttCallback); // Set callback if subscribing to topics

  String clientId = hostname + "-client-" + String(random(0xffff), HEX); // Unique client ID
  Serial.print("Connecting to MQTT with Client ID: "); Serial.println(clientId);

  if (mqttClient.connect(clientId.c_str())) {
    Serial.println("MQTT connected!");
    displayOLED(hostname, "MQTT Connected!", mqttServerIp.toString());
    // Example: Subscribe to a topic after connecting
    // mqttClient.subscribe("devices/keylock/command");
  } else {
    Serial.print("MQTT connection failed, rc="); Serial.print(mqttClient.state());
    String errorStr = "Code: " + String(mqttClient.state());
    // MQTT Paho error codes:
    // -4 : MQTT_CONNECTION_TIMEOUT - The server didn't respond within the keepalive time.
    // -3 : MQTT_CONNECTION_LOST - The network connection was broken.
    // -2 : MQTT_CONNECT_FAILED - The network connection failed.
    // -1 : MQTT_DISCONNECTED - The client is disconnected cleanly.
    // 0 : MQTT_CONNECTED - The client is connected.
    // 1 : MQTT_CONNECT_BAD_PROTOCOL - The server doesn't support the requested version of MQTT.
    // 2 : MQTT_CONNECT_BAD_CLIENT_ID - The server rejected the client identifier.
    // 3 : MQTT_CONNECT_UNAVAILABLE - The server was unable to accept the connection.
    // 4 : MQTT_CONNECT_BAD_CREDENTIALS - The username/password were rejected.
    // 5 : MQTT_CONNECT_UNAUTHORIZED - The client was not authorized to connect.
    displayOLED(hostname, "MQTT Failed", errorStr);
    Serial.println(" Will try again later.");
  }
  delay(1500); // Show status briefly
  displayLogo(); // Revert to logo screen
}

/**
 * @brief Publishes health check information to the MQTT broker.
 */
void publishHealthCheck() {
  if (!mqttClient.connected()) {
    Serial.println("MQTT not connected. Cannot publish health check.");
    return; // Added return to prevent publishing if not connected
  }

  char healthPayload[256]; // Buffer for JSON payload
  String mac = getMacAddressString(true); // MAC address with colons
  String ip = WiFi.localIP().toString();  // Current IP address
  long rssi = WiFi.RSSI();                // WiFi signal strength
  uint32_t freeHeap = ESP.getFreeHeap();  // Free heap memory
  uint32_t uptime_s = millis() / 1000;    // Uptime in seconds


  // Create JSON payload with escaped quotes for internal strings
  snprintf(healthPayload, sizeof(healthPayload),
           "{\"hostname\":\"%s\",\"macAddress\":\"%s\",\"ipAddress\":\"%s\",\"rssi\":%ld,\"freeHeap\":%u,\"uptime_s\":%u,\"firmware\":\"1.0.0\"}",
           hostname.c_str(),
           mac.c_str(),
           ip.c_str(),
           rssi,
           freeHeap,
           uptime_s
          );

  Serial.print("Publishing health check to "); Serial.print(health_topic); Serial.print(": "); Serial.println(healthPayload);

  if (mqttClient.publish(health_topic, healthPayload, true /*retained*/)) {
    Serial.println("Health check published successfully.");
    // Optionally update display, but might be too frequent for a primary status
    // displayOLED(hostname, "Health Sent", ip, "", false); // Update without clearing
    // delay(500); displayLogo();
  } else {
    Serial.println("Failed to publish health check.");
    displayOLED(hostname, "Health Send Fail", "Check MQTT Broker");
    delay(1000);
    displayLogo();
  }
}

/**
 * @brief Callback function for handling incoming MQTT messages (if subscribed).
 * @param topic The topic of the incoming message.
 * @param payload The message payload.
 * @param length The length of the payload.
 */
/*
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  Serial.print("Message arrived [");
  Serial.print(topic);
  Serial.print("] ");
  String message;
  for (int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  Serial.println(message);
  displayOLED("MQTT Message", topic, message.substring(0,18)); // Display first part of message

  // Example: Handle commands from a specific topic
  if (String(topic) == "devices/keylock/command") {
    if (message == "OPEN_DOOR") {
      Serial.println("Received OPEN_DOOR command.");
      // Code to open door
      beepBuzzer(100, 3); // Acknowledge command
    } else if (message == "LOCK_DOOR") {
      Serial.println("Received LOCK_DOOR command.");
      // Code to lock door
       beepBuzzer(50, 1);
    }
  }
  delay(2000);
  displayLogo();
}
*/
