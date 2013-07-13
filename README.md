node-discovery
==============

Automatic and decentralized discovery and monitoring of nodejs instances with built in support for a variable number of master processes, service advertising and channel messaging.

Version 0.2.1

Might have bugs. To ensure the safe performance of this module, why not contribute more [unit tests][]!?

Installing
==========

### npm

Unless you have specific needs, install [`node-discovery` via npm][nd-npm].

```
npm install node-discovery
```

### git

```
git clone git://github.com/skeggse/node-discovery.git
```

Why?
====

So, you have a whole bunch of node processes running but you have no way within each process to determine where the other processes are or what they can do. This module aims to make discovery of new processes as simple as possible. Additionally, what if you want one process to be in charge of a cluster of processes? This module also has automatic master process selection.

Compatibility
=============

This module uses broadcast and multicast features from node's dgram module. Additionally, this module depends on changes to the dgram module and the new streams api introduced in 0.10. Therefore, this module is compatible with Node `v0.10.0+`.

Example
=======

Be sure to look in the examples folder, especially at the [service discovery][].

```js
var ServiceDiscovery = require('node-discovery').ServiceDiscovery;

var d = new ServiceDiscovery();

// advertise the service
d.advertise({
  name: 'service.web',
  ready: false
});

// inform ServiceDiscovery which services are necessary to initialize
d.need('service.database.redis');

// setup also notifies ServiceDiscovery of necessary services
d.setup('service.database.mongo', function(service, callback) {
  /**
   * Initialize the service, in this example by connecting to mongo.
   */
});

d.on('ready', function() {
  /**
   * ServiceDiscovery has discovered all services needed.
   *
   * Things to do:
   *   Start http server listening on configured port.
   *   Let the load balancers know we're ready for connections.
   */
  d.advertise({
    name: 'service.web',
    ready: true
  });
});

d.on('promotion', function() {
  /**
   * Launch things this master process should do.
   *
   * For example:
   *  - Monitior your redis servers and handle failover by issuing slaveof
   *    commands then notify other node instances to use the new master
   *  - Make sure there are a certain number of nodes in the cluster and
   *    launch new ones if there are not enough
   *  - whatever
   */
  console.log('I was promoted to a master.');
});

d.on('demotion', function() {
  /**
   * End all master specific functions or whatever you might like.
   */
  console.log('I was demoted from being a master.');
});

d.on('master', function(obj) {
  /**
   * A new master process has been selected
   *
   * Things we might want to do:
   *  - Review what the new master is advertising use its services
   *  - Kill all connections to the old master
   */
  console.log('A new master is in control');
});
```

Low Level
---------

Be sure to look in the examples folder at the [distributed event emitter][].

```js
var Discovery = require('node-discovery').Discovery;

var d = new Discovery();

// advertise the process with an object
d.advertise({
  details: 'about',
  this: 'service'
});

d.on('promotion', function() {
  /**
   * Launch things this master process should do.
   *
   * For example:
   *  - Monitior your redis servers and handle failover by issuing slaveof
   *    commands then notify other node instances to use the new master
   *  - Make sure there are a certain number of nodes in the cluster and
   *    launch new ones if there are not enough
   *  - whatever
   */
  console.log('I was promoted to a master.');
});

d.on('demotion', function() {
  /**
   * End all master specific functions or whatever you might like.
   */
  console.log('I was demoted from being a master.');
});

d.on('added', function(obj) {
  console.log('A new node has been added.');
});

d.on('removed', function(obj) {
  console.log('A node has been removed.');
});

d.on('master', function(obj) {
  /**
   * A new master process has been selected
   *
   * Things we might want to do:
   *  - Review what the new master is advertising use its services
   *  - Kill all connections to the old master
   */
  console.log('A new master is in control');
});
```

Testing
=======

Any of the following will run the tests:

```
node-discovery$ mocha
node-discovery$ npm test
node-discovery$ make test
```

Service Discovery API
=====================

Constructor
-----------

```js
var ServiceDiscovery = require('node-discovery');

var discovery = new ServiceDiscovery({
  helloInterval: 1000, // How often to broadcast a hello packet in milliseconds
  checkInterval: 2000, // How often to to check for missing nodes in milliseconds
  nodeTimeout: 2000, // Consider a node dead if not seen in this many milliseconds
  masterTimeout: 2000, // Consider a master node dead if not seen in this many milliseconds
  mastersRequired: 1, // The count of master processes that should always be available
  weight: Math.random(), // A number used to determine the preference for a specific process to become master. Higher numbers win.

  address: '0.0.0.0', // Address to bind to
  port: 12345, // Port on which to bind and communicate with other node-discovery processes
  broadcast: '255.255.255.255', // Broadcast address if using broadcast
  multicast: null, // Multicast address if using multicast (don't use multicast, use broadcast)
  mulitcastTTL: 1, // Multicast TTL for when using multicast

  algorithm: 'aes256', // Encryption algorithm for packet broadcasting (must have key to enable)
  key: null, // Encryption key if your broadcast packets should be encrypted (null means no encryption)

  ignore: 'self', // Which packets to ignore: 'self' means ignore packets from this instance, 'process' means ignore packets from this process
  ignoreDataErrors: true // whether to ignore data errors including parse errors
});
```

