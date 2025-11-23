import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { parse as parseHtml } from 'node-html-parser';
import * as readline from 'readline';

interface AccessoryType {
  type: string;
  id: string;
  url?: string;
}

interface DiscoveredLink {
  name: string;
  url: string;
  count: number;
}

interface AccessoryConfig {
  name: string;
  paramid: number;
  type: string;
}

interface ConfigJson {
  platform: string;
  name: string;
  username: string;
  password: string;
  url: string;
  accessories: AccessoryConfig[];
}

interface UserInput {
  url: string;
  username: string;
  password: string;
}

class CGSmarthouseScraper {
  private username = '';
  private password = '';
  private url = '';
  private cookie = '';
  private configJson: Partial<ConfigJson> = {};
  private configJsonAccessories: AccessoryConfig[] = [];
  private httpClient: AxiosInstance;

  constructor() {
    this.httpClient = axios.create({
      timeout: 10000,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent': 'homebridge-cg-smarthouse-platform-scraper/1.0.0',
      },
    });
  }

  async getInput(): Promise<void> {
    console.log('\nWelcome to the Carlo Gavazzi Smarthome scraper and config tool!');
    console.log('This tool will scrape your SH web server for accessories and generate a full json config');
    console.log('Please provide the necessary credentials.\n');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      const userInput = await this.promptUser(rl);
      
      this.url = userInput.url;
      this.username = userInput.username;
      this.password = userInput.password;
      
      this.configJson = {
        platform: 'CG Smarthouse',
        name: 'CG Smarthouse',
        username: this.username,
        password: this.password,
        url: this.url,
        accessories: [],
      };

      await this.startScraping();
    } catch (error) {
      console.error('Error getting user input:', error);
    } finally {
      rl.close();
    }
  }

  private async promptUser(rl: readline.Interface): Promise<UserInput> {
    const question = (prompt: string): Promise<string> => {
      return new Promise((resolve) => {
        rl.question(prompt, resolve);
      });
    };

    const url = await question('SH web url: ');
    const username = await question('SH web username: ');
    const password = await question('SH web password: ');

    return { url, username, password };
  }

  async startScraping(): Promise<void> {
    try {
      console.log('\nStarting scraping process...');
      
      await this.logIn();
      console.log('✓ Successfully logged in');

      // Discover device pages from home
      const deviceLinks = await this.discoverDevicePages();
      console.log(`✓ Discovered ${deviceLinks.length} device types`);

      // Map discovered links to accessory types
      const accessoryTypes: AccessoryType[] = [];
      
      for (const link of deviceLinks) {
        if (link.name.toLowerCase().includes('on/off light')) {
          accessoryTypes.push({ type: 'light', id: 'fn__lgt002', url: link.url });
        } else if (link.name.toLowerCase().includes('dimmable light')) {
          accessoryTypes.push({ type: 'dimmable-light', id: 'fn__lgt004', url: link.url });
        } else if (link.name.toLowerCase().includes('zone temperatures')) {
          accessoryTypes.push({ type: 'thermostat', id: 'fn__tempzone001', url: link.url });
        }
      }

      for (const accessoryType of accessoryTypes) {
        console.log(`\nScraping ${accessoryType.type} accessories from ${accessoryType.url}...`);
        await this.getAccessoriesFromPage(accessoryType.type, accessoryType.url!);
      }

      this.configJson.accessories = this.configJsonAccessories;
      console.log('\n=== GENERATED CONFIG ===');
      console.log(JSON.stringify(this.configJson, undefined, 2));
      console.log('\n✓ Scraping completed successfully!');
      
    } catch (error) {
      console.error('Error during scraping:', error);
      process.exit(1);
    }
  }

  private async discoverDevicePages(): Promise<DiscoveredLink[]> {
    try {
      console.log('Discovering device pages from home...');
      
      const response: AxiosResponse = await this.httpClient.get(
        `${this.url}/app/home.php`,
        {
          headers: {
            'Cookie': this.cookie,
          },
          timeout: 15000,
        }
      );

      console.log(`  Home page response status: ${response.status}`);

      const tree = parseHtml(response.data);
      const deviceLinks: DiscoveredLink[] = [];

      // Find all list items with device links
      const listItems = tree.querySelectorAll('li');
      console.log(`  Found ${listItems.length} list items to examine`);
      
      for (const item of listItems) {
        const link = item.querySelector('a');
        if (!link?.getAttribute('href')) continue;
        
        const href = link.getAttribute('href');
        if (!href?.includes('listf.php?t=')) continue;
        
        // Extract device name and count
        const nameElement = link.querySelector('td:last-child');
        if (!nameElement) continue;
        
        const text = nameElement.text || nameElement.innerHTML || '';
        
        // Try multiple patterns to extract name
        let nameMatch = text.match(/^([^<]+)/);
        if (!nameMatch) {
          nameMatch = text.match(/>([^<]+)</); 
        }
        const countMatch = text.match(/<span[^>]*ui-li-count[^>]*>(\d+)<\/span>/) || text.match(/>(\d+)</);
        
        if (nameMatch && nameMatch[1]) {
          const name = nameMatch[1].trim();
          const count = countMatch && countMatch[1] ? parseInt(countMatch[1], 10) : 0;
          
          console.log(`  Found: ${name} (${count} devices) -> ${href}`);
          
          deviceLinks.push({
            name,
            url: href,
            count
          });
        }
      }

      return deviceLinks;
    } catch (error) {
      console.error('Error discovering device pages:', error);
      return [];
    }
  }

  private async logIn(): Promise<void> {
    try {
      console.log(`Attempting to log in to ${this.url}...`);
      
      const loginData = `username=${encodeURIComponent(this.username)}&password=${encodeURIComponent(this.password)}&lng=en-GB&rememberme=1&macadd=1234&submit=Login`;
      
      const response: AxiosResponse = await this.httpClient.post(
        `${this.url}/index.php`,
        loginData,
        {
          timeout: 15000,
        }
      );

      console.log(`  Login response status: ${response.status}`);

      const cookies = response.headers['set-cookie'];
      if (cookies && cookies.length > 0) {
        this.cookie = cookies.join('; ');
        console.log(`  Received ${cookies.length} cookies`);
      } else {
        throw new Error('No session cookie received - login may have failed');
      }
    } catch (error) {
      console.error('Login failed:', error);
      throw new Error('Could not log in to CG Smarthouse system');
    }
  }

  private async getAccessoriesFromPage(accessoryType: string, pageUrl: string): Promise<void> {
    try {
      const response: AxiosResponse = await this.httpClient.get(
        `${this.url}/app/${pageUrl}`,
        {
          headers: {
            'Cookie': this.cookie,
          },
        }
      );

      const numberOfAccessories = this.parseDeviceListPage(accessoryType, response.data);
      console.log(`  Found ${numberOfAccessories} ${accessoryType} accessories`);
      
    } catch (error) {
      console.error(`Error getting ${accessoryType} accessories from ${pageUrl}:`, error);
    }
  }

  private parseDeviceListPage(accessoryType: string, body: string): number {
    try {
      console.log('Parsing device list page with regex approach due to malformed HTML...');
      let count = 0;

      // Use regex to find device entries since HTML is malformed
      const devicePattern = /<li id="class=\"ui-li-static\"(\d+)\"[^>]*>([\s\S]*?)<\/li>/g;
      let match;
      
      while ((match = devicePattern.exec(body)) !== null) {
        try {
          if (!match[1]) continue;
          const paramId = parseInt(match[1], 10);
          if (isNaN(paramId)) continue;
          
          const deviceBlock = match[0];
          console.log(`  Found device block for paramid: ${paramId}`);
          
          // Extract device name from (Fx) pattern
          const nameMatch = deviceBlock.match(/<div[^>]*>\(Fx\)\s*([^<]+)<\/div>/);
          let deviceName = '';
          if (nameMatch && nameMatch[1]) {
            deviceName = nameMatch[1].trim();
          }
          
          // Extract room name from malformed div
          let room = '';
          const roomMatch = deviceBlock.match(/<div class="ValoriAjax">([^<]+)/);
          if (roomMatch && roomMatch[1]) {
            const roomText = roomMatch[1].trim();
            if (roomText && 
                !roomText.includes('%') && 
                !roomText.toLowerCase().includes('off') &&
                !roomText.toLowerCase().includes('on') &&
                !roomText.includes('function_state') &&
                roomText.length > 1 && 
                roomText.length < 50) {
              room = roomText;
            }
          }
          
          if (deviceName) {
            const accessoryName = room && room !== deviceName ? `${room} - ${deviceName}` : deviceName;
            
            this.configJsonAccessories.push({
              name: accessoryName,
              paramid: paramId,
              type: accessoryType,
            });

            count++;
            console.log(`    Added: ${accessoryName} (ID: ${paramId})`);
          }
        } catch (elementError) {
          console.warn('Error parsing device element:', elementError);
        }
      }

      return count;
    } catch (error) {
      console.error('Error parsing device list page:', error);
      return 0;
    }
  }

  static async run(): Promise<void> {
    const scraper = new CGSmarthouseScraper();
    await scraper.getInput();
  }
}

// Auto-run if this file is executed directly
import { fileURLToPath } from 'url';
import { resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const isMainModule = process.argv[1] && resolve(process.argv[1]) === __filename;

if (isMainModule) {
  CGSmarthouseScraper.run().catch((error) => {
    console.error('Scraper failed:', error);
    process.exit(1);
  });
}

export default CGSmarthouseScraper;