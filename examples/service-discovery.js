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

// service-discovery contains utilities to improve the discovery of services
// TODO: needs BRUTAL testing
// TODO: needs some kind of fallback system when dependencies fail

var Discover = require('..');
var _ = require('underscore');

var d = new Discover();
var require = {}, handlers = [], after = {}, hooks = [], ready = false;

d.on('added', function(node) {
  node = node.advertisement;
  console.log('discovery#add', node);
  if (require[node.type]) {
    require[node.type] = node;
    handle(node);
    proceed();
  }
});

d.on('removed', function(node) {
  node = node.advertisement;
  console.log('discovery#remove', node);

});

var handle = function(node) {
  console.log('discovery:handle', node);
  for (var i = 0; i < handlers.length; i++) {
    var handler = handlers[i];
    if (node && handler.main === node.type)
      handler.node = node;
    for (var i = 0; i < handler.before.length; i++) {
      if (after[handler.before[i]] || typeof require[handler.before[i]] === 'object') {
        handler.before.splice(i, 1);
        i--;
      }
    }
    if (handler.node && !handler.before.length) {
      handler.fn(handler.node);
      handlers.splice(i--, 1);
    }
  };
};

var proceed = function() {
  console.log('discovery:proceed');
  if (_.every(require, _.isObject) && _.every(after) && !ready) {
    ready = true;
    // all handlers must be ready now
    console.warn('all requirements fulfilled, but handlers still exist');
    for (var i = 0; i < handlers.length; i++) {
      handlers[i].fn(handlers[i].node);
    }
    _.invoke(hooks, 'fn', require);
  }
};

exports.advertise = d.advertise.bind(d);

exports.after = function(name) {
  console.log('discovery.after', name);
  after[name] = false;
  return function() {
    after[name] = true;
    handle();
    proceed();
  };
};

exports.require = function() {
  console.log.apply(console, ['discovery.require'].concat(_.toArray(arguments)));
  for (var i = 0; i < arguments.length; i++)
    require[arguments[i]] = true;
};

exports.handle = function(service) {
  console.log('discovery.handle', service);
  var args = _.toArray(arguments);
  var fn = args.pop();
  if (!args.length)
    throw new TypeError('need at least service and callback');
  exports.require.apply(exports, args);
  handlers[service] = {main: _.last(args), before: args, fn: fn};
};

exports.ready = function(fn) {
  hooks.push({fn: fn});
};
