/**
 * This is a fairly real-world usage of Discover.
 *
 * In this example we setup three interconnected services, which will
 * communicate via RabbitMQ, and run the initial service discovery through
 * Discover. The master, in this case, is a service dedicated to the well-being
 * of the message queue, and it along holds the keys to the queue, which the
 * service distributes via Discover.
 *
 * The queue service monitors the message queues and advertises them.
 * The data service monitors the databases and advertises them.
 *
 * See also: service-*.js
 */

var Discover = require('..');

var master = new Discover({
  weight: 2 // guarantees master status
});

master.advertise({
  type: 'service.queue',
  config: {
    host: '127.0.0.1',
    port: 5672
  }
});

master.on('added', function(node) {
  console.log(node.address, node.advertisement);
});

// pretend to keep the message queue always running
// pretend to spin up new instances for scaling

setTimeout(function() {
  var databases = [];

  var database = function(config) {
    var db = new Discover();
    db.advertise(config);
    databases.push(db);
  };

  database({
    type: 'service.data.redis',
    config: {
      host: 'localhost',
      port: 6379
    }
  });
}, 1000);

// pretend to keep the databases running
