import type {
  CharacteristicValue,
  PlatformAccessory,
  Service,
} from 'homebridge';

import type { CGSmarthousePlatform } from '../platform.js';
import type { CGAccessoryConfig } from '../types.js';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class CGLightAccessory {
  private service: Service;
  private readonly deviceConfig: CGAccessoryConfig;

  // Current state
  private currentState = {
    on: false,
    brightness: 100, // only used for dimmable lights
  };

  constructor(
    private readonly platform: CGSmarthousePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    this.deviceConfig = accessory.context.device;

    // Set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Carlo Gavazzi')
      .setCharacteristic(this.platform.Characteristic.Model, 'CG Smarthouse')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, `CG-${this.deviceConfig.paramid}`)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, '1.0.0')
      .setCharacteristic(this.platform.Characteristic.HardwareRevision, '1.0.0');

    // Get the LightBulb service if it exists, otherwise create a new LightBulb service
    // You can create multiple services for each accessory
    this.service = this.accessory.getService(this.platform.Service.Lightbulb) 
      || this.accessory.addService(this.platform.Service.Lightbulb);

    // Set the service name, this is what is displayed as the default name on the Home app
    // In this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);

    // Each service must implement at-minimum the \"required characteristics\" for the given service type
    // see https://developers.homekit.apple.com/service/BFA36B68-35D0-48E9-AD5F-FE7C4C5F8BF8

    // Register handlers for the On/Off Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setOn.bind(this))                // SET - bind to the `setOn` method below
      .onGet(this.getOn.bind(this));               // GET - bind to the `getOn` method below

    // Register handlers for the Brightness Characteristic (only for dimmable lights)
    if (this.deviceConfig.type === 'dimmable-light') {
      this.service.getCharacteristic(this.platform.Characteristic.Brightness)
        .setProps({
          minValue: 0,
          maxValue: 100,
          minStep: 1,
        })
        .onSet(this.setBrightness.bind(this))        // SET - bind to the 'setBrightness` method below
        .onGet(this.getBrightness.bind(this));       // GET - bind to the `getBrightness` method below
    }

    // Initialize the current state by querying the device
    this.initializeState();
  }

  /**
   * Handle external status changes (from physical switches)
   */
  updateFromExternalChange(newValue: number | boolean): void {
    try {
      if (this.deviceConfig.type === 'dimmable-light') {
        const brightness = typeof newValue === 'number' ? Math.max(0, Math.min(100, newValue)) : 0;
        const wasOn = this.currentState.on;
        const wasBrightness = this.currentState.brightness;
        
        this.currentState.brightness = brightness;
        this.currentState.on = brightness > 0;
        
        // Notify HomeKit of the changes
        if (wasOn !== this.currentState.on) {
          this.service.updateCharacteristic(this.platform.Characteristic.On, this.currentState.on);
          this.platform.log.info(`🔄 HomeKit updated: ${this.deviceConfig.name} On = ${this.currentState.on}`);
        }
        
        if (wasBrightness !== this.currentState.brightness) {
          this.service.updateCharacteristic(this.platform.Characteristic.Brightness, this.currentState.brightness);
          this.platform.log.info(`🔄 HomeKit updated: ${this.deviceConfig.name} Brightness = ${this.currentState.brightness}%`);
        }
      } else {
        // Regular on/off light
        const isOn = Boolean(newValue);
        const wasOn = this.currentState.on;
        
        this.currentState.on = isOn;
        
        if (wasOn !== this.currentState.on) {
          this.service.updateCharacteristic(this.platform.Characteristic.On, this.currentState.on);
          this.platform.log.info(`🔄 HomeKit updated: ${this.deviceConfig.name} On = ${this.currentState.on}`);
        }
      }
    } catch (error) {
      this.platform.log.error(`Error updating external change for ${this.deviceConfig.name}:`, error);
    }
  }

  /**
   * Initialize the accessory state from the device
   */
  private async initializeState(): Promise<void> {
    try {
      if (this.deviceConfig.type === 'dimmable-light') {
        const brightness = await this.platform.getDeviceStatus(this.deviceConfig.paramid, 'dimmable-light');
        this.currentState.brightness = typeof brightness === 'number' ? brightness : 100;
        this.currentState.on = this.currentState.brightness > 0;
      } else {
        const isOn = await this.platform.getDeviceStatus(this.deviceConfig.paramid, 'light');
        this.currentState.on = Boolean(isOn);
      }

      this.platform.log.debug(`Initialized state for ${this.deviceConfig.name}: on=${this.currentState.on}, brightness=${this.currentState.brightness}`);
    } catch (error) {
      this.platform.log.error(`Failed to initialize state for ${this.deviceConfig.name}:`, error);
    }
  }

  /**
 * Handle "SET" requests from HomeKit
 */
