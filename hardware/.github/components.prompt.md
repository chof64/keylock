Here is the breakdown of the modules in the current hardware:

- ESP32 DEVKITV1
- 0.96 inch OLED Display
- DHT11 Temperature and Humidity Sensor
- Button Switch
- Active Buzzer

Here is how the modules are connected to the ESP32 DEVKITV1:

1. OLED Display (0.96 inch)
  - VCC: Connected to ESP32 3.3V
  - GND: Connected to ESP32 GND
  - SDA: Connected to ESP32 pin D21
  - SCL: Connected to ESP32 pin D22
2. DHT11 Temperature and Humidity Sensor
  - VCC: Connected to ESP32 3.3V
  - GND: Connected to ESP32 GND
  - DATA: Connected to ESP32 pin D4 (Note: This 3-pin DHT11 module has an internal pull-up resistor, so no external resistor is required.)
3. Button Switch
  - Pin 1: Connected to ESP32 pin D5
  - Pin 2: Connected to ESP32 GND (Note: Configure D5 as INPUT_PULLUP in code. A button press will read LOW.)
4. Buzzer
  - Positive Pin: Connected to ESP32 pin D18
  - Negative Pin: Connected to ESP32 GND (Note: This is an active buzzer. It generates a fixed tone when power is applied. You can control it with a simple digitalWrite(HIGH) or digitalWrite(LOW).)