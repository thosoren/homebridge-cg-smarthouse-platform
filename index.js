var Service, Characteristic;
const request = require('request');

module.exports = function (homebridge) {
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	homebridge.registerPlatform("homebridge-cg-smarthouse-platform", "CG Smarthouse", CGSmarthouse);
};

function CGSmarthouse(log, config) {
	this.log = log;
	this.config = config;
	this.statusCallbacks = {};
	this.statusTimeout = 0;
	this.cookie = '';
	this.logIn();
}

CGSmarthouse.prototype = {

	accessories: function(callback) {
		var foundAccessories = this.config.accessories;
		var myAccessories = [];

		// midlertidig: bare støtt disse typene
    	var allowedTypes = ['light', 'dimmable-light'];

		for(var i=0; i < foundAccessories.length; i++) {
			this.log('Found accessory: ' + foundAccessories[i].name + ' of type ' + foundAccessories[i].type) + 'allowedTypes.indexOf=' + allowedTypes.indexOf(foundAccessories[i].type);
			if (allowedTypes.indexOf(foundAccessories[i].type) === -1) {
				this.log("Skipping accessory '" + foundAccessories[i].name + "' of unsupported type '" + foundAccessories[i].type + "'");
				continue;
			}

			if(this.isValidAccessory(foundAccessories[i].type)) {
				var accessory = new CGAccessory(this.log, this.config.url, foundAccessories[i],this);
				this.log('Created ' + accessory.name + ' Accessory');
				myAccessories.push(accessory);
			} else {
				this.log('INVALID accessory: ' + foundAccessories[i].name);
			}

		}
		callback(myAccessories);
	},

	isValidAccessory: function(type) {
		var validAccessories = ['light','dimmable-light','switch','stateless-switch','temperature-sensor','thermostat'];
		return validAccessories.includes(type);
	},

	//Log into SmartHouse website
	logIn: function(callback) {
		var me = this;
		request({
			url: me.config.url + '/index.php',
			method: 'POST',
			body: 'username=' + me.config.username + '&password=' + me.config.password + '&lng=en-GB&rememberme=1&macadd=1234&submit=Login',
			headers: {
				"Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
			}
		}, 
		function (error, response, body) {
			if(error) {
				me.log('Could not log in!');
			} else {
				me.cookie = response.headers['set-cookie'];
				me.log("Log in, cookie: " + me.cookie);
			}
			if(typeof callback != "undefined") {
				callback();
			}

		});

	},

	getStatuses: function() {
		var me = this;

		// Hvis ingen callbacks venter, gjør ingenting
		if (!me.statusCallbacks || Object.keys(me.statusCallbacks).length === 0) {
			return;
		}

		// DEV-MODUS: IKKE kall CG, bare returner defaults raskt
		me.log('DEV getStatuses: returning stubbed values, no HTTP call');

		for (var key in me.statusCallbacks) {
			if (!me.statusCallbacks.hasOwnProperty(key)) continue;

			var split = key.split('_');
			var type = split[0];

			var fallback;

			if (type === 'light') {
				fallback = false; // av
			} else if (type === 'dimmable-light') {
				fallback = typeof me.statusCallbacks[key]['prevvalue'] !== 'undefined'
					? me.statusCallbacks[key]['prevvalue']
					: 50; // midt på treet
			} else if (type === 'temp' || type === 'targettemperature') {
				fallback = 20; // 20°C
			} else if (type === 'heatingcoolingstate' || type === 'targetheatingcoolingstate') {
				fallback = 0; // off
			} else {
				fallback = 0;
			}

			try {
				me.statusCallbacks[key]['callback'](null, fallback);
			} catch (e) {
				me.log('Error calling status callback for ' + key + ': ' + e.message);
			}
		}

		me.statusCallbacks = {};
	},


	getTempFromString: function(string) {
		// Eksempel på string: '.../>21.5°C'
		var find1 = "/>";
		var pos1 = string.indexOf(find1);
		var pos2 = string.indexOf("\u00b0C");

		if (pos1 === -1 || pos2 === -1 || pos2 <= pos1) {
			this.log('getTempFromString: unexpected format:', string);
			return 20; // fallback
		}

		var from = pos1 + find1.length;
		var to = pos2 - from;
		var value = string.substr(from, to).trim();
		var num = parseFloat(value);

		if (isNaN(num)) {
			this.log('getTempFromString: could not parse number from:', value);
			return 20;
		}

		return num;
	},

	getTargetTempFromString: function(string) {
		// Eksempel på string: 'Heating setpoint 1 - 22.0°C'
		var find1 = "Heating setpoint 1 - ";
		var pos1 = string.indexOf(find1);
		var pos2 = string.indexOf("\u00b0C");

		if (pos1 === -1 || pos2 === -1 || pos2 <= pos1) {
			this.log('getTargetTempFromString: unexpected format:', string);
			return 20; // fallback
		}

		var from = pos1 + find1.length;
		var to = pos2 - from;
		var value = string.substr(from, to).trim();
		var num = parseFloat(value);

		if (isNaN(num)) {
			this.log('getTargetTempFromString: could not parse number from:', value);
			return 20;
		}

		return num;
	},


}

