/**
 * Service Discovery
 *
 * Properties:
 *   services
 *
 * Methods:
 *   advertise
 *   need
 *   setup
 *
 * Events:
 *   ready
 *   notready
 *   master
 *   promotion
 *   demotion
 */

var Discovery = require('./discovery');
var EventEmitter = require('eventemitter2').EventEmitter2;
var util = require('util');
var _ = require('underscore');

/**
 * The default options for ServiceDiscovery.
 *
 * @type {Object.<string, *>}
 */
var defaults = {};

/**
 * Helper function to remove the specified element from the array.
 *
 * @param {!Array} array The array to remove from.
 * @param {?Object} element The element to remove.
 * @param {!boolean} all Whether to remove all occurrences of the element.
 */
var removeElement = function(array, element, all) {
  if (Array.isArray(array)) {
    var index = array.indexOf(element);
    if (~index) {
      array.splice(index, 1);
      if (all)
        removeElement(array, element, all);
      return true;
    }
  }
  return false;
};

/**
 * Handles the addition of a node to the service discovery scope.
 *
 * @this {ServiceDiscovery}
 * @param {!Object.<string, *>} node The node that was added.
 * @private
 */
var added = function(node) {
  var name = node.info && node.info.name;
  if (typeof name !== 'string')
    return;
  if (this.servicedeck[name])
    this.servicedeck[name].push(node);
  else
    this.servicedeck[name] = [node];
  if (this.servicehooks[name] && this.servicehooks[name].length)
    delegate.call(this, node, 0);
  else
    activate.call(this, node, this.servicedeck[name].length - 1);
};

/**
 * Handles the removal of a node from the service discovery scope.
 *
 * @this {ServiceDiscovery}
 * @param {!Object.<string, *>} node The node that was removed.
 * @private
 */
var removed = function(node) {
  var name = node.info && node.info.name;
  if (this.services[name] && removeElement(this.services[name], node) && this.needs[name] && !this.services[name].length)
    this.emit('notready');
  if (this.servicedeck[name])
    removeElement(this.servicedeck[name], node);
};

/**
 * Moves the specified node at the specified index from the service deck to the
 * active services object.
 *
 * @this {ServiceDiscovery}
 * @param {!Object.<string, *>} node The node to activate.
 * @private
 */
var activate = function(node, index) {
  var name = node.info.name;
  this.servicedeck[name].splice(index, 1);
  if (this.services[name])
    this.services[name].push(node);
  else
    this.services[name] = [node];
  this.emit('service', name, node);
  if (this.services[name].length === 1 && this.needs[name] && check.call(this))
    this.emit('ready', this.services);
};

/**
 * Delegates to setup functions before the service is activated.
 *
 * @this {ServiceDiscovery}
 * @private
 */
var delegate = function(node, index) {
  var self = this;

  var hooks = this.servicehooks[node.info.name];
  var fn = hooks && hooks[index++];
  if (!fn) {
    var nodeIndex = this.servicedeck[node.info.name].indexOf(node);
    return ~nodeIndex && activate.call(this, node, nodeIndex);
  }
  // prevent duplicate calls
  var called = false;
  fn(node.info, function(err) {
    if (called)
      return;
    called = true;
    // TODO: could errors be handled more elegantly?
    if (err) {
      removeElement(self.servicedeck[node.info.name], node);
      return self.emit('error', err);
    }
    delegate.call(self, node, index);
  });
};

/**
 * Checks to see if all the needs have been met.
 *
 * @this {ServiceDiscovery}
 * @return {!boolean} Whether the needs have been met.
 * @private
 * @nosideeffects
 */
var check = function() {
  for (var req in this.needs)
    if (!this.services[req] || !this.services[req].length)
      return false;
  return true;
};

/**
 * The ServiceDiscovery constructor, which discovers services and handles the
 * readiness of the application.
 *
 * @param {Object.<string, *>=} options The options for the service discovery.
 * @constructor
 * @extends EventEmitter
 */
var ServiceDiscovery = function ServiceDiscovery(options) {
  if (!(this instanceof ServiceDiscovery))
    return new ServiceDiscovery(options);

  EventEmitter.call(this);

  this.options = _.defaults(options || {}, defaults);

  this.needs = {};
  this.services = {};
  this.servicedeck = {};
  this.servicehooks = {};

  this.discovery = new Discovery(this.options);
  this.discovery.on('added', added.bind(this));
  this.discovery.on('removed', removed.bind(this));
  this.discovery.on('master', this.emit.bind(this, 'master'));
  this.discovery.on('demotion', this.emit.bind(this, 'demotion'));
  this.discovery.on('promotion', this.emit.bind(this, 'promotion'));
};

// ServiceDiscovery inherits from EventEmitter
util.inherits(ServiceDiscovery, EventEmitter);

/**
 * Specifies the service information for advertisement to other services.
 *
 * @param {Object.<string, *>=} obj The object to advertise.
 */
ServiceDiscovery.prototype.advertise = function(obj) {
  if (typeof obj.name !== 'string')
    throw new TypeError('you must advertise your name');
  this.discovery.advertise(obj);
};

/**
 * Indicates that the service(s) specified are required for minimum operation.
 *
 * @param {...!string} var_args The services needed.
 */
ServiceDiscovery.prototype.need = function() {
  for (var i = 0; i < arguments.length; i++)
    this.needs[arguments[i]] = true;
};

/**
 * Adds a hook for the specified service.
 *
 * @param {!string} service The service to handle.
 * @param {function(!Object.<string, *>, function(?Error))} fn The hook function.
 */
// allows for on-demand initialization of service specifics
ServiceDiscovery.prototype.setup = function(service, fn) {
  var self = this;

  this.need(service);
  if (this.servicehooks[service])
    this.servicehooks[service].push(fn);
  else
    this.servicehooks[service] = [fn];
};

ServiceDiscovery.prototype.promote = function() {
  this.discovery.promote.apply(this.discovery, arguments);
};

ServiceDiscovery.prototype.demote = function() {
  this.discovery.demote.apply(this.discovery, arguments);
};

ServiceDiscovery.prototype.join = function() {
  this.discovery.join.apply(this.discovery, arguments);
};

ServiceDiscovery.prototype.leave = function() {
  this.discovery.leave.apply(this.discovery, arguments);
};

ServiceDiscovery.prototype.send = function() {
  this.discovery.send.apply(this.discovery, arguments);
};

ServiceDiscovery.prototype.start = function() {
  this.discovery.start.apply(this.discovery, arguments);
};

ServiceDiscovery.prototype.stop = function() {
  this.discovery.stop.apply(this.discovery, arguments);
};


module.exports = ServiceDiscovery;
