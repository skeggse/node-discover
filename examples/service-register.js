/**
 * This is a fairly real-world usage of Discover.
 *
 * In this example we setup three interconnected services, which will
 * communicate via RabbitMQ, and run the initial service discovery through
 * Discover. The master, in this case, is a service dedicated to the well-being
 * of the message queue, and it along holds the keys to the queue, which the
 * service distributes via Discover.
 * 
 * The registration service handles registration requests through the
 * message queue.
 *
 * See also: service-*.js
 */

var discovery = require('./service-discovery');
var mq = require('amqp');

var config = {
  input: 'service-register',
  output: 'service-creation'
};

discovery.advertise({
  type: 'service.register',
  config: config
});

discovery.require('service.queue');
discovery.ready(function(services) {
  var rabbit = mq.createConnection(services['service.queue'].config);
  rabbit.on('ready', function() {
    var done = _.after(2, function() {
      register.subscribe({ack: true, prefetchCount: 1}, function(message, headers, deliveryInfo) {
        // TODO: register the user
        creation.publish('', message, headers);
        // acknowledge
        register.shift();
      });
    });
    var next = _.after(2, function() {
      register.bind(exchange, '');
      done();
    });
    var creation = rabbit.exchange(config.output, {autoDelete: false, type: 'fanout'}, done);
    var exchange = rabbit.exchange(config.input, {durable: true, confirm: true, autoDelete: false, type: 'fanout'}, next);
    var register = rabbit.queue(config.input, {durable: true, autoDelete: false}, next);
  });
});
