import type { API, Characteristic, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig, Service } from 'homebridge';
import type { CGSmarthouseConfig } from './types.js';
export declare class CGSmarthousePlatform implements DynamicPlatformPlugin {
    readonly log: Logging;
    readonly config: PlatformConfig & CGSmarthouseConfig;
    readonly api: API;
    readonly Service: typeof Service;
    readonly Characteristic: typeof Characteristic;
    readonly accessories: PlatformAccessory[];
    private readonly accessoryHandlers;
    private readonly httpClient;
    private sessionCookie;
    private isAuthenticated;
    private statusUpdateInterval;
    private readonly FAST_POLLING_INTERVAL;
    private readonly SLOW_POLLING_INTERVAL;
    private readonly FAST_POLLING_DURATION;
    private currentPollingInterval;
    private lastHomekitRequestTime;
    private isInFastPollingMode;
    private statusCache;
    private cacheTimestamps;
    private readonly CACHE_DURATION;
    constructor(log: Logging, config: PlatformConfig & CGSmarthouseConfig, api: API);
    private startPeriodicStatusUpdates;
    private activateFastPolling;
    private adjustPollingInterval;
    private getBulkDeviceStatus;
    private updateAllAccessoryStatuses;
    configureAccessory(accessory: PlatformAccessory): void;
    discoverDevices(): Promise<void>;
    private createAccessoryHandler;
    private notifyAccessoryStatusChange;
    private authenticate;
    sendCommand(paramid: number, value: number | boolean, deviceType?: string): Promise<boolean>;
    getDeviceStatus(paramid: number, type: string): Promise<number | boolean>;
    private clearHomebridgeCache;
}
//# sourceMappingURL=platform.d.ts.map