// Centralized Door Lock System - ESP32 Firmware

// Include necessary libraries
#include <WiFi.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <SPI.h>
// Use MFRC522v2 library
#include <MFRC522v2.h>
#include <MFRC522DriverSPI.h>
#include <MFRC522DriverPinSimple.h>
#include <MFRC522Debug.h>

// Pin Definitions
// OLED Display (0.96 inch)
#define OLED_SDA_PIN 26 // D26
#define OLED_SCL_PIN 27 // D27
#define SCREEN_WIDTH 128 // OLED display width, in pixels
#define SCREEN_HEIGHT 64 // OLED display height, in pixels
#define OLED_RESET -1    // Reset pin # (or -1 if sharing Arduino reset pin)

// Active Buzzer
#define BUZZER_PIN 25 // D25

// Mini RFID-RC522 Module
#define RFID_RST_PIN 21  // D21 (was 14)
#define RFID_SS_PIN 5    // D5  (SDA on components.md, SPI SS - was 32)
#define RFID_IRQ_PIN 33  // D33 (Not connected as per components.md, but define kept)
// SPI Pins for RFID
#define RFID_SCK_PIN 18  // D18 (was 27)
#define RFID_MISO_PIN 19 // D19 (was 25)
#define RFID_MOSI_PIN 23 // D23 (was 26)

// WiFi Credentials Structure
struct WifiNetwork
{
  const char *ssid;
  const char *password;
};

// List of WiFi networks to connect to (in order of priority)
// Replace with your actual Wi-Fi credentials
WifiNetwork wifiNetworks[] = {
    {"line.chof64.me", "Passcode7-Defrost-Tanned"},
    {"aabbcc00xxyyzz", "a1b2c300"}
    // Add more networks if needed, e.g.:
    // {"HomeNetwork", "password123"},
    // {"OfficeGuest", "guestpass"}
};
const int numWifiNetworks = sizeof(wifiNetworks) / sizeof(wifiNetworks[0]);

// MQTT Configuration
IPAddress mqtt_server_ip(192, 168, 1, 200);          // Static IP address of the MQTT server
const int mqtt_port = 1883;                          // MQTT server port
const char *health_topic = "devices/keylock/health"; // MQTT topic for health checks
// const char *scanned_rfid_topic = "devices/keylock/scanned"; // MQTT topic for scanned RFID tags - Will be dynamic
char scanned_rfid_topic[100]; // Buffer for device-specific scanned RFID topic
// const char *access_topic = "devices/keylock/access"; // MQTT topic for access control - Will be dynamic
char access_topic[100];       // Buffer for device-specific access control topic
IPAddress mqttServerIp;                              // Stores the resolved IP of the MQTT server

// Global Variables
String hostname; // Device hostname, e.g., keylock-[MAC_ADDRESS]

WiFiClient espClient;               // TCP client for MQTT
PubSubClient mqttClient(espClient); // MQTT client

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET); // OLED display object

// RFID Reader Object - Updated for MFRC522v2
// MFRC522 rfid(RFID_SS_PIN, RFID_RST_PIN); // Old MFRC522 object
MFRC522DriverPinSimple ss_pin(RFID_SS_PIN); // Define SS Pin for MFRC522v2 driver
MFRC522DriverSPI driver{ss_pin};            // Create SPI driver instance
MFRC522 mfrc522{driver};                    // Create MFRC522 instance (was 'rfid')

unsigned long lastMqttAttemptMillis = 0; // Timestamp of the last MQTT connection attempt
const long mqttRetryInterval = 15000;    // Interval for retrying MQTT connection (15 seconds)

// Global variables for MQTT Health Check
unsigned long lastHealthCheck = 0;
// const unsigned long healthCheckInterval = 60000; // 60 seconds health check interval
const unsigned long healthCheckInterval = 30000; // 5 seconds health check interval

// Variables for enhanced WiFi/MQTT connection logic
int currentWifiNetworkIndex = 0;
int mqttConnectRetryCount = 0;
const int MAX_MQTT_RETRIES_PER_WIFI = 3;

// Function Prototypes
bool attemptSingleWifiConnection(int networkIndex); // Changed from setupWifi
String getMacAddressString(bool withColons = false);
void initOLED();
void displayOLED(String line1, String line2 = "", String line3 = "", String line4 = "", bool clear = true, bool invertColors = false); // Added invertColors
void displayLogo();
void initRFID(); // Declaration remains the same
void scanRFIDAndBeep(); // Declaration remains the same
void beepBuzzer(int duration_ms = 150, int times = 1);
bool connectMQTT(); // Changed to return bool
void publishHealthCheck();
void mqttCallback(char *topic, byte *payload, unsigned int length); // MQTT message callback

