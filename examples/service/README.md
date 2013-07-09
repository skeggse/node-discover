Service Discovery Example
=========================

This is a fairly real-world usage of Discovery.

In this example we setup three interconnected services, which will communicate via RabbitMQ, and run the initial service discovery through Discovery. The master, in this case, is a service dedicated to the well-being of the message queue, and it along holds the keys to the queue, which the service distributes via Discovery.

## Services

Each service uses the service discovery component of `node-discovery`, exposed as the `ServiceDiscovery` property of the module.

### [Master](https://github.com/skeggse/node-discovery/blob/master/examples/service/service-master.js)

The master service pretends to manage the databases and message queues, and advertises their presence and configuration information.

### [Register](https://github.com/skeggse/node-discovery/blob/master/examples/service/service-register.js)

The registration service handles registration requests, and could notify the user of their registration success via an email service through the message queue. After the registration succeeds, the register service pushes a notice back to the web service for the registration stream.

### [Web](https://github.com/skeggse/node-discovery/blob/master/examples/service/service-web.js)

The web service handles incoming http requests, and either handles the responses or delegates their actions through the message queue.