function CGAccessory(log,url,config,sh) {

	this.log = log;
	this.name = config['name'];
	this.type = config['type'];
	this.paramid = config['paramid'];
	this.postUrl = url + '/do.php?command=do';
	this.thermoUrl = url + '/index.php?command=paramfunction'
	this.updatingBrightness = false;
	this.brightness = 0;
	this.sh = sh;
}

CGAccessory.prototype = {

	getSwitchOnCharacteristic: function (callback) {
		this.sh.statusCallbacks['light_' + this.paramid] = {'callback':callback};
		clearTimeout(this.sh.statusTimeout);
		this.sh.statusTimeout = setTimeout(this.sh.getStatuses.bind(this.sh),50);
		return;
	},

	setSwitchOnCharacteristic: function (on, callback) {
		const me = this;
		if(me.updatingBrightness) {
			me.log("canceling ON event cause brightness is being updated");
			return callback();
		}
		me.log('setting switch ' + me.paramid + ' stauts: ' + on);
		var body = 'param=' + me.paramid + '&st=' + (on ? '1' : '0');
		request({
			url: me.postUrl,
			headers : {
				"Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
				"Cookie" : me.sh.cookie
			},
			body: body,
			method: 'POST',

		},
		function (error, response) {
			if (error) {
				me.log('STATUS: ',response);
				me.log(error.message);
				return callback(error);
			}
			return callback();
		});
	},

	getSwitchBrightness: function(callback) {
		this.sh.statusCallbacks['dimmable-light_' + this.paramid] = {'callback':callback,'prevvalue':this.brightness};
		clearTimeout(this.sh.statusTimeout);
		this.sh.statusTimeout = setTimeout(this.sh.getStatuses.bind(this.sh),50);
		return;
	},

	setSwitchBrightness: function(brightness,callback) {
		const me = this;
		me.updatingBrightness = true;
		me.log("setting brightness: " + brightness);

		request({
			url: me.postUrl,
			headers : {
				"Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
				"Cookie" : me.sh.cookie
			},
			body: 'param=' + me.paramid + '&st=' + brightness,
			method: 'POST',

		},
		function (error, response) {
			if (error) {
				me.log('STATUS: ',response);
				me.log(error.message);
				return callback(error);
			}
			me.brightness = brightness;
			me.updatingBrightness = false;
			return callback();
		});


	},

	//Temperature sensor
	/*getTemperature: function(callback) {
		this.sh.statusCallbacks['temp_' + this.paramid] = {'callback':callback};
		clearTimeout(this.sh.statusTimeout);
		this.sh.statusTimeout = setTimeout(this.sh.getStatuses.bind(this.sh),50);
		return;
	},*/

	// --------------------------------------
	//		Thermostat service
	// --------------------------------------

	//Only supports heating at the moment
	getCurrentHeatingCoolingState: function(callback) {
		this.log("gettign current heating/cooling state");
		this.sh.statusCallbacks['heatingcoolingstate_' + this.paramid] = {'callback' : callback};
		clearTimeout(this.sh.statusTimeout);
		this.sh.statusTimeout = setTimeout(this.sh.getStatuses.bind(this.sh),50);
		return;
	},

	getTargetHeatingCoolingState: function(callback) {
		this.log("getting target heating/cooling state");
		this.sh.statusCallbacks['targetheatingcoolingstate_' + this.paramid] = {'callback' : callback};
		clearTimeout(this.sh.statusTimeout);
		this.sh.statusTimeout = setTimeout(this.sh.getStatuses.bind(this.sh),50);
		return;
	},

	//Not in use
	setTargetHeatingCoolingState: function(value, callback) {
		this.log("setting target heating/cooling state to" + value);
		return callback();
	},

	getCurrentTemperature: function(callback) {
		this.log("getting current temperature");
		this.sh.statusCallbacks['temp_' + this.paramid] = {'callback':callback};
		clearTimeout(this.sh.statusTimeout);
		this.sh.statusTimeout = setTimeout(this.sh.getStatuses.bind(this.sh),50);
		return;
	},

	getTargetTemperature: function(callback) {
		this.log("getting target temperature");
		this.sh.statusCallbacks['targettemperature_' + this.paramid] = {'callback' : callback};
		clearTimeout(this.sh.statusTimeout);
		this.sh.statusTimeout = setTimeout(this.sh.getStatuses.bind(this.sh),50);
		return;
	},

	setTargetTemperature: function(value,callback) {
		const me = this;
		this.log("setting target temperature to " + value);
		var param = 'idFunction=' + this.paramid + '&manual_heat=' + value + '&t1_heat=' + value + '&t2_heat=' + value + '&t3_heat=' + value + '&manual_heat_offset=0&t1_heat_offset=0&t2_heat_offset=0&t3_heat_offset=0';
		var body = 'param=' + encodeURIComponent(param);
		request({
			url: me.thermoUrl,
			headers : {
				"Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
				"Cookie" : me.sh.cookie
			},
			body: body,
			method: 'POST',

		},
		function (error, response) {
			if (error) {
				me.log('STATUS: ',response);
				me.log(error.message);
				return callback(error);
			}
			me.log(response.body);
			return callback();
		});
	},

	getTemperatureDisplayUnits: function(callback) {
		this.log("getting temperature display units");
		return callback(null,0)
	},

	setTemperatureDisplayUnits: function(value, callback) {
		this.log("setting temperature display units to " + value);
		return callback();
	},




	getServices: function () {
		var me = this;
		var services = [];

		// Obligatory Accessory Information
		let informationService = new Service.AccessoryInformation();
		informationService
			.setCharacteristic(Characteristic.Manufacturer, "CG Smarthouse")
			.setCharacteristic(Characteristic.Model, "CG Accessory")
			.setCharacteristic(Characteristic.SerialNumber, "CG-" + (me.paramid || "0000"));

		services.push(informationService);

		// 🚫 Midlertidig: vi skipper thermostat og temperature-sensor helt
		if (me.type === "thermostat" || me.type === "temperature-sensor") {
			me.log("WARNING: type '" + me.type + "' er midlertidig deaktivert i getServices (dev-modus).");
			// Vi returnerer bare AccessoryInformation, så HomeKit ikke ser noe “halvveis” service
			return services;
		}

		let switchService;

		// 💡 Lys
		if (me.type === 'dimmable-light' || me.type === 'light') {
			switchService = new Service.Lightbulb(me.name);

		// 🔘 “Stateless” switch – vi behandler den bare som en vanlig switch her
		} else if (me.type === 'stateless-switch') {
			switchService = new Service.Switch(me.name);

		// 🔌 Default switch
		} else {
			switchService = new Service.Switch(me.name);
		}

		// On-characteristic – dette er obligatorisk og helt standard
		switchService
			.getCharacteristic(Characteristic.On)
			.on('get', this.getSwitchOnCharacteristic.bind(this))
			.on('set', this.setSwitchOnCharacteristic.bind(this));

		// Brightness for dimmable-light
		if (me.type === 'dimmable-light') {
			switchService
				.getCharacteristic(Characteristic.Brightness)
				// ingen minValue her – 0–100 er standard og HAP-trygt
				.on('get', this.getSwitchBrightness.bind(this))
				.on('set', this.setSwitchBrightness.bind(this));
		}

		services.push(switchService);

		return services;
	}

};