// Function to set hostname and MQTT topics based on MAC address
void setDeviceSpecificIdentifiers() {
  String macAddr = getMacAddressString(false); // Get MAC without colons
  macAddr.toLowerCase();
  hostname = "keylock-" + macAddr;
  Serial.print("Hostname set/updated: ");
  Serial.println(hostname);

  snprintf(scanned_rfid_topic, sizeof(scanned_rfid_topic), "devices/keylock/scanned/%s", hostname.c_str());
  snprintf(access_topic, sizeof(access_topic), "devices/keylock/access/%s", hostname.c_str());
  Serial.print("Scanned RFID Topic: "); Serial.println(scanned_rfid_topic);
  Serial.print("Access Control Topic: "); Serial.println(access_topic);
}

// =========================================================================
// SETUP FUNCTION - Runs once at startup
// =========================================================================
void setup()
{
  Serial.begin(115200);
  while (!Serial)
  {
    delay(10);
  } // Wait for serial connection

  // Initialize Buzzer Pin
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW); // Ensure buzzer is off

  // Initialize OLED Display
  initOLED();
  displayOLED("KeyLock System", "Booting...");
  delay(1000);

  // Hostname and topics will be set after WiFi connection.

  bool initialWifiConnected = false;
  for (int i = 0; i < numWifiNetworks; ++i)
  {
    currentWifiNetworkIndex = i;
    WiFi.disconnect(true);    delay(100);
    if (attemptSingleWifiConnection(currentWifiNetworkIndex))
    {
      setDeviceSpecificIdentifiers(); // Set hostname and topics now that WiFi is connected
      initialWifiConnected = true;

      // Initialize RFID Reader
      initRFID();

      // Initial attempt to connect to MQTT broker
      displayOLED("MQTT Connecting", mqtt_server_ip.toString(), "Setup Attempt...");
      if (connectMQTT())
      {
        Serial.println("MQTT connected during setup.");
        displayOLED("MQTT Connected", hostname, "Setup OK");
        delay(1000);
      }
      else
      {
        Serial.println("MQTT connection failed during setup.");
        displayOLED("MQTT Failed", hostname, "Setup Error");
        delay(1000);
      }
      break;
    }
    // If attemptSingleWifiConnection failed, it shows a message and the loop continues to the next network.
  }

  if (!initialWifiConnected)
  {
    Serial.println("Failed to connect to any WiFi network during setup.");
    displayOLED("Setup Failed", "No WiFi Available", "Retrying in loop...");
    // Hostname and topics are not set yet. They will be set in loop when WiFi connects.
    currentWifiNetworkIndex = 0; // Reset to start from the first network in the loop
    delay(2000);
  }

  displayLogo(); // Display logo after initial setup phase
}

// =========================================================================
// MAIN LOOP FUNCTION - Runs repeatedly
// =========================================================================
void loop()
{
  if (WiFi.status() == WL_CONNECTED)
  {
    // Ensure hostname and topics are set if they weren't during setup or if they seem invalid
    if (hostname == "" || hostname.startsWith("keylock-000000000000") || strlen(scanned_rfid_topic) == 0 || strlen(access_topic) == 0) {
        Serial.println("Hostname/topics not set or invalid in loop, (re)initializing.");
        setDeviceSpecificIdentifiers();
    }

    if (!mqttClient.connected())
    {
      Serial.println("MQTT not connected. Attempting to connect...");
      displayOLED("MQTT Connecting", mqtt_server_ip.toString());
      if (connectMQTT()) // connectMQTT will use the globally set hostname and subscribe to access_topic
      {
        Serial.println("MQTT connected in loop.");
        displayOLED("MQTT Connected", hostname, "In Loop OK");
        delay(1000);
        displayLogo(); // Show logo after successful MQTT connection
      }
      else
      {
        Serial.println("MQTT connection failed in loop.");
        // displayOLED handled by connectMQTT on failure
        // No need to display logo here as connectMQTT shows error then returns to main loop flow
      }
    }
    else
    {
      // Both WiFi and MQTT are connected
      mqttClient.loop();
      // Publish health check periodically
      if (millis() - lastHealthCheck > healthCheckInterval)
      {
        publishHealthCheck();
        lastHealthCheck = millis();
      }

      // Scan for RFID card
      scanRFIDAndBeep(); // This function now handles its own display logic
    }
  }
  else
  {
    // WiFi is not connected. Attempt to connect.
    Serial.print("WiFi not connected. Trying network: ");
    Serial.println(wifiNetworks[currentWifiNetworkIndex].ssid);
    // attemptSingleWifiConnection shows "WiFi Connecting", then "WiFi Connected" or "WiFi Failed"
    if (attemptSingleWifiConnection(currentWifiNetworkIndex))
    {
      // WiFi connected, hostname should be set. Attempt MQTT connection in the next loop.
      // Display is handled by attemptSingleWifiConnection
      // Set hostname based on MAC for MQTT client ID
      hostname = "keylock-" + getMacAddressString(false); // Ensure consistent "keylock-" prefix
      Serial.println("Hostname for MQTT: " + hostname);
    }
    else
    {
      // WiFi connection failed for the current network
      // displayOLED is handled by attemptSingleWifiConnection
      currentWifiNetworkIndex = (currentWifiNetworkIndex + 1) % numWifiNetworks;
      Serial.println("Moving to next WiFi network index: " + String(currentWifiNetworkIndex));
      displayOLED("Next WiFi Attempt", "After Delay...", String(wifiNetworks[currentWifiNetworkIndex].ssid) + " failed");
      delay(5000); // Wait before trying the next network or re-trying
    }
    // After a WiFi attempt (success or fail with delay), show logo.
    displayLogo();
  }
  delay(100); // Small general delay for loop stability
}

