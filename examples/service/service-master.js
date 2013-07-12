/**
 * This is a fairly real-world usage of Discovery.
 *
 * In this example we setup three interconnected services, which will
 * communicate via RabbitMQ, and run the initial service discovery through
 * Discovery. The master, in this case, is a service dedicated to the well-being
 * of the message queue, and it along holds the keys to the queue, which the
 * service distributes via Discovery.
 *
 * The queue service monitors the message queues and advertises them.
 * The data service monitors the databases and advertises them.
 *
 * See also: service-*.js
 */

var ServiceDiscovery = require('../..');
var Discovery = ServiceDiscovery.Discovery;

var master = new ServiceDiscovery({
  weight: 2 // guarantees master status
});

master.advertise({
  name: 'service.queue',
  config: {url: 'amqp://localhost:5672'}
});

master.on('service', function(name, node) {
  console.log(name, node.address, node.info);
});

// pretend to keep the message queue always running
// pretend to spin up new instances for scaling

setTimeout(function() {
  var databases = [];

  var database = function(config) {
    var db = new Discovery();
    db.advertise(config);
    databases.push(db);
  };

  database({
    name: 'service.data.redis',
    config: {
      host: 'localhost',
      port: 6379
    }
  });
}, 1000);

// pretend to keep the databases running
