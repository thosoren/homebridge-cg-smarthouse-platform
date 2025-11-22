import type { PlatformConfig } from 'homebridge';

export interface CGSmarthouseConfig extends PlatformConfig {
  url: string;
  username: string;
  password: string;
  accessories: CGAccessoryConfig[];
}

export interface CGAccessoryConfig {
  name: string;
  type: 'light' | 'dimmable-light' | 'switch' | 'stateless-switch' | 'temperature-sensor' | 'thermostat';
  paramid: number;
}

export interface CGDeviceResponse {
  success: boolean;
  value?: number | boolean;
  error?: string;
}

export interface CGLoginResponse {
  success: boolean;
  cookie?: string;
  error?: string;
}