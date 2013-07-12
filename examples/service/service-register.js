/**
 * This is a fairly real-world usage of Discovery.
 *
 * In this example we setup three interconnected services, which will
 * communicate via RabbitMQ, and run the initial service discovery through
 * Discovery. The master, in this case, is a service dedicated to the well-being
 * of the message queue, and it along holds the keys to the queue, which the
 * service distributes via Discovery.
 *
 * The registration service handles registration requests through the
 * message queue.
 *
 * See also: service-*.js
 */

var ServiceDiscovery = require('../..');
var _ = require('underscore');
var mq = require('amqp');

var discovery = new ServiceDiscovery();

discovery.advertise({
  name: 'service.register'
});

discovery.need('service.queue');

discovery.on('ready', function(services) {
  console.log('service discovery complete');
  var rabbit = mq.createConnection(services['service.queue'].config);
  rabbit.on('ready', function() {
    var done = _.after(2, function() {
      register.subscribe({ack: true, prefetchCount: 1}, function(message, headers, deliveryInfo) {
        // TODO: register the user
        console.log('user registration', message);
        creation.publish('', message, headers);
        // acknowledge
        register.shift();
      });
    });
    var next = _.after(2, function() {
      register.bind(exchange, '');
      done();
    });
    var creation = rabbit.exchange('service-creation', {autoDelete: false, type: 'fanout'}, done);
    var exchange = rabbit.exchange('service-register', {durable: true, confirm: true, autoDelete: false, type: 'fanout'}, next);
    var register = rabbit.queue('service-register', {durable: true, autoDelete: false}, next);
  });
  rabbit.on('error', console.error.bind(console));
});
