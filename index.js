var Service, Characteristic;
const request = require('request');


/* CONFIG
"platforms": [
	{
		"platform" : "CG Smarthouse",
		"name" : "CG Smarthouse",
		"username" : "admin",
		"password" : "admin",
		"url" : "http://192.168.3.135",
		"accessories" : [
			{
				"paramid" : 1234,
				"type" : "switch",
				"name" : "Bathroom light"
			}
		]
	}    
]
*/

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
		for(var i=0; i < foundAccessories.length; i++) {
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
		var statusUrlParams = "/refresh.php?";
		var counter = 0;

		//obj key kontains type and paramid seperated by underscore, example 'light_1234'
		for(var key in me.statusCallbacks) {
			var split = key.split('_');
			
			statusUrlParams += 'param[' + counter + '][]=switch' + split[1] + '&param[' + counter + '][]=' + split[1] + '&param[' + counter + '][]=switch&'
			
			counter++;
		}

		request({
			url: me.config.url + statusUrlParams,
			method: 'GET',
			headers: {
				"Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
				"Cookie" : me.cookie
			}
		}, 
		function (error, response, body) {
			//TODO: Check if new login is needed
			//me.log("body:" + body);


			if (error) {
				me.log('STATUS: ',response);
				me.log(error.message);
				return next(error);
			} else {
				var json = JSON.parse(body);
				me.log(json);
				for(var key in me.statusCallbacks) {
					var split = key.split('_');
					var type = split[0];
					var paramid = split[1];

					var state = json['switch' + paramid][1];
					me.log("key = " + key);
					if(type == 'light') { //Light and heating/cooling state have the value in the same location
						state = state != 0;
						me.statusCallbacks[key]['callback'](null,state);
					} else if(type == 'dimmable-light') {
						if(state == 0) state = me.statusCallbacks[key]['prevvalue'];
						me.statusCallbacks[key]['callback'](null,state);
					} else if(type == 'temp') {
						var string = json['switch' + paramid][5].troom_value;
						state = me.getTempFromString(string);
						me.statusCallbacks[key]['callback'](null,state);
					} else if(type == 'heatingcoolingstate' || type == 'targetheatingcoolingstate') {
						state = state ? 1 : 0; //Heating cooling uses 1/0 instead of true/false
						me.statusCallbacks[key]['callback'](null,state);
					} else if(type == 'targettemperature') {
						var string =  json['switch' + paramid][5].temp_setpoint;
						state = me.getTargetTempFromString(string);
						me.statusCallbacks[key]['callback'](null,state);
					}
					me.log("status of " + key + " is " + state);
				}
			}
			me.statusCallbacks = {}; //Reset the callbacks
		});
	},

	getTempFromString: function(string) {
		var find1 = "/>";
		var pos1 = string.indexOf(find1);
		var pos2 = string.indexOf("\u00b0C");
		var from = pos1+find1.length;
		var to = pos2 - from;
		return string.substr(from,to);
	},

	getTargetTempFromString: function(string) {
		var find1 = "Heating setpoint 1 - ";
		var pos1 = string.indexOf(find1);
		var pos2 = string.indexOf("\u00b0C");
		var from = pos1+find1.length;
		var to = pos2 - from;
		return string.substr(from,to);
	}


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
		let informationService = new Service.AccessoryInformation();
		informationService
		.setCharacteristic(Characteristic.Manufacturer, "My switch manufacturer")
		.setCharacteristic(Characteristic.Model, "My switch model")
		.setCharacteristic(Characteristic.SerialNumber, "123-456-789");

		services.push(informationService);

		if(me.type == "thermostat") {

			var thermostatService = new Service.Thermostat(me.name);
			thermostatService
				.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
				.on('get',this.getCurrentHeatingCoolingState.bind(this));

			thermostatService
				.getCharacteristic(Characteristic.TargetHeatingCoolingState)
				.on('get', this.getTargetHeatingCoolingState.bind(this))
				.on('set', this.setTargetHeatingCoolingState.bind(this))
				.setProps({ //Only heating supported at the moment
					maxValue: 1,
					minValue: 1,
					validValues: [1]
				});

			thermostatService
				.getCharacteristic(Characteristic.CurrentTemperature)
				.on('get', this.getCurrentTemperature.bind(this))
				.setProps({
					minValue: -50,
					maxValue: 50,
					minStep: 0.5
				});

			thermostatService
				.getCharacteristic(Characteristic.TargetTemperature)
				.on('get', this.getTargetTemperature.bind(this))
				.on('set', this.setTargetTemperature.bind(this));

			thermostatService
				.getCharacteristic(Characteristic.TemperatureDisplayUnits)
				.on('get', this.getTemperatureDisplayUnits.bind(this))
				.on('set', this.setTemperatureDisplayUnits.bind(this));

			services.push(thermostatService);

		} else if(me.type == "temperature-sensor") {
			var temperatureService = new Service.TemperatureSensor(me.name);
			temperatureService
				.getCharacteristic(Characteristic.CurrentTemperature)
				.on('get', this.getCurrentTemperature.bind(this))
				.setProps({
					minValue: -50,
					maxValue: 50,
					minStep: 0.1
				});
			services.push(temperatureService);
		} else {
			if(me.type == 'dimmable-light' || me.type == 'light') {
				var switchService = new Service.Lightbulb(me.name);
			} else if(me.type == 'stateless-switch') {
				var switchService = new Service.Switch(me.name,true);
			} else {
				var switchService = new Service.Switch(me.name);
			}

			switchService
			.getCharacteristic(Characteristic.On)
			.on('get', this.getSwitchOnCharacteristic.bind(this))
			.on('set', this.setSwitchOnCharacteristic.bind(this));

			if(me.type == 'dimmable-light') {
				var brightnessChar = new Characteristic.Brightness;
				switchService.getCharacteristic(Characteristic.Brightness)
				.setProps({
					minValue: 10
				})
				.on('get', this.getSwitchBrightness.bind(this))
				.on('set', this.setSwitchBrightness.bind(this));
			}
			services.push(switchService);
		}




		return services;
	}

};