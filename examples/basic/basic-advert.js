/**
 * This is the most basic example of using Discovery.
 *
 * In this example all we are interested in is advertising ourself to the
 * network, and detecting when new nodes enter or leave the network. The master
 * selection stuff happens behind the scenes but we can completely ignore it
 * and just handle the events for nodes entering and leaving.
 *
 * See also: basic.js
 */

var Discovery = require('../..').Discovery;

var d = new Discovery();

d.advertise({
  http: "80",
  random: Math.random()
});

d.on("added", function(obj) {
  console.log("New node added to the network.");
  console.log(obj);
});

d.on("removed", function(obj) {
  console.log("Node removed from the network.");
  console.log(obj);
});
