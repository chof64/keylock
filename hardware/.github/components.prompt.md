Here is the breakdown of the modules in the current hardware:

- ESP32 DEVKITV1
- 0.96 inch OLED Display
- Active Buzzer
- Mini RFID-RC522

Here is how the modules are connected to the ESP32 DEVKITV1:

- OLED Display
  - GND -- ESP:GND
  - VCC -- ESP:3V3
  - SCL -- ESP:D27
  - SDA -- ESP:D26

- Active Buzzer
  - GND -- ESP:GND
  - VCC -- ESP:D25

- RFID Module
  - 3V3 -- ESP:3V3
  - RST -- ESP:D21
  - GND -- ESP:GND
  - IRQ -- ESP:_Not connected_
  - MISO -- ESP:D19
  - MOSI -- ESP:D23
  - SCK -- ESP:D18
  - SDA -- ESP:D5
