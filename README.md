# homebridge-cg-smarthouse-platform
Homebridge platform for Carlo Gavazzi Smarthouse
## Installation
Install the NPM plugin globally
```
npm install -g homebridge-cg-smarthouse-platform
```
## Description
This is a simple homebridge plugin for the Carlo Gavazzi Smarthouse home automation platform. It's currently only tested with version 6.5.33 of the Smart House Configurator and it's coresponding SH firmware.

## Example config.json
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
