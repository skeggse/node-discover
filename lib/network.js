var dgram = require('dgram');
var crypto = require('crypto');
var os = require('os');
var EventEmitter = require('eventemitter2').EventEmitter2;
var _ = require('underscore');
var util = require('util');
var hat = require('hat');

var encrypt = function(str, key) {
  var buf = [];
  var cipher = crypto.createCipher('aes256', key);

  buf.push(cipher.update(str, 'utf8', 'binary'));
  buf.push(cipher.final('binary'));

  return buf.join('');
};

var decrypt = function(str, key) {
  var buf = [];
  var decipher = crypto.createDecipher('aes256', key);

  buf.push(decipher.update(str, 'binary', 'utf8'));
  buf.push(decipher.final('utf8'));

  return buf.join('');
};

var procUuid = hat();
var hostName = os.hostname();

var defaults = {
  address: '0.0.0.0',
  port: 12345,
  broadcast: null,
  multicast: null,
  multicastTTL: 1,
  key: null
};

var Network = function Network(options) {
  EventEmitter.call(this);

  var self = this, options = options || {};

  // populate self with options
  _.extend(self, _.defaults(_.pick(options, _.keys(defaults)), defaults));

  self.socket = dgram.createSocket('udp4');
  self.socket.bind(self.port, self.address);

  process.nextTick(function() {
    if (self.multicast) {
      self.socket.addMembership(self.multicast);
      self.socket.setMulticastTTL(self.multicastTTL);

      self.destination = self.multicast;
    } else {
      // default to using broadcast if multicast address is not specified.
      self.socket.setBroadcast(true);

      // TODO: get the default broadcast address from os.networkInterfaces() (not currently returned)
      self.destination = self.broadcast || "255.255.255.255";
    }
  });

  self.instanceUuid = hat();
  self.processUuid = procUuid;

  self.socket.on("message", function(data, rinfo) {
    self.decode(data, function(err, obj) {
      if (err) {
        self.emit("error", err);
      } else if (obj.pid == procUuid) {
        return false;
      } else if (obj.event && obj.data) {
        self.emit(obj.event, obj.data, obj, rinfo);
      } else {
        self.emit("message", obj)
      }
    });
  });
};
util.inherits(Network, EventEmitter);

Network.prototype.send = function(event) {
  var self = this;

  var obj = {
    event: event,
    pid: procUuid,
    iid: self.instanceUuid,
    hostName: hostName
  };

  if (arguments.length === 2) {
    obj.data = arguments[1];
  } else {
    obj.data = _.rest(arguments);
  }

  self.encode(obj, function(err, contents) {
    if (err) {
      return false;
    }

    var msg = new Buffer(contents);

    self.socket.send(msg, 0, msg.length, self.port, self.destination);
  });
};

Network.prototype.encode = function(data, callback) {
  var self = this;

  try {
    data = self.key ? encrypt(JSON.stringify(data), self.key) : JSON.stringify(data);
  } catch (e) {
    return callback(e, null);
  }
  callback(null, data);
};

Network.prototype.decode = function(data, callback) {
  var self = this;

  try {
    data = JSON.parse(self.key ? decrypt(data.toString(), self.key) : data);
  } catch (e) {
    return callback(e, null);
  }
  callback(null, data);
};

module.exports = Network;
