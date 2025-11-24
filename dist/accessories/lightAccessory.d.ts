import type { CharacteristicValue, PlatformAccessory } from 'homebridge';
import type { CGSmarthousePlatform } from '../platform.js';
export declare class CGLightAccessory {
    private readonly platform;
    private readonly accessory;
    private service;
    private readonly deviceConfig;
    private currentState;
    constructor(platform: CGSmarthousePlatform, accessory: PlatformAccessory);
    updateFromExternalChange(newValue: number | boolean): void;
    private initializeState;
    setOn(value: CharacteristicValue): Promise<void>;
    getOn(): Promise<CharacteristicValue>;
    setBrightness(value: CharacteristicValue): Promise<void>;
    getBrightness(): Promise<CharacteristicValue>;
}
//# sourceMappingURL=lightAccessory.d.ts.map