import type {
  API,
  Characteristic,
  DynamicPlatformPlugin,
  Logging,
  PlatformAccessory,
  PlatformConfig,
  Service,
} from 'homebridge';

import axios, { type AxiosInstance } from 'axios';

import type { CGSmarthouseConfig, CGLoginResponse } from './types.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import { CGLightAccessory } from './accessories/lightAccessory.js';

/**
 * CGSmarthousePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class CGSmarthousePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  private readonly httpClient: AxiosInstance;
  private sessionCookie: string | null = null;
  private isAuthenticated = false;

  constructor(
    public readonly log: Logging,
    public readonly config: PlatformConfig & CGSmarthouseConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    // Configure HTTP client
    this.httpClient = axios.create({
      timeout: 10000,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent': 'homebridge-cg-smarthouse-platform/2.0.0',
      },
    });

    this.log.debug('Finished initializing platform:', this.config.name);

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      this.discoverDevices();
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to set up event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory): void {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache, so we can track if it has already been registered or not
    this.accessories.push(accessory);
  }

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent \"duplicate UUID\" errors.
   */
  async discoverDevices(): Promise<void> {
    // Authentication is required before discovering devices
    await this.authenticate();

    if (!this.isAuthenticated) {
      this.log.error('Authentication failed, cannot discover devices');
      return;
    }

    // Loop through the configured accessories and register each one if it has not already been registered
    for (const device of this.config.accessories) {
      // generate a unique id for the accessory this should be generated from
      // something globally unique, but constant, for example, the device serial
      // number or MAC address
      const uuid = this.api.hap.uuid.generate(device.paramid.toString());

      // see if an accessory with the same uuid has already been registered and restored from
      // the cached devices we stored in the `configureAccessory` method above
      const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

      if (existingAccessory) {
        // the accessory already exists
        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        // existingAccessory.context.device = device;
        // this.api.updatePlatformAccessories([existingAccessory]);

        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        this.createAccessoryHandler(existingAccessory, device);

      } else {
        // the accessory does not yet exist, so we need to create it
        this.log.info('Adding new accessory:', device.name);

        // create a new accessory
        const accessory = new this.api.platformAccessory(device.name, uuid);

        // store a copy of the device object in the `accessory.context`
        // the `context` property can be used to store any data about the accessory you may need
        accessory.context.device = device;

        // create the accessory handler for the newly create accessory
        // this is imported from `platformAccessory.ts`
        this.createAccessoryHandler(accessory, device);

        // link the accessory to your platform
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }
  }

  /**
   * Create the appropriate accessory handler based on device type
   */
  private createAccessoryHandler(accessory: PlatformAccessory, device: any): void {
    if (device.type === 'light' || device.type === 'dimmable-light') {
      new CGLightAccessory(this, accessory);
    } else {
      this.log.warn('Unsupported device type:', device.type);
    }
  }

  /**
   * Authenticate with the CG Smarthouse system
   */
  private async authenticate(): Promise<void> {
    try {
      this.log.debug('Attempting to authenticate with CG Smarthouse...');
      
      const response = await this.httpClient.post(`${this.config.url}/index.php`, 
        `username=${encodeURIComponent(this.config.username)}&password=${encodeURIComponent(this.config.password)}&lng=en-GB&rememberme=1&macadd=1234&submit=Login`
      );

      const cookies = response.headers['set-cookie'];
      if (cookies && cookies.length > 0) {
        this.sessionCookie = cookies.join('; ');
        this.isAuthenticated = true;
        this.log.info('Successfully authenticated with CG Smarthouse');
        this.log.debug('Session cookie:', this.sessionCookie);
      } else {
        this.log.error('Authentication failed: No session cookie received');
        this.isAuthenticated = false;
      }
    } catch (error) {
      this.log.error('Authentication error:', error);
      this.isAuthenticated = false;
    }
  }

  /**
   * Send a command to control a device
   */
  async sendCommand(paramid: number, value: number | boolean): Promise<boolean> {
    if (!this.isAuthenticated || !this.sessionCookie) {
      this.log.error('Not authenticated, cannot send command');
      return false;
    }

    try {
      const command = typeof value === 'boolean' ? (value ? '1' : '0') : value.toString();
      const body = `param=${paramid}&value=${command}&st=1&op=5`;
      
      this.log.debug(`Sending command: paramid=${paramid}, value=${command}`);

      const response = await this.httpClient.post(`${this.config.url}/app/command.php`, body, {
        headers: {
          'Cookie': this.sessionCookie,
        },
      });

      this.log.debug('Command response:', response.status);
      return response.status === 200;
    } catch (error) {
      this.log.error('Command error:', error);
      return false;
    }
  }

  /**
   * Get current status of a device (stubbed for now)
   */
  async getDeviceStatus(paramid: number, type: string): Promise<number | boolean> {
    // For Stage 1, we'll return reasonable default values
    // In a real implementation, this would query the actual device status
    this.log.debug(`Getting status for device ${paramid} of type ${type} (stubbed)`);
    
    if (type === 'light') {
      return false; // off
    } else if (type === 'dimmable-light') {
      return 50; // 50% brightness
    }
    
    return false;
  }
}