/**
 * Network
 *
 * Methods:
 *   send
 *   encode
 *   decode
 *
 * Events:
 *   error
 *   message
 *   user-defined
 */

var dgram = require('dgram');
var crypto = require('crypto');
var os = require('os');
var EventEmitter = require('eventemitter2').EventEmitter2;
var _ = require('underscore');
var util = require('util');
var hat = require('hat');

/**
 * A helper function which encrypts the raw data with the provided key.
 *
 * @param {Buffer} data The plaintext input.
 * @param {string|Buffer} key The key, a binary-encoded string or a Buffer.
 * @return {Buffer} The enciphered result of the encryption.
 */
var encrypt = function(data, key) {
  var cipher = crypto.createCipher('aes256', key);

  var buf = [cipher.update(data), cipher.final()];
  return Buffer.concat(buf, buf[0].length + buf[1].length);
};

/**
 * A helper function which decrypts the raw data with the provided key.
 *
 * @param {Buffer} data The ciphertext input.
 * @param {string|Buffer} key The key, a binary-encoded string or a Buffer.
 * @return {Buffer} The deciphered result of the decryption.
 */
var decrypt = function(data, key) {
  var decipher = crypto.createDecipher('aes256', key);

  var buf = [decipher.update(data), decipher.final()];
  return Buffer.concat(buf, buf[0].length + buf[1].length);
};

var procUuid = hat();
var hostName = os.hostname();

/**
 * The default options for Network.
 *
 * @type {Object<string, *>}
 */
var defaults = {
  address: '0.0.0.0',
  port: 12345,
  broadcast: null,
  multicast: null,
  multicastTTL: 1,
  key: null
};

/**
 * The Network constructor, which creates an abstraction around a network-wide
 * broadcast point. Functions with either broadcast or multicast.
 *
 * @param {Object<string, *>=} options The options to construct a Network.
 * @constructor
 * @extends EventEmitter
 */
var Network = function Network(options) {
  if (!(this instanceof Network))
    return new Network(options);

  EventEmitter.call(this);

  // populate this with options
  _.extend(this, _.defaults(_.pick(options || {}, _.keys(defaults)), defaults));

  this.socket = dgram.createSocket('udp4');
  this.socket.bind(this.port, this.address, setup.bind(this));

  this.instanceUuid = hat();
  this.processUuid = procUuid;

  this.socket.on('message', parse.bind(this));
};

// Network inherits from EventEmitter
util.inherits(Network, EventEmitter);

/**
 * Sets up the Network once the socket has been bound.
 *
 * @this {Network}
 * @private
 */
var setup = function() {
  if (this.multicast) {
    this.socket.addMembership(this.multicast);
    this.socket.setMulticastTTL(this.multicastTTL);

    this.destination = this.multicast;
  } else {
    // default to using broadcast if multicast address is not specified.
    this.socket.setBroadcast(true);

    // TODO: get the default broadcast address from os.networkInterfaces() (not currently returned)
    this.destination = this.broadcast || '255.255.255.255';
  }
};

/**
 * Broadcasts data to the network represented by the Network, encrypting and
 * encoding according to the Network's configuration.
 *
 * @param {!string} event The name of the event to broadcast.
 * @param {?Object} data The data to broadcast.
 */
Network.prototype.send = function(event, data) {
  var self = this;

  var obj = {
    data: data,
    event: event,
    pid: procUuid,
    iid: this.instanceUuid,
    hostName: hostName
  };

  this.encode(obj, function(err, msg) {
    if (err)
      return self.emit('error', err);

    self.socket.send(msg, 0, msg.length, self.port, self.destination);
  });
};

/**
 * Receives incoming data from the network, decrypting and decoding according
 * to the Network's configuration.
 *
 * @param {!Buffer} data The incoming data.
 * @param {!Object} rinfo The remote address information.
 */
var parse = function(data, rinfo) {
  var self = this;

  this.decode(data, function(err, obj) {
    if (err)
      return self.emit('error', err);
    if (obj.iid !== self.instanceUuid) {
      if (obj.event && obj.data)
        // TODO: ignore reserved events
        self.emit(obj.event, obj.data, obj, rinfo);
      else
        self.emit('message', obj);
    }
  });
};

/**
 * More or less a wrapper around JSON.stringify for node-style error handling,
 * as well as encryption if the Network has an encryption key.
 *
 * @param {!Object} data The data to encode.
 * @param {function(?Error, ?Buffer)} callback Function to execute with the
 *   encoded buffer.
 */
Network.prototype.encode = function(data, callback) {
  try {
    data = new Buffer(JSON.stringify(data), 'utf-8');
  } catch (e) {
    return callback(e, null);
  }
  if (this.key) {
    data = encrypt(data, this.key);
  }
  callback(null, data);
};

/**
 * Reverses the network.encode process, wraps JSON.parse and handles errors
 * node-style, as well as decrypting the data if the Network has an encryption
 * key.
 *
 * @param {!Buffer} data THe data to decode.
 * @param {function(?Error, ?Object)} callback Function to execute with the
 *   decoded object.
 */
Network.prototype.decode = function(data, callback) {
  if (this.key)
    data = decrypt(data, this.key);
  try {
    data = JSON.parse(data.toString('utf-8'));
  } catch (e) {
    return callback(e, null);
  }
  callback(null, data);
};

module.exports = Network;
