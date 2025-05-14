#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <DHT.h> // Added DHT library

// Pin Definitions
#define I2C_SDA 21 // ESP32 pin D21 for OLED SDA
#define I2C_SCL 22 // ESP32 pin D22 for OLED SCL

// DHT Sensor Settings
#define DHTPIN 4          // ESP32 pin D4 connected to DHT11 data pin
#define DHTTYPE DHT11     // DHT 11 sensor type
DHT dht(DHTPIN, DHTTYPE); // Initialize DHT sensor

// OLED Display Settings
#define SCREEN_WIDTH 128 // OLED display width, in pixels
#define SCREEN_HEIGHT 64 // OLED display height, in pixels
#define OLED_RESET -1    // Reset pin # (or -1 if sharing ESP32 reset pin)
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// State variables
float currentTemperature = NAN; // Using NAN to indicate not yet read
float currentHumidity = NAN;
float lastTemperatureRead = NAN;
float lastHumidityRead = NAN;
String systemStatusMessage = "Reading..."; // For "Reading...", "DHT Error"
String lastSystemStatusMessage = "";       // To track changes in status message

void updateDisplay()
{
  bool needsUpdate = false;
  if (currentTemperature != lastTemperatureRead ||
      currentHumidity != lastHumidityRead ||
      systemStatusMessage != lastSystemStatusMessage)
  {
    needsUpdate = true;
  }

  if (!needsUpdate)
  {
    return;
  }

  display.clearDisplay();

  if (!systemStatusMessage.isEmpty())
  { // If "Reading..." or "DHT Error"
    display.setTextSize(2);
    int16_t x1, y1;
    uint16_t w, h;
    display.getTextBounds(systemStatusMessage, 0, 0, &x1, &y1, &w, &h);
    display.setCursor((SCREEN_WIDTH - w) / 2, (SCREEN_HEIGHT - h) / 2);
    display.println(systemStatusMessage);
  }
  else
  {
    // Display Temperature
    display.setTextSize(1);
    display.setCursor(0, 0);
    display.print(F("Temperature:"));

    display.setTextSize(2);
    display.setCursor(0, 10); // Position value below label
    display.print(String(currentTemperature, 1));
    display.print(F(" C"));

    // Display Humidity
    display.setTextSize(1);
    display.setCursor(0, 35); // Position below temperature block
    display.print(F("Humidity:"));

    display.setTextSize(2);
    display.setCursor(0, 45); // Position value below label
    display.print(String(currentHumidity, 1));
    display.print(F(" %"));
  }

  display.display();

  lastTemperatureRead = currentTemperature;
  lastHumidityRead = currentHumidity;
  lastSystemStatusMessage = systemStatusMessage;
}

// --- Core ESP32 Functions ---

void setup()
{
  Serial.begin(115200);

  Wire.begin(I2C_SDA, I2C_SCL);
  dht.begin(); // Initialize DHT sensor

  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C))
  {
    Serial.println(F("SSD1306 allocation failed"));
    for (;;)
      ;
  }
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  systemStatusMessage = "Reading..."; // Initial message
  updateDisplay();                    // Initial display update
}

void loop()
{
  // Read from DHT sensor
  float h = dht.readHumidity();
  float t = dht.readTemperature(); // Read temperature as Celsius (the default)

  // Check if any reads failed
  if (isnan(h) || isnan(t))
  {
    Serial.println(F("Failed to read from DHT sensor!"));
    systemStatusMessage = "DHT Error";
    // currentTemperature and currentHumidity will retain last valid values or NAN if never valid
  }
  else
  {
    systemStatusMessage = ""; // Clear status message, indicating valid data
    currentTemperature = t;
    currentHumidity = h;

    Serial.print(F("Humidity: "));
    Serial.print(h);
    Serial.print(F("%  Temperature: "));
    Serial.print(t);
    Serial.println(F("°C"));
  }

  updateDisplay();

  delay(2000); // Delay between readings (DHT11 recommended minimum is 2s)
}
