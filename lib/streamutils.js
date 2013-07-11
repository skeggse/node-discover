var Transform = require('stream').Transform;
var util = require('util');
var _ = require('underscore');

// for testing the unwrapstream
var MergeStream = function() {
  if (!(this instanceof MergeStream))
    return new MergeStream();

  Transform.call(this);

  this._buffer = null;
};

util.inherits(MergeStream, Transform);

MergeStream.prototype._transform = function(chunk, encoding, callback) {
  if (this._buffer) {
    chunk = Buffer.concat([this._buffer, chunk], chunk.length + this._buffer.length);
    this.push(chunk);
    this._buffer = null;
  } else
    this._buffer = chunk;
  callback();
};

MergeStream.prototype._flush = function(callback) {
  if (this._buffer) {
    this.push(this._buffer);
    this._buffer = null;
  }
  callback();
};

// for testing the unwrapstream
var ReorderStream = function() {
  if (!(this instanceof ReorderStream))
    return new ReorderStream();

  Transform.call(this);

  this._buffers = [];
};

util.inherits(ReorderStream, Transform);

ReorderStream.prototype._transform = function(chunk, encoding, callback) {
  var index;
  if (this._buffers.length < 4) {
    index = _.random(0, this._buffers.length);
    if (index === this._buffers.length)
      this._buffers.push(chunk);
    else
      this._buffers.splice(index, 0, chunk);
  } else {
    index = _.random(0, this._buffers.length - 1);
    this.push(this._buffers[index]);
    this._buffers[index] = chunk;
  }
  callback();
};

ReorderStream.prototype._flush = function(callback) {
  var buffers = _.shuffle(this._buffers);
  for (var i = 0; i < buffers.length; i++)
    this.push(buffers[i]);
  this._buffers = [];
  callback();
};

// for testing the unwrapstream
var LossyStream = function(total) {
  if (!(this instanceof LossyStream))
    return new LossyStream();

  Transform.call(this);
};

util.inherits(LossyStream, Transform);

LossyStream.prototype._transform = function(chunk, encoding, callback) {
  if (Math.random() > 0.5)
    this.push(chunk);
  callback();
};

exports.MergeStream = MergeStream;
exports.ReorderStream = ReorderStream;
exports.LossyStream = LossyStream;