// =========================================================================
// HELPER FUNCTIONS
// =========================================================================

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
  displayOLED("WiFi Connecting", wifiNetworks[networkIndex].ssid, "IP: DHCP..."); // Changed to DHCP

  WiFi.mode(WIFI_STA);
  delay(100); // Allow time for mode change or previous disconnect

  WiFi.begin(wifiNetworks[networkIndex].ssid, wifiNetworks[networkIndex].password);

  unsigned long startTime = millis();
  // Wait for connection (timeout: 15 seconds per network)
  while (WiFi.status() != WL_CONNECTED && (millis() - startTime < 15000))
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
    return true; // Exit function once connected
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
    // Fill the screen with white if clearing or if it's the first line,
    // to ensure the background is white.
    if (clear || (line1 != "" && line2 == "" && line3 == "" && line4 == "")) {
        display.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT, SSD1306_WHITE);
    }
  } else {
    display.setTextColor(SSD1306_WHITE); // White text on black background
  }
  display.setCursor(0, 0);

  if (line1 != "")
  {
    display.println(line1);
  }
  if (line2 != "")
  {
    display.println(line2);
  }
  if (line3 != "")
  {
    display.println(line3);
  }
  if (line4 != "")
  {
    display.println(line4);
  }

  display.display();
}

/**
 * @brief Displays the KeyLock logo and system status on the OLED.
 */
void displayLogo()
{
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

  float scaleFactor = (float)logoRadius / 10.0;

  // Calculate scaled coordinates relative to logoCenterX, logoCenterY
  // Note: Y is inverted in display coordinates (positive Y is down)
  int16_t x1 = logoCenterX + (0 * scaleFactor);
  int16_t y1 = logoCenterY + (3 * scaleFactor);
  int16_t x2 = logoCenterX + (3 * scaleFactor);
  int16_t y2 = logoCenterY + (-4 * scaleFactor);
  int16_t x3 = logoCenterX + (-4 * scaleFactor);
  int16_t y3 = logoCenterY + (-2 * scaleFactor);
  int16_t x4 = logoCenterX + (-2 * scaleFactor);
  int16_t y4 = logoCenterY + (4 * scaleFactor);

  // Draw the key shape (a quadrilateral)
  display.drawLine(x1, y1, x2, y2, SSD1306_WHITE);
  display.drawLine(x2, y2, x3, y3, SSD1306_WHITE);
  display.drawLine(x3, y3, x4, y4, SSD1306_WHITE);
  display.drawLine(x4, y4, x1, y1, SSD1306_WHITE);

  // Draw a small circle for the keyhole
  display.fillCircle(logoCenterX, logoCenterY - (logoRadius / 3), 3, SSD1306_WHITE);

  // Display status text below the logo
  display.setTextSize(1);
  display.setCursor(0, SCREEN_HEIGHT - 16); // Position for two lines of text at the bottom
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
 * @brief Initializes the RFID reader.
 */
void initRFID()
{
  Serial.println("Initializing RFID reader (MFRC522v2)...");
  displayOLED("RFID Setup", "SPI Init (v2)...");

  // Initialize SPI communication with custom pins.
  SPI.begin(RFID_SCK_PIN, RFID_MISO_PIN, RFID_MOSI_PIN);
  // Serial.println("SPI communication for RFID initialized with custom pins."); // Reduced verbosity
  displayOLED("RFID Setup", "PCD Init (v2)...");
  delay(100);

  mfrc522.PCD_Init(); // Initialize MFRC522 board
  // Serial.println("MFRC522 PCD_Init() called."); // Reduced verbosity
  delay(50);

  // Perform self-test (retained from original logic)
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
    // Consider a more serious error handling here if self-test is critical
  }
  delay(1500); // Show self-test result

  // Show details of PCD - MFRC522 Card Reader details on Serial Monitor
  displayOLED("RFID Setup", "Version Info...");
  // Serial.println(F("Dumping MFRC522 version and details (MFRC522v2):")); // Reduced verbosity
  // MFRC522Debug::PCD_DumpVersionToSerial(mfrc522, Serial); // Reduced verbosity

  // The specific version register check for OLED has been removed due to compilation issues.
  // The self-test provides an indication of RFID module health.
  // If more detailed version info is needed, uncomment PCD_DumpVersionToSerial above and check Serial Monitor.

  // delay(2000); // Delay was for showing version, can be reduced or removed if self-test display is sufficient
  Serial.println(F("RFID reader (MFRC522v2) initialized post self-test.")); // Adjusted message
}

