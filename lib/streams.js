var stream = require('stream');
var Transform = stream.Transform;
var Duplex = stream.Duplex;
var dgram = require('dgram');
var crypto = require('crypto');
var crc32 = require('buffer-crc32');
var util = require('util');
var _ = require('underscore');

_.mixin({
  options: function(self, options, defaults) {
    if (options)
      _.extend(self, _.defaults(_.pick(options, _.keys(defaults)), defaults));
    else
      _.extend(self, defaults);
  }
});

var thumbs = {
  twiddle: function() {}
};

var defaults = {
  address: '0.0.0.0',
  type: 'udp4',
  port: 12345,
  broadcast: null,
  multicast: null,
  multicastTTL: 1,
  // for testing
  scope: null
};

var UDPStream = function UDPStream(options) {
  if (!(this instanceof UDPStream))
    return new UDPStream(options);

  // half-open will be handled by this class
  Duplex.call(this, {allowHalfOpen: true});

  _.options(this, options, defaults);

  if (this.scope)
    this.scope.push(this);
  else {
    this._socket = dgram.createSocket(this.type);
    this._socket.bind(this.port, this.address, setup.bind(this));
    this._socket.on('close', close.bind(this));
    this._socket.on('message', message.bind(this));
    this._socket.on('error', this.emit.bind(this, 'error'));
    this.once('finish', finish.bind(this));
  }
};

util.inherits(UDPStream, Duplex);

/**
 * Sets up the UDPStream once the socket has been bound.
 *
 * @this {UDPStream}
 * @private
 */
var setup = function() {
  if (this.multicast) {
    this._socket.addMembership(this.multicast);
    this._socket.setMulticastTTL(this.multicastTTL);

    this.destination = this.multicast;
  } else {
    // default to using broadcast if multicast address is not specified.
    this._socket.setBroadcast(true);

    // TODO: get the default broadcast address from os.networkInterfaces() (not currently returned)
    this.destination = this.broadcast || '255.255.255.255';
  }
  process.nextTick(this.emit.bind(this, 'listening'));
};

var close = function() {
  this.emit('end');
};

var finish = function() {
  this._socket.close();
};

var message = function(data, rinfo) {
  data._info = rinfo;
  this.push(data);
};

UDPStream.prototype._read = function(size) {
  thumbs.twiddle();
};

UDPStream.prototype._write = function(chunk, encoding, callback) {
  if (this.scope)
    for (var i = 0; i < this.scope.length; i++)
      this.scope[i].push(chunk);
  else
    this._socket.send(chunk, 0, chunk.length, this.port, this.destination);
  callback();
};

var encryptionDefaults = {
  algorithm: 'aes256',
  key: null,
  iv: null
};

// insecure--can't pad
var EncryptStream = function EncryptStream(options) {
  if (!(this instanceof EncryptStream))
    return new EncryptStream(options);

  Transform.call(this);

  _.options(this, options, encryptionDefaults);
};

util.inherits(EncryptStream, Transform);

var mkCipher = function(self) {
  if (self.iv)
    return crypto.createCipheriv(self.algorithm, self.key, self.iv);
  return crypto.createCipher(self.algorithm, self.key);
};

EncryptStream.prototype._transform = function(chunk, encoding, callback) {
  var cipher = mkCipher(this), buf = new Array(2);
  buf[0] = cipher.update(chunk, encoding);
  buf[1] = cipher.final();
  /*if (buf[1].length > 0)
    this.push();
  else
    this.push(buf[0]);*/
  // workaround for rinfo
  var toPush;
  if (buf[1].length > 0)
    toPush = Buffer.concat(buf, buf[0].length + buf[1].length);
  else
    toPush = buf[0];
  toPush._info = chunk._info;
  this.push(toPush);
  callback();
};

var DecryptStream = function DecryptStream(options) {
  if (!(this instanceof DecryptStream))
    return new DecryptStream(options);

  Transform.call(this);

  _.options(this, options, encryptionDefaults);
};

