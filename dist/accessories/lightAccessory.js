export class CGLightAccessory {
    platform;
    accessory;
    service;
    deviceConfig;
    currentState = {
        on: false,
        brightness: 100,
    };
    constructor(platform, accessory) {
        this.platform = platform;
        this.accessory = accessory;
        this.deviceConfig = accessory.context.device;
        this.accessory.getService(this.platform.Service.AccessoryInformation)
            .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Carlo Gavazzi')
            .setCharacteristic(this.platform.Characteristic.Model, 'CG Smarthouse')
            .setCharacteristic(this.platform.Characteristic.SerialNumber, `CG-${this.deviceConfig.paramid}`);
        this.service = this.accessory.getService(this.platform.Service.Lightbulb)
            || this.accessory.addService(this.platform.Service.Lightbulb);
        this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);
        this.service.getCharacteristic(this.platform.Characteristic.On)
            .onSet(this.setOn.bind(this))
            .onGet(this.getOn.bind(this));
        if (this.deviceConfig.type === 'dimmable-light') {
            this.service.getCharacteristic(this.platform.Characteristic.Brightness)
                .onSet(this.setBrightness.bind(this))
                .onGet(this.getBrightness.bind(this));
        }
        this.initializeState();
    }
    async initializeState() {
        try {
            if (this.deviceConfig.type === 'dimmable-light') {
                const brightness = await this.platform.getDeviceStatus(this.deviceConfig.paramid, 'dimmable-light');
                this.currentState.brightness = typeof brightness === 'number' ? brightness : 100;
                this.currentState.on = this.currentState.brightness > 0;
            }
            else {
                const isOn = await this.platform.getDeviceStatus(this.deviceConfig.paramid, 'light');
                this.currentState.on = Boolean(isOn);
            }
            this.platform.log.debug(`Initialized state for ${this.deviceConfig.name}: on=${this.currentState.on}, brightness=${this.currentState.brightness}`);
        }
        catch (error) {
            this.platform.log.error(`Failed to initialize state for ${this.deviceConfig.name}:`, error);
        }
    }
    async setOn(value) {
        const isOn = value;
        this.platform.log.debug(`Set Characteristic On for ${this.deviceConfig.name} ->`, isOn);
        try {
            if (this.deviceConfig.type === 'dimmable-light' && isOn && this.currentState.brightness === 0) {
                this.currentState.brightness = 100;
                await this.platform.sendCommand(this.deviceConfig.paramid, this.currentState.brightness);
            }
            else if (this.deviceConfig.type === 'dimmable-light' && !isOn) {
                this.currentState.brightness = 0;
                await this.platform.sendCommand(this.deviceConfig.paramid, 0);
            }
            else if (this.deviceConfig.type === 'light') {
                await this.platform.sendCommand(this.deviceConfig.paramid, isOn);
            }
            this.currentState.on = isOn;
            this.platform.log.info(`${this.deviceConfig.name} turned ${isOn ? 'ON' : 'OFF'}`);
        }
        catch (error) {
            this.platform.log.error(`Failed to set On state for ${this.deviceConfig.name}:`, error);
            throw error;
        }
    }
    async getOn() {
        try {
            if (this.deviceConfig.type === 'dimmable-light') {
                const brightness = await this.platform.getDeviceStatus(this.deviceConfig.paramid, 'dimmable-light');
                this.currentState.brightness = typeof brightness === 'number' ? brightness : this.currentState.brightness;
                this.currentState.on = this.currentState.brightness > 0;
            }
            else {
                const isOn = await this.platform.getDeviceStatus(this.deviceConfig.paramid, 'light');
                this.currentState.on = Boolean(isOn);
            }
            this.platform.log.debug(`Get Characteristic On for ${this.deviceConfig.name} ->`, this.currentState.on);
            return this.currentState.on;
        }
        catch (error) {
            this.platform.log.error(`Failed to get On state for ${this.deviceConfig.name}:`, error);
            return this.currentState.on;
        }
    }
    async setBrightness(value) {
        const brightness = value;
        this.platform.log.debug(`Set Characteristic Brightness for ${this.deviceConfig.name} ->`, brightness);
        try {
            await this.platform.sendCommand(this.deviceConfig.paramid, brightness);
            this.currentState.brightness = brightness;
            this.currentState.on = brightness > 0;
            this.service.updateCharacteristic(this.platform.Characteristic.On, this.currentState.on);
            this.platform.log.info(`${this.deviceConfig.name} brightness set to ${brightness}%`);
        }
        catch (error) {
            this.platform.log.error(`Failed to set brightness for ${this.deviceConfig.name}:`, error);
            throw error;
        }
    }
    async getBrightness() {
        try {
            const brightness = await this.platform.getDeviceStatus(this.deviceConfig.paramid, 'dimmable-light');
            this.currentState.brightness = typeof brightness === 'number' ? brightness : this.currentState.brightness;
            this.platform.log.debug(`Get Characteristic Brightness for ${this.deviceConfig.name} ->`, this.currentState.brightness);
            return this.currentState.brightness;
        }
        catch (error) {
            this.platform.log.error(`Failed to get brightness for ${this.deviceConfig.name}:`, error);
            return this.currentState.brightness;
        }
    }
}
//# sourceMappingURL=lightAccessory.js.map