unsigned long lastRFIDScanMessageTime = 0;
const unsigned long rfidScanMessageInterval = 5000; // Print message every 5 seconds

/**
 * @brief Scans for an RFID card/tag and beeps the buzzer if detected.
 *        Also displays card UID on OLED.
 */
void scanRFIDAndBeep()
{
  // Try to detect a new card
  if (!mfrc522.PICC_IsNewCardPresent())
  {
    // No new card detected by PICC_IsNewCardPresent()
    // Periodically print a message to serial to show that scanning is active
    if (millis() - lastRFIDScanMessageTime > rfidScanMessageInterval)
    {
      // Serial.println("RFID (v2): Actively scanning for cards... (PICC_IsNewCardPresent() returned false)"); // Reduced verbosity
      lastRFIDScanMessageTime = millis();
    }
    return; // Nothing to do if no new card
  }
  // Serial.println("RFID (v2): New card detected by PICC_IsNewCardPresent()."); // Reduced verbosity

  // Attempt to read the card serial number
  if (!mfrc522.PICC_ReadCardSerial())
  {
    Serial.println("RFID (v2): Card read failed."); // Reduced verbosity
    return; // Failed to read serial
  }

  // Construct UID string for display and other uses
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

  displayOLED("Card Detected!", "UID:", uidString);
  beepBuzzer(200, 2);

  // Publish RFID UID to MQTT
  if (mqttClient.connected())
  {
    if (mqttClient.publish(scanned_rfid_topic, uidString.c_str()))
    {
      Serial.println("RFID UID published to MQTT topic: " + String(scanned_rfid_topic));
      displayOLED("Card Scanned", "UID:", uidString, "Sent to Server", true);
    }
    else
    {
      Serial.println("Failed to publish RFID UID to MQTT.");
      displayOLED("Card Scanned", "UID:", uidString, "MQTT Post Fail", true);
    }
  } else {
    Serial.println("MQTT not connected. Cannot publish RFID UID.");
    displayOLED("Card Scanned", "UID:", uidString, "MQTT Offline", true);
  }

  delay(2000);   // Display UID on OLED for 2 seconds
  displayLogo();
  lastRFIDScanMessageTime = millis();
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
 * @brief Connects to the MQTT broker.
 * @return True if connection is successful, false otherwise.
 */
bool connectMQTT()
{
  // Caller should handle display for retries. This function displays final success/failure.

  // Ensure hostname and topics are valid before attempting to connect
  if (hostname == "" || hostname.startsWith("keylock-000000000000") || strlen(access_topic) == 0) {
    Serial.println("CRITICAL: MQTT connect: Hostname or access_topic not properly initialized.");
    Serial.print("Current Hostname: "); Serial.println(hostname);
    Serial.print("Current Access Topic: "); Serial.println(access_topic);
    displayOLED("MQTT Error", "Bad Hostname/Topic", hostname, "", true);
    delay(2000);
    return false; // Cannot connect without a proper hostname and access_topic
  }

  mqttServerIp = mqtt_server_ip;
  mqttClient.setServer(mqttServerIp, mqtt_port);
  mqttClient.setCallback(mqttCallback); // Set the MQTT message callback

  // Attempt to connect with a unique client ID (hostname)
  if (hostname == "")
  {
    hostname = "keylock-" + getMacAddressString(false); // Ensure hostname is set
  }

  Serial.print("Attempting MQTT connection to ");
  Serial.print(mqttServerIp);
  Serial.print(":");
  Serial.print(mqtt_port);
  Serial.print(" as ");
  Serial.println(hostname);
  displayOLED("MQTT Connecting", hostname, mqttServerIp.toString());

  if (mqttClient.connect(hostname.c_str()))
  {
    Serial.println("MQTT connected successfully!");
    displayOLED("MQTT Connected", hostname, mqttServerIp.toString());
    // Subscribe to the device-specific access topic
    if (mqttClient.subscribe(access_topic)) {
      Serial.print("Subscribed to access topic: ");
      Serial.println(access_topic);
      displayOLED("MQTT Connected", "Access Topic OK", access_topic, "", false);
    } else {
      Serial.print("Failed to subscribe to access topic: ");
      Serial.println(access_topic);
      displayOLED("MQTT Connected", "Access Sub Fail", access_topic, "", false);
    }
    delay(1000);
    return true;
  }
  else
  {
    Serial.print("MQTT connection failed, rc=");
    Serial.print(mqttClient.state());
    String errorMsg = "MQTT Failed: ";
    switch (mqttClient.state())
    {
    case MQTT_CONNECTION_TIMEOUT:
      errorMsg += "Timeout";
      break;
    case MQTT_CONNECTION_LOST:
      errorMsg += "Lost";
      break;
    case MQTT_CONNECT_FAILED:
      errorMsg += "Connect Failed";
      break;
    case MQTT_DISCONNECTED:
      errorMsg += "Disconnected";
      break;
    case MQTT_CONNECT_BAD_PROTOCOL:
      errorMsg += "Bad Protocol";
      break;
    case MQTT_CONNECT_BAD_CLIENT_ID:
      errorMsg += "Bad Client ID";
      break;
    case MQTT_CONNECT_UNAVAILABLE:
      errorMsg += "Unavailable";
      break;
    case MQTT_CONNECT_BAD_CREDENTIALS:
      errorMsg += "Bad Credentials";
      break;
    case MQTT_CONNECT_UNAUTHORIZED:
      errorMsg += "Unauthorized";
      break;
    default:
      errorMsg += "Unknown (" + String(mqttClient.state()) + ")";
      break;
    }
    Serial.println(" " + errorMsg);
    displayOLED(errorMsg, mqtt_server_ip.toString(), "Will retry...");
    delay(1500); // Show error briefly
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
    String healthPayload = "{\"status\":\"online\", \"ip\":\"" + WiFi.localIP().toString() + "\", \"hostname\":\"" + hostname + "\"}";
    if (mqttClient.publish(health_topic, healthPayload.c_str()))
    {
      // Serial.println("Health check published."); // Reduce verbosity
    }
    else
    {
      Serial.println("Failed to publish health check.");
    }
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
  Serial.print("Message arrived [");
  Serial.print(topic);
  Serial.print("] ");
  String messageTemp;
  for (int i = 0; i < length; i++)
  {
    Serial.print((char)payload[i]);
    messageTemp += (char)payload[i];
  }
  Serial.println();

  // Check if the message is on the device-specific access topic
  if (String(topic) == String(access_topic))
  {
    Serial.print("Received access command: ");
    Serial.println(messageTemp);

    if (messageTemp == "GRANT")
    {
      Serial.println("Access Granted!");
      // Display "Access Granted" on OLED with inverted colors
      displayOLED("Access Granted!", "", hostname, WiFi.localIP().toString(), true, true); // true for clear, true for invert

      // Beep pattern: 1 long, 3 short
      beepBuzzer(500, 1); // Long beep
      delay(100);         // Short pause
      beepBuzzer(150, 3); // 3 short beeps

      // Placeholder for solenoid lock control
      Serial.println("TODO: Activate Solenoid Lock");
      // digitalWrite(SOLENOID_PIN, HIGH); // Example: Turn on solenoid
      // delay(2000); // Keep door unlocked for a few seconds
      // digitalWrite(SOLENOID_PIN, LOW);  // Example: Turn off solenoid

      delay(3000); // Display message for a few seconds
      displayLogo(); // Return to logo screen
    }
    else if (messageTemp == "DENY")
    {
      Serial.println("Access Denied!");
      displayOLED("Access Denied", "", hostname, WiFi.localIP().toString(), true, false); // Normal colors
      beepBuzzer(150, 3); // 3 short beeps for denial
      delay(3000);
      displayLogo();
    }
    else
    {
      Serial.print("Unknown command on access topic: ");
      Serial.println(messageTemp);
      displayOLED("Access Control", "Unknown Cmd:", messageTemp, "", true);
      delay(2000);
      displayLogo();
    }
  }
  else
  {
    Serial.print("Message on unhandled topic: ");
    Serial.println(topic);
  }
}
