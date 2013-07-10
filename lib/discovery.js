/**
 * Node Discovery
 *
 * Properties:
 *   nodes
 *
 * Methods:
 *   promote
 *   demote
 *   join
 *   leave
 *   advertise
 *   send
 *   start
 *   stop
 *
 * Events:
 *   promotion
 *   demotion
 *   added
 *   removed
 *   master
 *
 * checkInterval should be greater than hello interval to avoid wasting cpu
 * nodeTimeout must be greater than checkInterval
 * masterTimeout must be greater than nodeTimeout
 */

var Network = require('./network');
var EventEmitter = require('eventemitter2').EventEmitter2;
var util = require('util');
var _ = require('underscore');

var reservedEvents = {'promotion': true, 'demotion': true, 'added': true, 'removed': true, 'master': true, 'hello': true};

/**
 * The default options for Discovery.
 *
 * @type {Object.<string, *>}
 */
var defaults = {
  helloInterval: 1000,
  checkInterval: 2000,
  nodeTimeout: 2000,
  masterTimeout: 2000,
  address: '0.0.0.0',
  port: 12345,
  broadcast: null,
  multicast: null,
  multicastTTL: null,
  key: null,
  mastersRequired: 1
};

/**
 * The Discovery constructor, which enables the discovery of other Discovery
 * network-wide, and includes advertisement and automatic master selection.
 *
 * @param {Object.<string, *>=} options The options to construct a Discovery.
 * @constructor
 * @extends EventEmitter
 */
var Discovery = function Discovery(options) {
  if (!(this instanceof Discovery))
    return new Discovery(options);

  EventEmitter.call(this);

  var self = this, checkId, helloId, running = false;

  var settings = _.defaults(options || {}, defaults);
  settings.weight = settings.weight || Math.random();

  if (settings.nodeTimeout < settings.checkInterval)
    throw new Error("nodeTimeout must be greater than or equal to checkInterval.");

  if (settings.masterTimeout < settings.nodeTimeout)
    throw new Error("masterTimeout must be greater than or equal to nodeTimeout.");

  // network filters out unnecessary settings
  this.broadcast = new Network(settings);

  // this is the object that gets broadcast with each hello packet.
  this.me = {
    isMaster: false,
    isMasterEligible: true,
    weight: settings.weight,
    address: '127.0.0.1' // TODO: get the real local address?
  };

  this.nodes = {};
  this.channels = {};

  /**
   * When receiving hello messages we need things to happen in the following order:
   *  - make sure the node is in the node list
   *  - if hello is from new node, emit added
   *  - if hello is from new master and we are master, demote
   *  - if hello is from new master emit master
   *
   * need to be careful not to over-write the old node object before we have information
   * about the old instance to determine if node was previously a master.
   */
  this.broadcast.on('hello', function(data, obj, rinfo) {
    data.lastSeen = Date.now();
    data.address = rinfo.address;
    data.hostName = obj.hostName;
    data.port = rinfo.port;
    data.id = obj.iid;
    var isNew = !self.nodes[obj.iid];
    var wasMaster = null;

    if (!isNew)
      wasMaster = !!self.nodes[obj.iid].isMaster;

    var node = self.nodes[obj.iid] = self.nodes[obj.iid] || {};

    _.extend(node, data);

    if (isNew)
      // new node found
      self.emit('added', node, obj, rinfo);

    if (node.isMaster) {
      // if we have this node and it was not previously a master then it is a new master node
      if (isNew || !wasMaster) {
        // this is a new master
        // count up how many masters we have now
        var masterCount = 0;
        for (var uuid in self.nodes)
          if (self.nodes[uuid].isMaster)
            masterCount++;

        if (self.me.isMaster && masterCount > settings.mastersRequired)
          self.demote();

        self.emit('master', node, obj, rinfo);
      }
    }
  });

  // TODO: can this be optimized?
  this.start = function() {
    if (running)
      return false;
    running = true;

    checkId = setInterval(function() {
      var node = null, mastersFound = 0, higherWeightFound = false, removed;

      var weights = [];

      for (var processUuid in self.nodes) {
        node = self.nodes[processUuid];
        removed = false;

        if (Date.now() - node.lastSeen > settings.nodeTimeout) {
          // we haven't seen the node recently

          // if node is a master and has not timed out yet based on the masterTimeout then fake it being found
          if (node.isMaster && (Date.now() - node.lastSeen) < settings.masterTimeout)
            mastersFound++;

          // delete the node from our nodes list
          delete self.nodes[processUuid]
          removed = true;
          self.emit('removed', node);
        } else if (node.isMaster)
          mastersFound++;

        if (node.weight > self.me.weight && node.isMasterEligible && !removed)
          higherWeightFound = true;
      }

      if (!self.me.isMaster && mastersFound < settings.mastersRequired && self.me.isMasterEligible && !higherWeightFound)
        // no masters found out of all our nodes, become one.
        self.promote();

    }, settings.checkInterval);

    // send hello every helloInterval
    helloId = setInterval(function() {
      self.broadcast.send('hello', self.me)
    }, settings.helloInterval);
  };

  this.stop = function() {
    if (!running)
      return false;

    clearInterval(checkId);
    clearInterval(helloId);
  };

  this.start();
};

