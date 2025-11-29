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
            .setCharacteristic(this.platform.Characteristic.SerialNumber, `CG-${this.deviceConfig.paramid}`)
            .setCharacteristic(this.platform.Characteristic.FirmwareRevision, '1.0.0')
            .setCharacteristic(this.platform.Characteristic.HardwareRevision, '1.0.0');
        this.service = this.accessory.getService(this.platform.Service.Lightbulb)
            || this.accessory.addService(this.platform.Service.Lightbulb);
        this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);
        this.service.getCharacteristic(this.platform.Characteristic.On)
            .onSet(this.setOn.bind(this))
            .onGet(this.getOn.bind(this));
        if (this.deviceConfig.type === 'dimmable-light') {
            this.service.getCharacteristic(this.platform.Characteristic.Brightness)
                .setProps({
                minValue: 0,
                maxValue: 100,
                minStep: 1,
            })
                .onSet(this.setBrightness.bind(this))
                .onGet(this.getBrightness.bind(this));
        }
        this.initializeState();
    }
    updateFromExternalChange(newValue) {
        try {
            if (this.deviceConfig.type === 'dimmable-light') {
                const brightness = typeof newValue === 'number' ? Math.max(0, Math.min(100, newValue)) : 0;
                const wasOn = this.currentState.on;
                const wasBrightness = this.currentState.brightness;
                this.currentState.brightness = brightness;
                this.currentState.on = brightness > 0;
                if (wasOn !== this.currentState.on) {
                    this.service.updateCharacteristic(this.platform.Characteristic.On, this.currentState.on);
                    this.platform.log.info(`🔄 HomeKit updated: ${this.deviceConfig.name} On = ${this.currentState.on}`);
                }
                if (wasBrightness !== this.currentState.brightness) {
                    this.service.updateCharacteristic(this.platform.Characteristic.Brightness, this.currentState.brightness);
                    this.platform.log.info(`🔄 HomeKit updated: ${this.deviceConfig.name} Brightness = ${this.currentState.brightness}%`);
                }
            }
            else {
                const isOn = Boolean(newValue);
                const wasOn = this.currentState.on;
                this.currentState.on = isOn;
                if (wasOn !== this.currentState.on) {
                    this.service.updateCharacteristic(this.platform.Characteristic.On, this.currentState.on);
                    this.platform.log.info(`🔄 HomeKit updated: ${this.deviceConfig.name} On = ${this.currentState.on}`);
                }
            }
        }
        catch (error) {
            this.platform.log.error(`Error updating external change for ${this.deviceConfig.name}:`, error);
        }
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
        try {
            const isOn = value;
            console.log('=== INCOMING HOMEKIT REQUEST ===');
            console.log('Device:', this.deviceConfig.name);
            console.log('Characteristic: On');
            console.log('Operation: SET');
            console.log('Value:', value);
            console.log('================================');
            this.currentState.on = isOn;
            const success = await this.platform.sendCommand(this.deviceConfig.paramid, isOn ? 1 : 0, this.deviceConfig.type);
            if (!success) {
                this.platform.log.warn(`Failed to send On command to ${this.deviceConfig.name}`);
            }
            this.platform.log.debug(`Set On for ${this.deviceConfig.name} to ${isOn}`);
        }
        catch (error) {
            this.platform.log.error(`Error setting On for ${this.deviceConfig.name}:`, error);
        }
    }
    async getOn() {
        try {
            console.log('=== INCOMING HOMEKIT REQUEST ===');
            console.log('Device:', this.deviceConfig.name);
            console.log('Characteristic: On');
            console.log('Operation: GET');
            console.log('================================');
            try {
                if (this.deviceConfig.type === 'dimmable-light') {
                    const brightness = await this.platform.getDeviceStatus(this.deviceConfig.paramid, this.deviceConfig.type);
                    this.currentState.brightness = brightness;
                    this.currentState.on = brightness > 0;
                }
                else {
                    this.currentState.on = await this.platform.getDeviceStatus(this.deviceConfig.paramid, this.deviceConfig.type);
                }
            }
            catch (error) {
                this.platform.log.warn(`Failed to get fresh status for ${this.deviceConfig.name}, using cached value`);
            }
            this.platform.log.debug(`Get On for ${this.deviceConfig.name}: ${this.currentState.on}`);
            return this.currentState.on;
        }
        catch (error) {
            this.platform.log.error(`Error getting On for ${this.deviceConfig.name}:`, error);
            return this.currentState.on;
        }
    }
    async setBrightness(value) {
        try {
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
            this.currentState.brightness = brightness;
            this.currentState.on = brightness > 0;
            const success = await this.platform.sendCommand(this.deviceConfig.paramid, brightness, this.deviceConfig.type);
            if (!success) {
                this.platform.log.warn(`Failed to send Brightness command to ${this.deviceConfig.name}`);
            }
            this.platform.log.debug(`Set Brightness for ${this.deviceConfig.name} to ${brightness}%`);
        }
        catch (error) {
            this.platform.log.error(`Error setting Brightness for ${this.deviceConfig.name}:`, error);
        }
    }
    async getBrightness() {
        try {
            console.log('=== INCOMING HOMEKIT REQUEST ===');
            console.log('Device:', this.deviceConfig.name);
            console.log('Characteristic: Brightness');
            console.log('Operation: GET');
            console.log('================================');
            try {
                const brightness = await this.platform.getDeviceStatus(this.deviceConfig.paramid, this.deviceConfig.type);
                if (typeof brightness === 'number' && !isNaN(brightness)) {
                    this.currentState.brightness = Math.max(0, Math.min(100, brightness));
                    this.currentState.on = this.currentState.brightness > 0;
                }
            }
            catch (error) {
                this.platform.log.warn(`Failed to get fresh brightness for ${this.deviceConfig.name}, using cached value`);
            }
            const validBrightness = Math.max(0, Math.min(100, this.currentState.brightness));
            this.platform.log.debug(`Get Brightness for ${this.deviceConfig.name}: ${validBrightness}%`);
            return validBrightness;
        }
        catch (error) {
            this.platform.log.error(`Error getting Brightness for ${this.deviceConfig.name}:`, error);
            return this.currentState.brightness || 0;
        }
    }
}
//# sourceMappingURL=lightAccessory.js.map