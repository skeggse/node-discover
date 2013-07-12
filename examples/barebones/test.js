var Discovery = require('../..').Discovery;

var c = new Discovery();

c.on("promotion", function() {
  console.log("I was promoted.");

  c.advertise({
    RedisMonitor: {
      protocol: 'tcp',
      port: 5555
    }
  });
});

c.on("demotion", function() {
  console.log("I was demoted.");

  c.advertise(null);
});

c.on("added", function(obj) {
  console.log("Node added; here are all the nodes:");
  for (var id in c.nodes)
    console.log(c.nodes[id]);
});

c.on("removed", function(obj) {
  console.log("Node removed; here are all the nodes:");
  for (var id in c.nodes)
    console.log(c.nodes[id]);
});

c.on("master", function(obj) {
  console.log("New master.");
});