Properties
----------

* services

Methods
-------

`ServiceDiscovery` has all the same methods as [`Discovery`](#discovery-api) and more.

### advertise(info)

Advertise yourself as a service. The info `object` is mostly arbitrary, but must include a `name` property indicating the name of the service.

```js
var ServiceDiscovery = require('node-discovery');
var d = new ServiceDiscovery();

d.advertise({
  name: 'service.database.mysql',
  config: {
    host: 'localhost',
    port: 3306,
    user: 'username',
    password: 'some_awesome_password',
    database: 'my_database_name'
  }
});
```

### need(service, service, service...)

Requires the specified services to be present before the `ready` event is emitted.

```js
var ServiceDiscovery = require('node-discovery');
var d = new ServiceDiscovery();

d.need('service.database.mongo');
d.need('service.database.redis', 'service.database.mysql');
```

### setup(service, callback)

Internally calls `need(service)` and ensures the callback will be called upon discovering the specified service. If multiple are discovered, the setup hook will be called for each service. The setup hook will receive the `info` object for the service and a `callback` function to invoke upon successful or unsuccessful service setup.

```js
var ServiceDiscovery = require('node-discovery');
var d = new ServiceDiscovery();

var redis;

d.setup('service.database.redis', function(service, callback) {
  redis = db.createClient(service.config.port, service.config.host);
  if (service.config.auth)
    redis.auth(service.config.auth, callback);
  else
    callback();
});
```

Events
------

Each event is passed the `Node Object` for which the event is occuring.

### promotion

Triggered when the node has been promoted to a master.

* Could happen by calling the promote() method
* Could happen by the current master instance being demoted and this instance automatically being promoted
* Could happen by the current master instance dying and this instance automatically being promoted

### demotion

Triggered when the node is no longer a master.

* Could happen by calling the demote() method
* Could happen by another node promoting itself to master

### master

Triggered when a new master has been selected.

### ready

Triggered when all services have been discovered. Receives a object with keys as the names of services and values as the arrays of service objects.

`services` argument:

```
{
  "service.database.redis": [
    {
      "name": "service.database.redis",
      "config": {
        "host": "localhost",
        "port": 6379
      }
    },
    {
      "name": "service.database.redis",
      "config": {
        "host": "192.168.1.42",
        "port": 6379
      }
    }
  ]
}
```

### notready

Triggered when a service no longer has any candidates.

Node Object
-----------

```js
{
  isMaster: true,
  isMasterEligible: true,
  info: null,
  lastSeen: 1317323922551,
  address: '10.0.0.1',
  port: 12345,
  id: '31d39c91d4dfd7cdaa56738de8240bc4',
  hostName: 'myMachine'
}
```

Discovery API
=============

Constructor
-----------

```js
var Discovery = require('node-discovery').Discovery;

var discovery = new Discovery({
  helloInterval: 1000, // How often to broadcast a hello packet in milliseconds
  checkInterval: 2000, // How often to to check for missing nodes in milliseconds
  nodeTimeout: 2000, // Consider a node dead if not seen in this many milliseconds
  masterTimeout: 2000, // Consider a master node dead if not seen in this many milliseconds
  mastersRequired: 1, // The count of master processes that should always be available
  weight: Math.random(), // A number used to determine the preference for a specific process to become master. Higher numbers win.

  address: '0.0.0.0', // Address to bind to
  port: 12345, // Port on which to bind and communicate with other node-discovery processes
  broadcast: '255.255.255.255', // Broadcast address if using broadcast
  multicast: null, // Multicast address if using multicast (don't use multicast, use broadcast)
  mulitcastTTL: 1, // Multicast TTL for when using multicast

  algorithm: 'aes256', // Encryption algorithm for packet broadcasting (must have key to enable)
  key: null, // Encryption key if your broadcast packets should be encrypted (null means no encryption)

  ignore: 'self', // Which packets to ignore: 'self' means ignore packets from this instance, 'process' means ignore packets from this process
  ignoreDataErrors: true // whether to ignore data errors including parse errors
});
```

Properties
----------

* nodes

Methods
-------

### promote()

Promote the instance to master.

This causes the old master to demote.

```js
var Discovery = require('node-discovery').Discovery;
var d = new Discovery();

d.promote();
```

### demote(permanent=false)

Demote the instance from being a master. Optionally pass true to demote to specify that this node should not automatically become master again.

This causes another node to become master

```js
var Discovery = require('node-discovery').Discovery;
var d = new Discovery();

// different usages
d.demote(); // this node is still eligible to become a master node.
d.demote(true); // this node is no longer eligible to become a master node.
```

### join(channel, messageCallback)

Join a channel on which to receive messages/objects

```js
var Discovery = require('node-discovery').Discovery;
var d = new Discovery();

// pass the channel and the callback function for handling received data from that channel
var success = d.join('config-updates', function(data) {
  if (data.redisMaster) {
    // connect to the new redis master
  }
});

if (!success) {
  // could not join that channel; probably because it is reserved
}
```

#### Reserved channels

* promotion
* demotion
* added
* removed
* master
* hello

### leave(channel)

Leave a channel

```js
var Discovery = require('node-discovery').Discovery;
var d = new Discovery();

// pass the channel which we want to leave
var success = d.leave('config-updates');

if (!success) {
  // could leave channel; who cares?
}
```

### send(channel, objectToSend)

Send a message/object on a specific channel

```js
var Discovery = require('node-discovery').Discovery;
var d = new Discovery();

var success = d.send('config-updates', {redisMaster : '10.0.1.4'});

if (!succes) {
  // could not send on that channel; probably because it is reserved
}
```

### advertise(objectToAdvertise)

Advertise an object or message with each hello packet; this is completely arbitrary. make this object/message whatever you applies to your application that you want your nodes to know about the other nodes.

```js
var Discovery = require('node-discovery').Discovery;
var d = new Discovery();

// any of these invocations
d.advertise({
  localServices : [
    {type: 'http', port: '9911', description: 'my awesome http server'},
    {type: 'smtp', port: '25', description: 'smtp server'}
  ]
});

d.advertise('i love nodejs');

d.advertise({something: 'something'});
```

### start()

Start broadcasting hello packets and checking for missing nodes (start is called automatically in the constructor)

```js
var Discovery = require('node-discovery').Discovery;
var d = new Discovery();

d.start();
```

### stop()

Stop broadcasting hello packets and checking for missing nodes

```js
var Discovery = require('node-discovery').Discovery;
var d = new Discovery();

d.stop();
```

Events
------

Each event is passed the `Node Object` for which the event is occuring.

### promotion

Triggered when the node has been promoted to a master.

* Could happen by calling the promote() method
* Could happen by the current master instance being demoted and this instance automatically being promoted
* Could happen by the current master instance dying and this instance automatically being promoted

### demotion

Triggered when the node is no longer a master.

* Could happen by calling the demote() method
* Could happen by another node promoting itself to master

### added

Triggered when a new node is discovered.

### removed

Triggered when a new node is not heard from within `nodeTimeout`.

### master

Triggered when a new master has been selected.

Node Object
-----------

```js
{
  isMaster: true,
  isMasterEligible: true,
  info: null,
  lastSeen: 1317323922551,
  address: '10.0.0.1',
  port: 12345,
  id: '31d39c91d4dfd7cdaa56738de8240bc4',
  hostName: 'myMachine'
}
```

TODO
====

* **Fix terrible hack for `rinfo`!**
  * Currently assigning an `_info` property to the data as it flows through the stream...
* Discovery assumes the broadcast address to be `255.255.255.255`.
* Local address assumed to be `127.0.0.1`.
* Missing node check may not be sufficiently optimized.
* Address possible security concerns with EventEmitter2 and unconstrained event names.
* Add tests for Discovery itself.
* More documentation, both inline and API.
* Improve service discovery node removal handling.
* Let other services know that this service is going down if stopped.

### Questions

* Could the service discovery automatically call setup for one at a time?
* Should ServiceDiscovery inherit from Discovery? Integrate into Discovery?

LICENSE
=======

> (MIT License)

> Copyright &copy; 2011 Dan VerWeire <dverweire@gmail.com>

> Copyright &copy; 2013 Eli Skeggs <skeggse@gmail.com>

> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

> The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

[unit tests]: https://github.com/skeggse/node-discovery/blob/master/test/ "Unit Tests"
[distributed event emitter]: https://github.com/skeggse/node-discovery/blob/master/examples/deventemitter/deventemitter.js "Distributed Event Emitter"
[service discovery]: https://github.com/skeggse/node-discovery/blob/master/examples/service/ "Service Discovery"
[nd-npm]: https://npmjs.org/package/node-discovery "node-discovery on npm"
