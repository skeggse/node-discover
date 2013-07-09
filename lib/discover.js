/**
 * Node Discover
 *
 * Attributes:
 *   nodes
 *
 * Methods:
 *   promote
 *   demote
 *   join
 *   leave
 *   advertise
 *   send
 *   start
 *   stop
 *   eachNode(fn)
 *
 * Events:
 *   promotion
 *   demotion
 *   added
 *   removed
 *   master
 *
 * checkInterval should be greater than hello interval to avoid wasting cpu
 * nodeTimeout must be greater than checkInterval
 * masterTimeout must be greater than nodeTimeout
 */

var Network = require('./network');
var EventEmitter = require('eventemitter2').EventEmitter2;
var util = require('util');
var _ = require('underscore');

var reservedEvents = {'promotion': true, 'demotion': true, 'added': true, 'removed': true, 'master': true, 'hello': true};

var defaults = {
	helloInterval: 1000,
	checkInterval: 2000,
	nodeTimeout: 2000,
	masterTimeout: 2000,
	address: '0.0.0.0',
	port: 12345,
	broadcast: null,
	multicast: null,
	multicastTTL: null,
	key: null,
	mastersRequired: 1
};

var Discover = function(options) {
	EventEmitter.call(this);

	var self = this, checkId, helloId, running = false;

  var settings = _.defaults(options || {}, defaults);
  settings.weight = settings.weight || Math.random();

	if (settings.nodeTimeout < settings.checkInterval)
		throw new Error("nodeTimeout must be greater than or equal to checkInterval.");

	if (settings.masterTimeout < settings.nodeTimeout)
		throw new Error("masterTimeout must be greater than or equal to nodeTimeout.");

	// network filters out unnecessary settings
	this.broadcast = new Network(settings);

	// this is the object that gets broadcast with each hello packet.
	this.me = {
		isMaster: false,
		isMasterEligible: true,
		weight: settings.weight,
		address: '127.0.0.1' // TODO: get the real local address?
	};

	this.nodes = {};
	this.channels = {};

	/**
	 * When receiving hello messages we need things to happen in the following order:
	 * 	- make sure the node is in the node list
	 * 	- if hello is from new node, emit added
	 * 	- if hello is from new master and we are master, demote
	 * 	- if hello is from new master emit master
	 *
	 * need to be careful not to over-write the old node object before we have information
	 * about the old instance to determine if node was previously a master.
	 */
	this.broadcast.on("hello", function(data, obj, rinfo) {
		data.lastSeen = Date.now();
		data.address = rinfo.address;
		data.hostName = obj.hostName;
		data.port = rinfo.port;
		data.id = obj.iid;
		var isNew = !self.nodes[obj.iid];
		var wasMaster = null;

		if (!isNew)
			wasMaster = !!self.nodes[obj.iid].isMaster;

		var node = self.nodes[obj.iid] = self.nodes[obj.iid] || {};

		_.extend(node, data);

		if (isNew)
			// new node found
			self.emit("added", node, obj, rinfo);

		if (node.isMaster) {
			// if we have this node and it was not previously a master then it is a new master node
			if (isNew || !wasMaster) {
				// this is a new master
				// count up how many masters we have now
				var masterCount = 0;
				for (var uuid in self.nodes)
					if (self.nodes[uuid].isMaster)
						masterCount++;

				if (self.me.isMaster && masterCount > settings.mastersRequired)
					self.demote();

				self.emit("master", node, obj, rinfo);
			}
		}
	});

	// TODO: can this be optimized?
	this.start = function() {
		if (running)
			return false;
		running = true;

		checkId = setInterval(function() {
			var node = null, mastersFound = 0, higherWeightFound = false, removed;

			var weights = [];

			for (var processUuid in self.nodes) {
				node = self.nodes[processUuid];
				removed = false;

				if (Date.now() - node.lastSeen > settings.nodeTimeout) {
					// we haven't seen the node recently

					// if node is a master and has not timed out yet based on the masterTimeout then fake it being found
					if (node.isMaster && (Date.now() - node.lastSeen) < settings.masterTimeout)
						mastersFound++;

					// delete the node from our nodes list
					delete self.nodes[processUuid]
					removed = true;
					self.emit("removed", node);
				} else if (node.isMaster)
					mastersFound++;

				if (node.weight > self.me.weight && node.isMasterEligible && !removed)
					higherWeightFound = true;
			}

			if (!self.me.isMaster && mastersFound < settings.mastersRequired && self.me.isMasterEligible && !higherWeightFound)
				// no masters found out of all our nodes, become one.
				self.promote();

		}, settings.checkInterval);

		// send hello every helloInterval
		helloId = setInterval(function() {
			self.broadcast.send("hello", self.me)
		}, settings.helloInterval);
	};

	this.stop = function() {
		if (!running)
			return false;

		clearInterval(checkId);
		clearInterval(helloId);
	};

	this.start();
};

util.inherits(Discover, EventEmitter);


Discover.prototype.promote = function() {
	this.me.isMasterEligible = true;
	this.me.isMaster = true;
	this.emit("promotion", this.me);
	this.hello();
};

Discover.prototype.demote = function(permanent) {
	this.me.isMasterEligible = !permanent;
	this.me.isMaster = false;
	this.emit("demotion", this.me);
	this.hello();
};

Discover.prototype.hello = function() {
	this.broadcast.send("hello", this.me);
};

Discover.prototype.advertise = function(obj) {
	this.me.advertisement = obj;
};

Discover.prototype.eachNode = function(fn) {
	for (var uuid in this.nodes)
		fn(this.nodes[uuid]);
};

Discover.prototype.join = function(channel, fn) {
	var self = this;

	if (reservedEvents[channel] || this.channels[channel])
		return false;

	if (fn)
		this.on(channel, fn);

	this.broadcast.on(channel, function(obj) {
		self.emit(channel, obj);
	});

	this.channels[channel] = true;

	return true;
};

Discover.prototype.leave = function(channel) {
	this.broadcast.removeAllListeners(channel);

	delete this.channels[channel];

	return true;
};

Discover.prototype.send = function(channel, obj) {
	if (reservedEvents[channel])
		return false;

	this.broadcast.send(channel, obj);

	return true;
};

module.exports = Discover;