util.inherits(DecryptStream, Transform);

var mkDecipher = function(self) {
  if (self.iv)
    return crypto.createDecipheriv(self.algorithm, self.key, self.iv);
  return crypto.createDecipher(self.algorithm, self.key);
};

DecryptStream.prototype._transform = function(chunk, encoding, callback) {
  var decipher = mkDecipher(this), buf = new Array(2);
  buf[0] = decipher.update(chunk, encoding);
  buf[1] = decipher.final();
  /*if (buf[1].length > 0)
    this.push(Buffer.concat(buf, buf[0].length + buf[1].length));
  else
    this.push(buf[0]);*/
  // workaround for rinfo
  var toPush;
  if (buf[1].length > 0)
    toPush = Buffer.concat(buf, buf[0].length + buf[1].length);
  else
    toPush = buf[0];
  toPush._info = chunk._info;
  this.push(toPush);
  callback();
};

var wrapDefaults = {
  blockSize: 1500
};

// TODO: this should really send a primary header in the first block
// then just include an id in the rest
// TODO: checksum should be per-block
var WrapStream = function WrapStream(options) {
  if (!(this instanceof WrapStream))
    return new WrapStream(options);

  Transform.call(this);

  _.options(this, options, wrapDefaults);
};

util.inherits(WrapStream, Transform);

WrapStream.prototype._transform = function(chunk, encoding, callback) {
  // generate the header
  var header = new Buffer(28);
  // allow the endpoint to filter out bad data
  header.write('WRAP', 0, 4);
  // assign the header a random id
  crypto.randomBytes(16).copy(header, 4);
  // write the checksum for the chunk
  var check = crc32.signed(chunk);
  header.writeInt32BE(check, 20, true);
  // include the length of the entire chunk
  header.writeUInt32BE(chunk.length, 24, true);

  // calculate the size of the messages in the blocks, and the number of blocks
  var messageSize = this.blockSize - 36;
  var count = Math.ceil(chunk.length / messageSize);

  // generate the blocks
  for (var i = 0; i < count; i++) {
    var length = i + 1 === count ? chunk.length % messageSize : messageSize;
    var block = new Buffer(length + 36);
    var offset = i * messageSize;
    header.copy(block);
    block.writeUInt32BE(block.length, 28, true);
    block.writeUInt32BE(offset, 32, true);
    chunk.copy(block, 36, offset, offset + length);
    // workaround
    block._info = chunk._info;
    this.push(block);
  }

  // notify Transform that we've processed the chunk
  callback();
};

var unwrapDefaults = {
  blockSize: wrapDefaults.blockSize,
  blockTimeout: 5000,
  ignoreDataErrors: null
};

var UnwrapStream = function UnwrapStream(options) {
  if (!(this instanceof UnwrapStream))
    return new UnwrapStream(options);

  Transform.call(this);

  _.options(this, options, unwrapDefaults);

  this._blocks = {};
  this._flushCallback = null;
};

util.inherits(UnwrapStream, Transform);

// use blockerror event instead of special error event?
// blockerrors do not cause the stream to malfunction
var wrapError = function(ignoreDataErrors, error, callback) {
  if (ignoreDataErrors)
    callback();
  else
    callback(new Error(error));
};

var construct = function(header, data) {
  var block = this._blocks[header.id];
  if (block) {
    block.found++;
    clearTimeout(block.sleep);
  } else {
    block = this._blocks[header.id] = {
      found: 1,
      check: header.check,
      blocks: Math.ceil(header.length / (this.blockSize - 36)),
      buffer: new Buffer(header.length)
    };
    // workaround
    block.buffer._info = data._info;
  }
  data.copy(block.buffer, header.offset);
  if (block.found === block.blocks) {
    delete this._blocks[header.id];
    var check = crc32.signed(block.buffer);
    if (check === block.check)
      this.push(block.buffer);
    else if (!this.ignoreDataErrors)
      this.emit('error', new Error('block checksum failed'));
  } else {
    block.sleep = setTimeout(kill.bind(this, header.id), this.blockTimeout);
  }
};

