import axios from 'axios';
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
    constructor(log, config, api) {
        this.log = log;
        this.config = config;
        this.api = api;
        this.Service = api.hap.Service;
        this.Characteristic = api.hap.Characteristic;
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
        this.log.debug(`Getting status for device ${paramid} of type ${type} (stubbed)`);
        if (type === 'light') {
            return false;
        }
        else if (type === 'dimmable-light') {
            return 50;
        }
        return false;
    }
}
//# sourceMappingURL=platform.js.map