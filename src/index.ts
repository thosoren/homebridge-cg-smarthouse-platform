import type { API } from 'homebridge';

import { CGSmarthousePlatform } from './platform.js'; 
import { PLATFORM_NAME } from './settings.js';

/**
 * This method registers the platform with Homebridge
 */
export default (api: API): void => {
  api.registerPlatform(PLATFORM_NAME, CGSmarthousePlatform);
};