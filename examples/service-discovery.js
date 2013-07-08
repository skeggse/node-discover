/**
 * This is a fairly real-world usage of Discover.
 *
 * In this example we setup three interconnected services, which will
 * communicate via RabbitMQ, and run the initial service discovery through
 * Discover. The master, in this case, is a service dedicated to the well-being
 * of the message queue, and it along holds the keys to the queue, which the
 * service distributes via Discover.
 *
 * See also: service-*.js
 */

things
// service-discovery contains utilities to improve the discovery of services
// TODO: needs BRUTAL testing

var Discover = require('..');
var EventEmitter = require('events').EventEmitter;
var _ = require('underscore');

var d = new Discover();
var emitter = new EventEmitter();

var before = {}, services = {};

d.on('added', function(node) {
  node = node.advertisement;
  if (_.has(before, node.type)) {
    if (services[node.type])
      services[node.type].service = node;
    exports.fulfill(node.type)();
  }
});

// entire service discovery or single service dependencies
var isReady = function(service) {
  var reqs = service ? services[service].mandate : _.keys(before);
  for (var i = 0; i < reqs.length; i++)
    if (before[reqs[i]] === false)
      return false;
  return true;
};

// mandate that the specified requirements be fulfilled before ready
exports.mandate = function() {
  console.log.apply(console, ['discovery.mandate'].concat(_.toArray(arguments)));
  for (var i = 0; i < arguments.length; i++)
    before[arguments[i]] = false;
};

// allow the service to fulfill binary requirements
exports.fulfill = function() {
  var args = _.toArray(arguments);
  console.log.apply(console, ['discovery.fulfill'].concat(args));
  for (var i = 0; i < arguments.length; i++)
    if (!_.has(before, arguments[i]))
      before[arguments[i]] = false;
  return function() {
    console.log.apply(console, ['discovery:fulfill'].concat(args));
    _.each(args, function(name) {
      before[name] = true;
      // run applicable hooks
      for (var service in services)
        if (~services[service].mandate.indexOf(name) && isReady(service))
          services[service].fn(services[service].service);
      if (isReady())
        emitter.emit('ready');
    });
  };
};

// handle the creation of a service
exports.service = function() {
  var args = _.toArray(arguments);
  var fn = args.pop();
  console.log.apply(console, ['discovery.service'].concat(args));
  if (!args.length)
    throw new TypeError('need at least a service and callback');
  exports.mandate.apply(exports, args);
  services[_.last(args)] = {service: null, mandate: args, fn: fn};
};

exports.advertise = d.advertise.bind(d);
exports.ready = emitter.emit.bind(emitter, 'ready');
