var Service, Characteristic;
const request = require('request');


/* CONFIG
  "platforms": [
      {
        "platform" : "CG Smarthouse",
        "name" : "CG Smarthouse",
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
    var validAccessories = ['light','dimmable-light','switch','stateless-switch'];
    return validAccessories.includes(type);
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
    }, 
    function (error, response, body) {
      if (error) {
        me.log('STATUS: ',response);
        me.log(error.message);
        return next(error);
      } else {
        var json = JSON.parse(body);
        for(var key in me.statusCallbacks) {
          var split = key.split('_');
          var state = json['switch' + split[1]][1];
          if(split[0] == 'light') {
            state = state != 0;
            me.statusCallbacks[key]['callback'](null,state);
          } else if(split[0] == 'dimmable-light') {
            if(state == 0) state = me.statusCallbacks[key]['prevvalue'];
            me.statusCallbacks[key]['callback'](null,state);
          }
          me.log("status of " + key + " is " + state);
        }
      }
      me.statusCallbacks = {}; //Reset the callbacks
    });

  }
}

function CGAccessory(log,url,config,sh) {
  
  this.log = log;
  this.name = config['name'];
  this.type = config['type'];
  this.paramid = config['paramid'];
  this.postUrl = url + '/do.php?command=do';
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
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
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
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
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

  getServices: function () {
    var me = this;
    let informationService = new Service.AccessoryInformation();
    informationService
      .setCharacteristic(Characteristic.Manufacturer, "My switch manufacturer")
      .setCharacteristic(Characteristic.Model, "My switch model")
      .setCharacteristic(Characteristic.SerialNumber, "123-456-789");
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
   
 
    this.informationService = informationService;
    this.switchService = switchService;
    return [informationService, switchService];
  }

};