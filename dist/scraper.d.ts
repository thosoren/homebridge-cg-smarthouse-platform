declare class CGSmarthouseScraper {
    private username;
    private password;
    private url;
    private cookie;
    private configJson;
    private configJsonAccessories;
    private httpClient;
    constructor();
    getInput(): Promise<void>;
    private promptUser;
    startScraping(): Promise<void>;
    private discoverDevicePages;
    private logIn;
    private getAccessoriesFromPage;
    private parseDeviceListPage;
    static run(): Promise<void>;
}
export default CGSmarthouseScraper;
//# sourceMappingURL=scraper.d.ts.map