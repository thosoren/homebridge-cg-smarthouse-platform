# homebridge-cg-smarthouse-platform
Homebridge platform for Carlo Gavazzi Smarthouse
## Installation
Install the NPM plugin globally
```
npm install -g homebridge-cg-smarthouse-platform
```
## Description
This is a simple homebridge plugin for the Carlo Gavazzi Smarthouse home automation platform. It's currently only tested with version 6.5.33 of the Smart House Configurator and it's coresponding SH firmware.

## Configuration Tool

This plugin includes a TypeScript-based configuration tool that can automatically discover devices on your CG Smarthouse system and generate the complete configuration for you.

### Using the Configuration Tool

1. Run the scraper:
   ```bash
   npm run scraper
   ```

2. Provide your CG Smarthouse credentials when prompted:
   - SH web url (e.g., http://192.168.1.100)
   - Username
   - Password

3. The tool will automatically discover all supported accessories and generate a complete configuration JSON that you can copy into your Homebridge config.json file.

### Manual Configuration

If you prefer to configure manually, use this format:
```
  "platforms": [
      {
        "platform" : "CG Smarthouse",
        "name" : "CG Smarthouse",
        "url" : "http://192.168.3.135",
        "accessories" : [
            {
              "paramid" : 1234,
              "type" : "switch",
              "name" : "Bathroom light"
            }
        ]
      }    
  ]
```

## Supported devices (type in config)
* light
* dimmable-light
* switch
* stateless-switch

## Other
Support for other Carlo Gavazzi accessories might be coming, especially for thermostats and temperature sensors
