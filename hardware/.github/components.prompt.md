Here is the breakdown of the modules in the current hardware:

- ESP32 DEVKITV1
- 0.96 inch OLED Display
- Active Buzzer
- Mini RFID-RC522

Here is how the modules are connected to the ESP32 DEVKITV1:

- OLED Display
  - GND -- ESP:GND
  - VCC -- ESP:3V3
  - SCL -- ESP:D22
  - SDA -- ESP:D23

- Active Buzzer
  - GND -- ESP:GND
  - VCC -- ESP:D4

- RFID Module
  - 3V3 -- ESP:3V3
  - RST -- ESP:D14
  - GND -- ESP:GND
  - IRQ -- ESP:D33
  - MISO -- ESP:D25
  - MOSI -- ESP:D26
  - SCK -- ESP:D27
  - SDA -- ESP:D32
