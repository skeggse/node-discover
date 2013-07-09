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
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var _ = require('underscore');

/**
 * The default options for ServiceDiscovery.
 *
 * @type {Object<string, *>}
 */
var defaults = {};

/**
 * @this {ServiceDiscovery}
 * @param {
 * @private
 */
var added = function(node) {
  var name = node.info.name;
  if (this.services[name])
    this.services[name].push(node);
  else {
    this.services[name] = [node];
    if (this.needs[name] && check.call(this))
      this.emit('ready', this.services);
  }
  this.emit('service:' + name, node);
};

/**
 * @this {ServiceDiscovery}
 * @private
 */
var removed = function(node) {
  var name = node.info.name;
  if (this.services[name]) {
    var index = this.services[name].indexOf(node);
    if (~index)
      this.services[name].splice(index, 1);
    if (this.needs[name] && !this.services[name].length)
      this.emit('notready');
  }
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
 * @param {Object<string, *>=} options The options for the service discovery.
 * @constructor
 * @extends EventEmitter
 */
var ServiceDiscovery = function ServiceDiscovery(options) {
  EventEmitter.call(this);

  var self = this;

  self.options = _.defaults(options || {}, defaults);

  self.needs = {};
  self.services = {};

  self.discovery = new Discovery(self.options);
  self.discovery.on('added', added.bind(self));
  self.discovery.on('removed', removed.bind(self));
  self.discovery.on('master', self.emit.bind(self, 'master'));
  self.discovery.on('demotion', self.emit.bind(self, 'demotion'));
  self.discovery.on('promotion', self.emit.bind(self, 'promotion'));
};

// ServiceDiscovery inherits from EventEmitter
util.inherits(ServiceDiscovery, EventEmitter);

/**
 * Specifies the service information for advertisement to other services.
 *
 * @param {Object<string, *>=} obj The object to advertise.
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
 * @param {function(!Object<string, *>)} fn The hook function.
 */
// allows for on-demand initialization of service specifics
ServiceDiscovery.prototype.setup = function(service, fn) {
  this.need(service);
  this.on('service:' + service, fn);
};

module.exports = ServiceDiscovery;