var kill = function(id) {
  var block = this._blocks[id];
  if (block) {
    delete this._blocks[id];
    if (!this.ignoreDataErrors)
      this.emit('error', new Error('block timed out'));
    if (this._flushCallback && _.size(this._blocks) === 0)
      this._flushCallback();
  }
};

// TODO: wrap in nextTick--not done automatically
UnwrapStream.prototype._transform = function(chunk, encoding, callback) {
  if (chunk.length <= 36)
    return wrapError(this.ignoreDataErrors, 'block is too small', callback);
  if (chunk.toString(null, 0, 4) !== 'WRAP')
    return wrapError(this.ignoreDataErrors, 'block not a wrapped buffer', callback);
  var header = {};
  header.id = chunk.toString('hex', 4, 20);
  header.check = chunk.readInt32BE(20, true);
  header.length = chunk.readUInt32BE(24, true);
  header.blockLength = chunk.readUInt32BE(28, true);
  header.offset = chunk.readUInt32BE(32, true);
  if (chunk.length < header.blockLength)
    return wrapError(this.ignoreDataErrors, 'block incomplete', callback);
  var block = chunk.slice(36, 36 + header.blockLength);
  // workaround
  block._info = chunk._info;
  construct.call(this, header, block);
  if (chunk.length > header.blockLength) {
    // workaround
    var nextChunk = chunk.slice(header.blockLength);
    nextChunk._info = chunk._info;
    this._transform(nextChunk, null, callback);
  } else
    callback();
};

UnwrapStream.prototype._flush = function(callback) {
  if (_.size(this._blocks) === 0)
    return callback();
  var hit = false;
  this._flushCallback = function() {
    if (!hit) {
      clearTimeout(ultimate);
      callback();
    }
    hit = true;
  };
  var ultimate = setTimeout(this._flushCallback, this.blockTimeout);
};

var jsonDefaults = {
  ignoreDataErrors: null
};

// this json stream is synchronous
var JSONEncodeStream = function JSONEncodeStream(options) {
  if (!(this instanceof JSONEncodeStream))
    return new JSONEncodeStream();

  Transform.call(this, {objectMode: true});

  this.ignoreDataErrors = (options && options.ignoreDataErrors) || jsonDefaults.ignoreDataErrors;
};

util.inherits(JSONEncodeStream, Transform);

JSONEncodeStream.prototype._transform = function(obj, encoding, callback) {
  var data;
  try {
    data = JSON.stringify(obj);
  } catch (e) {
    return callback(this.ignoreDataErrors ? null : e);
  }
  // workaround
  data = new Buffer(data, 'utf-8');
  data._info = obj._info;
  this.push(data);
  callback();
};

// this json stream is synchronous
var JSONDecodeStream = function JSONDecodeStream(options) {
  if (!(this instanceof JSONDecodeStream))
    return new JSONDecodeStream();

  Transform.call(this, {objectMode: true});

  this.ignoreDataErrors = (options && options.ignoreDataErrors) || jsonDefaults.ignoreDataErrors;
};

util.inherits(JSONDecodeStream, Transform);

JSONDecodeStream.prototype._transform = function(chunk, encoding, callback) {
  var data = chunk.toString('utf-8');
  try {
    data = JSON.parse(data);
  } catch (e) {
    return callback(this.ignoreDataErrors ? null : e);
  }
  // workaround
  data._info = chunk._info;
  this.push(data);
  callback();
};

exports.UDPStream = UDPStream;
exports.EncryptStream = EncryptStream;
exports.DecryptStream = DecryptStream;
exports.WrapStream = WrapStream;
exports.UnwrapStream = UnwrapStream;
exports.JSONEncodeStream = JSONEncodeStream;
exports.JSONDecodeStream = JSONDecodeStream;
