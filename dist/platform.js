import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import { CGLightAccessory } from './accessories/lightAccessory.js';
export class CGSmarthousePlatform {
    log;
    config;
    api;
    Service;
    Characteristic;
    accessories = [];
    httpClient;
    sessionCookie = null;
    isAuthenticated = false;
    statusUpdateInterval = null;
    STATUS_UPDATE_INTERVAL = 5000;
    statusCache = {};
    cacheTimestamps = {};
    CACHE_DURATION = 2000;
    constructor(log, config, api) {
        this.log = log;
        this.config = config;
        this.api = api;
        this.Service = api.hap.Service;
        this.Characteristic = api.hap.Characteristic;
        this.clearHomebridgeCache();
        this.httpClient = axios.create({
            timeout: 10000,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'User-Agent': 'homebridge-cg-smarthouse-platform/2.0.0',
            },
        });
        this.log.debug('Finished initializing platform:', this.config.name);
        this.api.on('didFinishLaunching', () => {
            log.debug('Executed didFinishLaunching callback');
            this.discoverDevices();
        });
        this.startPeriodicStatusUpdates();
    }
    startPeriodicStatusUpdates() {
        this.statusUpdateInterval = setInterval(async () => {
            await this.updateAllAccessoryStatuses();
        }, this.STATUS_UPDATE_INTERVAL);
        this.log.debug('Started periodic status updates');
    }
    async getBulkDeviceStatus(paramids) {
        if (!this.isAuthenticated || !this.sessionCookie) {
            throw new Error('Not authenticated');
        }
        try {
            const body = `param=[${paramids.join(',')}]`;
            const response = await this.httpClient.post(`${this.config.url}/app/fstatusrefresh.php`, body, {
                headers: {
                    'Cookie': this.sessionCookie,
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'User-Agent': 'homebridge-cg-smarthouse-platform/2.0.0',
                },
            });
            const results = {};
            if (response.data && Array.isArray(response.data)) {
                response.data.forEach((item) => {
                    if (item.id && item.state !== undefined) {
                        results[item.id] = item.state;
                    }
                });
            }
            return results;
        }
        catch (error) {
            this.log.error('Bulk status request error:', error);
            throw error;
        }
    }
    async updateAllAccessoryStatuses() {
        if (!this.isAuthenticated || this.config.accessories.length === 0) {
            return;
        }
        try {
            const paramids = this.config.accessories.map(device => device.paramid);
            const results = await this.getBulkDeviceStatus(paramids);
            this.statusCache = { ...this.statusCache, ...results };
            const now = Date.now();
            paramids.forEach(paramid => {
                this.cacheTimestamps[paramid] = now;
            });
        }
        catch (error) {
            this.log.error('Periodic status update failed:', error);
        }
    }
    configureAccessory(accessory) {
        this.log.info('Loading accessory from cache:', accessory.displayName);
        this.accessories.push(accessory);
    }
    async discoverDevices() {
        await this.authenticate();
        if (!this.isAuthenticated) {
            this.log.error('Authentication failed, cannot discover devices');
            return;
        }
        for (const device of this.config.accessories) {
            const uuid = this.api.hap.uuid.generate(device.paramid.toString());
            const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);
            if (existingAccessory) {
                this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);
                this.createAccessoryHandler(existingAccessory, device);
            }
            else {
                this.log.info('Adding new accessory:', device.name);
                const accessory = new this.api.platformAccessory(device.name, uuid);
                accessory.context.device = device;
                this.createAccessoryHandler(accessory, device);
                this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
            }
        }
    }
    createAccessoryHandler(accessory, device) {
        if (device.type === 'light' || device.type === 'dimmable-light') {
            new CGLightAccessory(this, accessory);
        }
        else {
            this.log.warn('Unsupported device type:', device.type);
        }
    }
    async authenticate() {
        try {
            this.log.debug('Attempting to authenticate with CG Smarthouse...');
            const response = await this.httpClient.post(`${this.config.url}/index.php`, `username=${encodeURIComponent(this.config.username)}&password=${encodeURIComponent(this.config.password)}&lng=en-GB&rememberme=1&macadd=1234&submit=Login`);
            const cookies = response.headers['set-cookie'];
            if (cookies && cookies.length > 0) {
                this.sessionCookie = cookies.join('; ');
                this.isAuthenticated = true;
                this.log.info('Successfully authenticated with CG Smarthouse');
                this.log.debug('Session cookie:', this.sessionCookie);
            }
            else {
                this.log.error('Authentication failed: No session cookie received');
                this.isAuthenticated = false;
            }
        }
        catch (error) {
            this.log.error('Authentication error:', error);
            this.isAuthenticated = false;
        }
    }
    async sendCommand(paramid, value) {
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
        }
        catch (error) {
            this.log.error('Command error:', error);
            return false;
        }
    }
    async getDeviceStatus(paramid, type) {
        console.log('=== DEVICE STATUS REQUEST ===');
        console.log('ParamID:', paramid);
        console.log('Type:', type);
        console.log('Cached value:', this.statusCache[paramid]);
        console.log('=============================');
        if (this.statusCache[paramid] !== undefined) {
            return this.statusCache[paramid];
        }
        this.log.warn(`No cached status for device ${paramid}, using default`);
        if (type === 'light') {
            return false;
        }
        else if (type === 'dimmable-light') {
            return 50;
        }
        return false;
    }
    clearHomebridgeCache() {
        try {
            const homebridgeDir = this.api.user.storagePath();
            const accessoriesDir = path.join(homebridgeDir, 'accessories');
            if (fs.existsSync(accessoriesDir)) {
                fs.rmSync(accessoriesDir, { recursive: true, force: true });
                this.log.info('Cleared accessories cache directory');
            }
            this.log.info('Cache cleared successfully - HomeKit pairing preserved');
        }
        catch (error) {
            this.log.warn('Failed to clear cache on startup:', error);
        }
    }
}
//# sourceMappingURL=platform.js.map