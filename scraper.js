const request = require('request');
var HTMLParser = require('node-html-parser');
var prompt = require('prompt');

function Scraper() {

	this.username = '';
	this.password = '';
	this.lightFunctionId = 'fn__lgt002';
	this.dimmableFunctionId = 'fn__lgt004';
	this.url = '';
	this.cookie = '';
	this.configJson = {};
	this.configJsonAccessories = [];
	this.start = 0;

}

Scraper.prototype = {

	getInput: function() {

		var me = this;
		
		var schema = {
			properties: {
				url: {
					description: 'SH web url',
					message: 'SH web url',
					required: true
				},
				username: {
					description: 'SH web username',
					message: 'username',
					required: true
				},
				password: {
					description: 'SH web password',
					message: 'password',
					required: true
				}
			}
		};

		console.log("\nWelcome to the Carlo Gavazzi Smarthome scraper and config tool!");
		console.log("This tool will scrape your SH web server for accessories and generate a full json config you can put in your homebridge config.json file")
		console.log("Please provide the necessary credentials.\n");

		prompt.message = '';
		// Start the prompt to read user input.
		prompt.start();

		// Prompt and get user input then display those data in console.
		prompt.get(schema, function (err, result) {
		    if (err) {
		        console.log(err);
		        return 1;
		    } else {
		        // Get user input from result object.
		        me.url = result.url;
		        me.username = result.username;
		        me.password = result.password;
		        me.configJson.platform = "CG Smarthouse";
		        me.configJson.name = "CG Smarthouse";
		        me.configJson.username = me.username;
		        me.configJson.password = me.password;
		        me.configJson.url = me.url;
		        me.startScraping();
		    }
		});
	},

	startScraping: function() {
		var me = this;
		me.logIn(function() {
			var types = [{'type' : 'light', 'id' : 'fn__lgt002'},{'type' : 'dimmable-light', 'id' : 'fn__lgt004'}]
			me.getAccecories('light','fn__lgt002',function() {
				me.start = 0;
				me.getAccecories('dimmable-light','fn__lgt004',function() {
					me.start = 0;
					me.getAccecories('thermostat','fn__tempzone001',function() {
						me.configJson.accessories = me.configJsonAccessories;
						console.log(JSON.stringify(me.configJson,undefined,2));
					});
				});
			});
			
		});
	},

	logIn: function(callback) {
		var me = this;
		request({
	        url: me.url + '/index.php',
	        method: 'POST',
	        body: 'username=' + me.username + '&password=' + me.password + '&lng=en-GB&rememberme=1&macadd=1234&submit=Login',
	        headers: {
	        	"Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
	        }
	    }, 
	    function (error, response, body) {
	    	if(error) {
	    		console.log('Could not log in!');
	    		process.exit();
	    	} else {
	    		me.cookie = response.headers['set-cookie'];
	    		callback();
	    	}
	    });

	},

	getAccecories: function(accessoryType, accessoryTypeId,callback) {
		var me = this;
		request({
	        url: me.url + '/index.php?functionsh=json_list&lstart=' + me.start + '&part%5B%5D=' + accessoryTypeId,
	        method: 'GET',
	        headers: {
	        	"Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
	        	"Cookie" : me.cookie
	        }
	    }, 
	    function (error, response, body) {
	    	if(error) {
				console.log("error getting accecories")
			} else {
				var numberOfAccesories = me.parseAccessories(accessoryType,body);
				console.log("parsedAccessories: " + numberOfAccesories);
				if(numberOfAccesories > 0) {
					me.start += 10;
					me.getAccecories(accessoryType,accessoryTypeId,callback);
				} else {
					callback();
				}
			}

	    });
	},

	parseAccessories: function(accessoryType,body) {
		var me = this;
		var tree = HTMLParser.parse(body);
		var acc = new Array();

		tree.childNodes.forEach(function(element) {
			
			var paramId = element.childNodes[0].classNames[0];
			var name = element.querySelector('h2').rawText;
			var room = element.querySelector('.ui-body-inherit').rawText;

			me.configJsonAccessories.push({'name' : room + ' - ' + name.trim(), 'paramid' : parseInt(paramId), 'type' : accessoryType});

			acc.push(paramId);
			//console.log("\nELEMENT:\n",paramId,name);
		});
		
		return acc.length;
	}
}


var scraper = new Scraper();
scraper.getInput();