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
      .setCharacteristic(this.platform.Characteristic.SerialNumber, `CG-${this.deviceConfig.paramid}`);

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
        .onSet(this.setBrightness.bind(this))        // SET - bind to the 'setBrightness` method below
        .onGet(this.getBrightness.bind(this));       // GET - bind to the `getBrightness` method below
    }

    // Initialize the current state by querying the device
    this.initializeState();
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
   * Handle \"SET\" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, turning on a Light bulb.
   */
  async setOn(value: CharacteristicValue): Promise<void> {
    const isOn = value as boolean;
    
    this.platform.log.debug(`Set Characteristic On for ${this.deviceConfig.name} ->`, isOn);

    try {
      // For dimmable lights, turning on means setting to previous brightness (or 100% if it was 0)
      if (this.deviceConfig.type === 'dimmable-light' && isOn && this.currentState.brightness === 0) {
        this.currentState.brightness = 100;
        await this.platform.sendCommand(this.deviceConfig.paramid, this.currentState.brightness);
      } 
      // For dimmable lights, turning off means setting brightness to 0
      else if (this.deviceConfig.type === 'dimmable-light' && !isOn) {
        this.currentState.brightness = 0;
        await this.platform.sendCommand(this.deviceConfig.paramid, 0);
      }
      // For regular lights, just send on/off command
      else if (this.deviceConfig.type === 'light') {
        await this.platform.sendCommand(this.deviceConfig.paramid, isOn);
      }

      this.currentState.on = isOn;
      this.platform.log.info(`${this.deviceConfig.name} turned ${isOn ? 'ON' : 'OFF'}`);
      
    } catch (error) {
      this.platform.log.error(`Failed to set On state for ${this.deviceConfig.name}:`, error);
      throw error; // Re-throw to let HomeKit know the operation failed
    }
  }

  /**
   * Handle the \"GET\" requests from HomeKit
   * These are sent when HomeKit wants to know the current state of the accessory, for example, checking if a Light bulb is on.
   */
  async getOn(): Promise<CharacteristicValue> {
    try {
      // For dimmable lights, on state is determined by brightness > 0
      if (this.deviceConfig.type === 'dimmable-light') {
        const brightness = await this.platform.getDeviceStatus(this.deviceConfig.paramid, 'dimmable-light');
        this.currentState.brightness = typeof brightness === 'number' ? brightness : this.currentState.brightness;
        this.currentState.on = this.currentState.brightness > 0;
      } else {
        const isOn = await this.platform.getDeviceStatus(this.deviceConfig.paramid, 'light');
        this.currentState.on = Boolean(isOn);
      }

      this.platform.log.debug(`Get Characteristic On for ${this.deviceConfig.name} ->`, this.currentState.on);
      return this.currentState.on;
      
    } catch (error) {
      this.platform.log.error(`Failed to get On state for ${this.deviceConfig.name}:`, error);
      return this.currentState.on; // Return cached state on error
    }
  }

  /**
   * Handle \"SET\" requests from HomeKit for Brightness
   */
  async setBrightness(value: CharacteristicValue): Promise<void> {
    const brightness = value as number;
    
    this.platform.log.debug(`Set Characteristic Brightness for ${this.deviceConfig.name} ->`, brightness);

    try {
      await this.platform.sendCommand(this.deviceConfig.paramid, brightness);
      this.currentState.brightness = brightness;
      this.currentState.on = brightness > 0;

      // Update the On characteristic to reflect the brightness change
      this.service.updateCharacteristic(this.platform.Characteristic.On, this.currentState.on);
      
      this.platform.log.info(`${this.deviceConfig.name} brightness set to ${brightness}%`);
      
    } catch (error) {
      this.platform.log.error(`Failed to set brightness for ${this.deviceConfig.name}:`, error);
      throw error; // Re-throw to let HomeKit know the operation failed
    }
  }

  /**
   * Handle the \"GET\" requests from HomeKit for Brightness
   */
  async getBrightness(): Promise<CharacteristicValue> {
    try {
      const brightness = await this.platform.getDeviceStatus(this.deviceConfig.paramid, 'dimmable-light');
      this.currentState.brightness = typeof brightness === 'number' ? brightness : this.currentState.brightness;
      
      this.platform.log.debug(`Get Characteristic Brightness for ${this.deviceConfig.name} ->`, this.currentState.brightness);
      return this.currentState.brightness;
      
    } catch (error) {
      this.platform.log.error(`Failed to get brightness for ${this.deviceConfig.name}:`, error);
      return this.currentState.brightness; // Return cached state on error
    }
  }
}