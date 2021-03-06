'use strict';

var domain;

function EventEmitter() {
  EventEmitter.init.call(this);
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.usingDomains = false;

EventEmitter.prototype.domain = undefined;
EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

EventEmitter.init = function() {
  this.domain = null;
  if (EventEmitter.usingDomains) {
    // if there is an active domain, then attach to it.
    domain = domain || require('domain');
    if (domain.active && !(this instanceof domain.Domain)) {
      this.domain = domain.active;
    }
  }

  if (!this._events || this._events === Object.getPrototypeOf(this)._events)
    this._events = {};

  this._maxListeners = this._maxListeners || undefined;
};

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function setMaxListeners(n) {
  if (typeof n !== 'number' || n < 0 || isNaN(n))
    throw new TypeError('n must be a positive number');
  this._maxListeners = n;
  return this;
};

function $getMaxListeners(that) {
  if (that._maxListeners === undefined)
    return EventEmitter.defaultMaxListeners;
  return that._maxListeners;
}

EventEmitter.prototype.getMaxListeners = function getMaxListeners() {
  return $getMaxListeners(this);
};

// These standalone emit* functions are used to optimize calling of event
// handlers for fast cases because emit() itself often has a variable number of
// arguments and can be deoptimized because of that. These functions always have
// the same number of arguments and thus do not get deoptimized, so the code
// inside them can execute faster.
function emitNone(handler, isFn, self) {
  if (isFn)
    handler.call(self);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self);
  }
}
function emitOne(handler, isFn, self, arg1) {
  if (isFn)
    handler.call(self, arg1);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1);
  }
}
function emitTwo(handler, isFn, self, arg1, arg2) {
  if (isFn)
    handler.call(self, arg1, arg2);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1, arg2);
  }
}
function emitThree(handler, isFn, self, arg1, arg2, arg3) {
  if (isFn)
    handler.call(self, arg1, arg2, arg3);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1, arg2, arg3);
  }
}

EventEmitter.prototype.emit = function emit(type) {
  var er, handler, len, args, i, listeners, events, domain;
  var needDomainExit = false;

  events = this._events;
  if (!events)
    events = this._events = {};

  domain = this.domain;

  // If there is no 'error' event listener then throw.
  if (type === 'error' && !events.error) {
    er = arguments[1];
    if (domain) {
      if (!er)
        er = new Error('Uncaught, unspecified "error" event.');
      er.domainEmitter = this;
      er.domain = domain;
      er.domainThrown = false;
      domain.emit('error', er);
    } else if (er instanceof Error) {
      throw er; // Unhandled 'error' event
    } else {
      throw Error('Uncaught, unspecified "error" event.');
    }
    return false;
  }

  handler = events[type];

  if (!handler)
    return false;

  if (domain && this !== process) {
    domain.enter();
    needDomainExit = true;
  }

  var isFn = typeof handler === 'function';
  len = arguments.length;
  switch (len) {
    // fast cases
    case 1:
      emitNone(handler, isFn, this);
      break;
    case 2:
      emitOne(handler, isFn, this, arguments[1]);
      break;
    case 3:
      emitTwo(handler, isFn, this, arguments[1], arguments[2]);
      break;
    case 4:
      emitThree(handler, isFn, this, arguments[1], arguments[2], arguments[3]);
      break;
    // slower
    default:
      args = new Array(len - 1);
      for (i = 1; i < len; i++)
        args[i - 1] = arguments[i];
      if (isFn)
        handler.apply(this, args);
      else {
        len = handler.length;
        listeners = arrayClone(handler, len);
        for (i = 0; i < len; ++i)
          listeners[i].apply(this, args);
      }
  }

  if (needDomainExit)
    domain.exit();

  return true;
};