async setOn(value: CharacteristicValue): Promise<void> {
  try {
    const isOn = value as boolean;
    
    console.log('=== INCOMING HOMEKIT REQUEST ===');
    console.log('Device:', this.deviceConfig.name);
    console.log('Characteristic: On');
    console.log('Operation: SET');
    console.log('Value:', value);
    console.log('================================');
    
    // Update internal state immediately for responsiveness
    this.currentState.on = isOn;
    
    // Send command to device
    const success = await this.platform.sendCommand(this.deviceConfig.paramid, isOn ? 1 : 0, this.deviceConfig.type);
    if (!success) {
      this.platform.log.warn(`Failed to send On command to ${this.deviceConfig.name}`);
    }
    
    this.platform.log.debug(`Set On for ${this.deviceConfig.name} to ${isOn}`);
    
  } catch (error) {
    this.platform.log.error(`Error setting On for ${this.deviceConfig.name}:`, error);
    // Don't throw errors to HomeKit to avoid compliance issues
    // Just log the error and continue
  }
}

/**
 * Handle "GET" requests from HomeKit
 */
async getOn(): Promise<CharacteristicValue> {
  try {
    console.log('=== INCOMING HOMEKIT REQUEST ===');
    console.log('Device:', this.deviceConfig.name);
    console.log('Characteristic: On');
    console.log('Operation: GET');
    console.log('================================');

    // Try to get fresh status, fall back to cached state
    try {
      if (this.deviceConfig.type === 'dimmable-light') {
        const brightness = await this.platform.getDeviceStatus(this.deviceConfig.paramid, this.deviceConfig.type) as number;
        this.currentState.brightness = brightness;
        this.currentState.on = brightness > 0;
      } else {
        this.currentState.on = await this.platform.getDeviceStatus(this.deviceConfig.paramid, this.deviceConfig.type) as boolean;
      }
    } catch (error) {
      this.platform.log.warn(`Failed to get fresh status for ${this.deviceConfig.name}, using cached value`);
    }

    this.platform.log.debug(`Get On for ${this.deviceConfig.name}: ${this.currentState.on}`);
    return this.currentState.on;
    
  } catch (error) {
    this.platform.log.error(`Error getting On for ${this.deviceConfig.name}:`, error);
    // Return cached value instead of throwing error
    return this.currentState.on;
  }
}

/**
 * Handle "SET" requests from HomeKit for Brightness
 */
async setBrightness(value: CharacteristicValue): Promise<void> {
  try {
    // Ensure we have a valid number and clamp to valid range
    const rawBrightness = Number(value);
    if (isNaN(rawBrightness)) {
      this.platform.log.warn(`Invalid brightness value for ${this.deviceConfig.name}: ${value}`);
      return;
    }
    
    const brightness = Math.max(0, Math.min(100, rawBrightness));
    
    console.log('=== INCOMING HOMEKIT REQUEST ===');
    console.log('Device:', this.deviceConfig.name);
    console.log('Characteristic: Brightness');
    console.log('Operation: SET');
    console.log('Raw Value:', value);
    console.log('Clamped Value:', brightness);
    console.log('================================');
    
    // Update internal state
    this.currentState.brightness = brightness;
    this.currentState.on = brightness > 0;
    
    // Send command to device
    const success = await this.platform.sendCommand(this.deviceConfig.paramid, brightness, this.deviceConfig.type);
    if (!success) {
      this.platform.log.warn(`Failed to send Brightness command to ${this.deviceConfig.name}`);
    }
    
    this.platform.log.debug(`Set Brightness for ${this.deviceConfig.name} to ${brightness}%`);
    
  } catch (error) {
    this.platform.log.error(`Error setting Brightness for ${this.deviceConfig.name}:`, error);
    // Don't throw errors to HomeKit to avoid compliance issues
  }
}

/**
 * Handle "GET" requests from HomeKit for Brightness
 */
async getBrightness(): Promise<CharacteristicValue> {
  try {
    console.log('=== INCOMING HOMEKIT REQUEST ===');
    console.log('Device:', this.deviceConfig.name);
    console.log('Characteristic: Brightness');
    console.log('Operation: GET');
    console.log('================================');

    // Try to get fresh status, fall back to cached state
    try {
      const brightness = await this.platform.getDeviceStatus(this.deviceConfig.paramid, this.deviceConfig.type) as number;
      if (typeof brightness === 'number' && !isNaN(brightness)) {
        this.currentState.brightness = Math.max(0, Math.min(100, brightness)); // Ensure valid range
        this.currentState.on = this.currentState.brightness > 0;
      }
    } catch (error) {
      this.platform.log.warn(`Failed to get fresh brightness for ${this.deviceConfig.name}, using cached value`);
    }

    // Ensure we always return a valid brightness value
    const validBrightness = Math.max(0, Math.min(100, this.currentState.brightness));
    this.platform.log.debug(`Get Brightness for ${this.deviceConfig.name}: ${validBrightness}%`);
    return validBrightness;
    
  } catch (error) {
    this.platform.log.error(`Error getting Brightness for ${this.deviceConfig.name}:`, error);
    // Return a safe default value
    return this.currentState.brightness || 0;
  }
}
}