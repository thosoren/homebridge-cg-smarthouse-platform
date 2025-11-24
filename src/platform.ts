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
import * as fs from 'fs';
import * as path from 'path';

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

  // Track accessory handlers for status updates
  private readonly accessoryHandlers: Map<number, any> = new Map();

  private readonly httpClient: AxiosInstance;
  private sessionCookie: string | null = null;
  private isAuthenticated = false;

  private statusUpdateInterval: NodeJS.Timeout | null = null;
  private readonly STATUS_UPDATE_INTERVAL = 5000; // 5 seconds

  private statusCache: Record<number, number | boolean> = {};
  private cacheTimestamps: Record<number, number> = {};
  private readonly CACHE_DURATION = 2000; // 2 seconds cache

  constructor(
    public readonly log: Logging,
    public readonly config: PlatformConfig & CGSmarthouseConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    // Clear cache on startup
    this.clearHomebridgeCache();

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

    // Start periodic status updates
    this.startPeriodicStatusUpdates();
  }

  /**
   * Start periodic bulk status updates for all accessories
   */
  private startPeriodicStatusUpdates(): void {
    this.statusUpdateInterval = setInterval(async () => {
      await this.updateAllAccessoryStatuses();
    }, this.STATUS_UPDATE_INTERVAL);

    this.log.debug('Started periodic status updates');
  }

  /**
   * Get status for multiple devices in a single request
   */
  private async getBulkDeviceStatus(paramids: number[]): Promise<Record<number, number | boolean>> {
    if (!this.isAuthenticated || !this.sessionCookie) {
      throw new Error('Not authenticated');
    }

    try {
      // Build bulk request for CG API
      const body = `param=[${paramids.join(',')}]`;
      
      const response = await this.httpClient.post(`${this.config.url}/app/fstatusrefresh.php`, body, {
        headers: {
          'Cookie': this.sessionCookie,
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'User-Agent': 'homebridge-cg-smarthouse-platform/2.0.0',
        },
      });

      this.log.debug('Raw API response:', JSON.stringify(response.data));

      // Parse CG response format
      const results: Record<number, number | boolean> = {};
      
      if (response.data && Array.isArray(response.data)) {
        // CG API returns an array of objects with {id, state, value, ...}
        // The 'state' field contains the brightness value (0-100)
        // The 'id' field contains the paramid as a string
        response.data.forEach((item: any) => {
          if (item && typeof item === 'object' && item.id !== undefined && item.state !== undefined) {
            const paramid = parseInt(item.id, 10);
            const state = typeof item.state === 'number' ? item.state : parseInt(String(item.state), 10);
            
            if (!isNaN(paramid) && !isNaN(state)) {
              results[paramid] = state;
              this.log.debug(`Parsed device ${paramid}: state=${state}`);
            }
          }
        });
      }

      return results;
      
    } catch (error) {
      this.log.error('Bulk status request error:', error);
      throw error;
    }
  }

  /**
   * Update status for all accessories in bulk
   */
  private async updateAllAccessoryStatuses(): Promise<void> {
    if (!this.isAuthenticated || this.config.accessories.length === 0) {
      return;
    }

    try {
      const paramids = this.config.accessories.map(device => device.paramid);
      this.log.debug('Updating status for devices:', paramids);
      
      const results = await this.getBulkDeviceStatus(paramids);

      this.log.debug('Bulk status results:', results);
      
      // Check for changes and notify HomeKit
      for (const [paramid, newValue] of Object.entries(results)) {
        const paramidNum = parseInt(paramid, 10);
        const oldValue = this.statusCache[paramidNum];

        this.log.debug(`Device ${paramid} - Old: ${oldValue}, New: ${newValue}`);
        
        if (oldValue !== undefined && oldValue !== newValue) {
          // Status changed - notify HomeKit
          this.log.info(`Device ${paramid} status changed: ${oldValue} → ${newValue}`);
          this.notifyAccessoryStatusChange(paramidNum, newValue);
        }
      }
      
      // Update cache with fresh data
      this.statusCache = { ...this.statusCache, ...results };
      const now = Date.now();
      paramids.forEach(paramid => {
        this.cacheTimestamps[paramid] = now;
      });
      
      this.log.debug(`Updated status for ${Object.keys(results).length} devices`);
      
    } catch (error) {
      this.log.error('Periodic status update failed:', error);
    }
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
      const handler = new CGLightAccessory(this, accessory);
      // Register handler for status updates
      this.accessoryHandlers.set(device.paramid, handler);
    } else {
      this.log.warn('Unsupported device type:', device.type);
    }
  }

  /**
   * Notify specific accessory of status change
   */
  private notifyAccessoryStatusChange(paramid: number, newValue: number | boolean): void {
    const handler = this.accessoryHandlers.get(paramid);
    if (handler && typeof handler.updateFromExternalChange === 'function') {
      this.log.debug(`Notifying accessory ${paramid} of status change to ${newValue}`);
      handler.updateFromExternalChange(newValue);
    } else {
      this.log.warn(`No handler found for device ${paramid}`);
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
   * Get current status of a device (now uses cache)
   */
  async getDeviceStatus(paramid: number, type: string): Promise<number | boolean> {
    console.log('=== DEVICE STATUS REQUEST ===');
    console.log('ParamID:', paramid);
    console.log('Type:', type);
    console.log('Cached value:', this.statusCache[paramid]);
    console.log('=============================');

    // Return cached value if available
    if (this.statusCache[paramid] !== undefined) {
      return this.statusCache[paramid];
    }

    // Fallback to default values
    this.log.warn(`No cached status for device ${paramid}, using default`);
    if (type === 'light') {
      return false;
    } else if (type === 'dimmable-light') {
      return 50;
    }
    
    return false;
  }

  /**
   * Clear Homebridge cache directories on startup
   */
  private clearHomebridgeCache(): void {
    try {
      const homebridgeDir = this.api.user.storagePath();
      const accessoriesDir = path.join(homebridgeDir, 'accessories');
      
      // Clear accessories cache only (preserve persist directory for HomeKit pairing)
      if (fs.existsSync(accessoriesDir)) {
        fs.rmSync(accessoriesDir, { recursive: true, force: true });
        this.log.info('Cleared accessories cache directory');
      }
      
      // Note: We intentionally preserve the persist directory to maintain HomeKit pairing
      this.log.info('Cache cleared successfully - HomeKit pairing preserved');
      
    } catch (error) {
      this.log.warn('Failed to clear cache on startup:', error);
    }
  }
}