// Discovery inherits from EventEmitter
util.inherits(Discovery, EventEmitter);

/**
 * Promotes this Discovery instance to master.
 */
Discovery.prototype.promote = function() {
  this.me.isMasterEligible = true;
  this.me.isMaster = true;
  this.emit('promotion', this.me);
  this.hello();
};

/**
 * Demotes this Discovery instance from master.
 */
Discovery.prototype.demote = function(permanent) {
  this.me.isMasterEligible = !permanent;
  this.me.isMaster = false;
  this.emit('demotion', this.me);
  this.hello();
};

/**
 * Broadcasts a 'hello' message.
 */
Discovery.prototype.hello = function() {
  this.broadcast.send('hello', this.me);
};

/**
 * Sets the advertisement data.
 *
 * @param {!Object.<string, *>} obj The advertisement data.
 */
Discovery.prototype.advertise = function(obj) {
  this.me.info = obj;
};

/**
 * Subscribes to the specified channel. The channel name cannot be a reserved
 * name.
 *
 * This method will throw an error if the channel is reserved.
 *
 * @param {!string} channel The channel to subscribe to.
 * @param {function(obj)} fn The callback function.
 */
Discovery.prototype.join = function(channel, fn) {
  var self = this;

  if (reservedEvents[channel])
    throw new TypeError('that channel is a reserved channel');

  if (fn)
    this.on(channel, fn);

  if (!this.channels[channel]) {
    this.broadcast.on(channel, function(obj) {
      self.emit(channel, obj);
    });

    this.channels[channel] = true;
  }
};

/**
 * Unsubscribes from the specified channel. The channel name cannot be a
 * reserved name.
 *
 * This method will remove all listeners for the given channel!
 *
 * @param {!string} channel The channel to unsubscribe from.
 */
Discovery.prototype.leave = function(channel) {
  if (!reservedEvents[channel]) {
    this.removeAllListeners(channel);
    this.broadcast.removeAllListeners(channel);

    delete this.channels[channel];
  }
};

/**
 * Sends the object to the specified channel. The channel name cannot be a
 * reserved name.
 *
 * This method will throw an error if the channel is reserved.
 *
 * @param {!string} channel The channel to send on.
 * @param {!Object.<string, *>} obj The object to broadcast.
 */
Discovery.prototype.send = function(channel, obj) {
  if (reservedEvents[channel])
    throw new TypeError('that channel is a reserved channel');

  this.broadcast.send(channel, obj);
};

module.exports = Discovery;
