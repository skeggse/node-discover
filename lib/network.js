/**
 * Network
 *
 * Methods:
 *   send
 *
 * Events:
 *   error
 *   message
 *   user-defined
 */

var EventEmitter = require('eventemitter2').EventEmitter2;
var crypto = require('crypto');
var _ = require('underscore');
var util = require('util');

var streams = require('./streams');

var procUuid = crypto.randomBytes(16).toString('hex');
var hostName = require('os').hostname();

_.mixin({
  options: function(self, options, defaults) {
    if (options)
      _.extend(self, _.defaults(_.pick(options, _.keys(defaults)), defaults));
    else
      _.extend(self, defaults);
  }
});

/**
 * The default options for Network.
 *
 * @type {Object.<string, *>}
 */
var defaults = {
  key: null,
  ignoreDataErrors: true,
  ignore: 'self'
};

/**
 * The Network constructor, which creates an abstraction around a network-wide
 * broadcast point. Functions with either broadcast or multicast.
 *
 * @param {Object.<string, *>=} options The options to construct a Network.
 * @constructor
 * @extends EventEmitter
 */
var Network = function Network(options) {
  if (!(this instanceof Network))
    return new Network(options);

  EventEmitter.call(this);

  // populate this with options
  _.options(this, options, defaults);

  var stream = [];
  stream.push(this._output = new streams.JSONEncodeStream(options));
  if (this.key)
    stream.push(new streams.EncryptStream(options));
  stream.push(new streams.WrapStream(options));
  stream.push(this._resource = new streams.UDPStream(options));
  stream.push(new streams.UnwrapStream(options));
  if (this.key)
    stream.push(new streams.DecryptStream(options));
  stream.push(this._input = new streams.JSONDecodeStream(options));

  var error = this.emit.bind(this, 'error');

  for (var i = 0; i < stream.length; i++) {
    if (i > 0)
      stream[i - 1].pipe(stream[i]);
    stream[i].on('error', error);
  }

  this.instanceUuid = crypto.randomBytes(16).toString('hex');
  this.processUuid = procUuid;

  this._resource.on('listening', this.emit.bind(this, 'listening'));
  this._input.on('data', parse.bind(this));
  this._input.on('end', this.emit.bind(this, 'close'));
};

// Network inherits from EventEmitter
util.inherits(Network, EventEmitter);

/**
 * Cleanly leaves the network.
 *
 * TODO: needs to emit a leave event
 */
Network.prototype.close = function() {
  this._output.end();
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
    pid: this.processUuid,
    iid: this.instanceUuid,
    hostName: hostName
  };

  this._output.write(obj);
};

var ignore = function(self, obj) {
  if (self.ignore === 'self')
    return obj.iid === self.instanceUuid;
  if (self.ignore === 'process')
    return obj.pid === self.processUuid;
  return false;
};

/**
 * Receives incoming objects from the network, decrypting and decoding
 * according to the Network's configuration.
 *
 * @param {!Object} obj The incoming object.
 * @param {!Object} rinfo The remote address information.
 * @this {Network}
 * @private
 */
var parse = function(obj) {
  if (!ignore(this, obj)) {
    if (obj.event && obj.data)
      // TODO: ignore reserved events
      this.emit(obj.event, obj.data, obj, obj._info);
    else
      this.emit('message', obj, obj._info);
  }
};

module.exports = Network;