EventEmitter.prototype.addListener = function addListener(type, listener) {
  var m;
  var events;
  var existing;

  if (typeof listener !== 'function')
    throw new TypeError('listener must be a function');

  events = this._events;
  if (!events)
    events = this._events = {};
  else {
    // To avoid recursion in the case that type === "newListener"! Before
    // adding it to the listeners, first emit "newListener".
    if (events.newListener) {
      this.emit('newListener', type,
                typeof listener.listener === 'function' ?
                listener.listener : listener);
    }
    existing = events[type];
  }

  if (!existing)
    // Optimize the case of one listener. Don't need the extra array object.
    existing = events[type] = listener;
  else if (typeof existing !== 'function')
    // If we've already got an array, just append.
    existing.push(listener);
  else
    // Adding the second element, need to change to array.
    existing = events[type] = [existing, listener];

  // Check for listener leak
  if (typeof existing !== 'function' && !existing.warned) {
    m = $getMaxListeners(this);
    if (m && m > 0 && existing.length > m) {
      existing.warned = true;
      console.error('(node) warning: possible EventEmitter memory ' +
                    'leak detected. %d %s listeners added. ' +
                    'Use emitter.setMaxListeners() to increase limit.',
                    existing.length, type);
      console.trace();
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function once(type, listener) {
  if (typeof listener !== 'function')
    throw new TypeError('listener must be a function');

  var fired = false;

  function g() {
    this.removeListener(type, g);

    if (!fired) {
      fired = true;
      listener.apply(this, arguments);
    }
  }

  g.listener = listener;
  this.on(type, g);

  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener =
    function removeListener(type, listener) {
      var list, events, position, length, i;

      if (typeof listener !== 'function')
        throw new TypeError('listener must be a function');

      events = this._events;
      if (!events)
        return this;

      list = events[type];
      if (!list)
        return this;

      length = list.length;
      position = -1;

      if (list === listener ||
          (typeof list.listener === 'function' && list.listener === listener)) {
        delete events[type];
        if (events.removeListener)
          this.emit('removeListener', type, listener);

      } else if (typeof list !== 'function') {
        for (i = length; i-- > 0;) {
          if (list[i] === listener ||
              (list[i].listener && list[i].listener === listener)) {
            position = i;
            break;
          }
        }

        if (position < 0)
          return this;

        if (list.length === 1) {
          list.length = 0;
          delete events[type];
        } else {
          spliceOne(list, position);
        }

        if (events.removeListener)
          this.emit('removeListener', type, listener);
      }

      return this;
    };

EventEmitter.prototype.removeAllListeners =
    function removeAllListeners(type) {
      var listeners, events;

      events = this._events;
      if (!events)
        return this;

      // not listening for removeListener, no need to emit
      if (!events.removeListener) {
        if (arguments.length === 0)
          this._events = {};
        else if (events[type])
          delete events[type];
        return this;
      }

      // emit removeListener for all listeners on all events
      if (arguments.length === 0) {
        var keys = Object.keys(events);
        for (var i = 0, key; i < keys.length; ++i) {
          key = keys[i];
          if (key === 'removeListener') continue;
          this.removeAllListeners(key);
        }
        this.removeAllListeners('removeListener');
        this._events = {};
        return this;
      }

      listeners = events[type];

      if (typeof listeners === 'function') {
        this.removeListener(type, listeners);
      } else if (Array.isArray(listeners)) {
        // LIFO order
        while (listeners.length)
          this.removeListener(type, listeners[listeners.length - 1]);
      }
      delete events[type];

      return this;
    };

EventEmitter.prototype.listeners = function listeners(type) {
  var evlistener;
  var ret;
  var events = this._events;

  if (!events)
    ret = [];
  else {
    evlistener = events[type];
    if (!evlistener)
      ret = [];
    else if (typeof evlistener === 'function')
      ret = [evlistener];
    else
      ret = arrayClone(evlistener);
  }

  return ret;
};

EventEmitter.listenerCount = function(emitter, type) {
  var evlistener;
  var ret = 0;
  var events = emitter._events;

  if (events) {
    evlistener = events[type];
    if (typeof evlistener === 'function')
      ret = 1;
    else if (evlistener)
      ret = evlistener.length;
  }

  return ret;
};

// About 1.5x faster than the two-arg version of Array#splice().
function spliceOne(list, index) {
  for (var i = index, k = i + 1, n = list.length; k < n; i += 1, k += 1)
    list[i] = list[k];
  list.pop();
}

function arrayClone(arr, len) {
  var ret;
  if (len === undefined)
    len = arr.length;
  if (len >= 50)
    ret = arr.slice();
  else {
    ret = new Array(len);
    for (var i = 0; i < len; i += 1)
      ret[i] = arr[i];
  }
  return ret;
}
