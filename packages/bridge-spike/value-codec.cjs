'use strict';

const VERSION = 1;

function encodeValue(value, seen = new Set()) {
  if (value === undefined) return { t: 'undefined' };
  if (value === null) return { t: 'null' };
  if (typeof value === 'boolean') return { t: 'boolean', v: value };
  if (typeof value === 'string') return { t: 'string', v: value };
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return { t: 'number', v: 'nan' };
    if (value === Infinity) return { t: 'number', v: 'infinity' };
    if (value === -Infinity) return { t: 'number', v: '-infinity' };
    if (Object.is(value, -0)) return { t: 'number', v: '-0' };
    return { t: 'number', v: value };
  }
  if (typeof value === 'bigint') return { t: 'bigint', v: value.toString(10) };
  if (typeof value === 'function' || typeof value === 'symbol') {
    throw new TypeError(`Unsupported bridge value type: ${typeof value}`);
  }
  if (seen.has(value)) throw new TypeError('Cyclic bridge values are unsupported');
  seen.add(value);
  try {
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) throw new TypeError('Invalid Date bridge values are unsupported');
      return { t: 'date', v: value.toISOString() };
    }
    if (Array.isArray(value)) {
      return { t: 'array', v: value.map(item => encodeValue(item, seen)) };
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('Only plain objects are supported by the bridge codec');
    }
    return {
      t: 'object',
      v: Object.keys(value).map(key => [key, encodeValue(value[key], seen)]),
    };
  } finally {
    seen.delete(value);
  }
}

function decodeValue(node) {
  if (!node || typeof node !== 'object' || typeof node.t !== 'string') {
    throw new TypeError('Invalid tagged bridge value');
  }
  switch (node.t) {
    case 'undefined': return undefined;
    case 'null': return null;
    case 'boolean': return node.v;
    case 'string': return node.v;
    case 'number':
      if (node.v === 'nan') return NaN;
      if (node.v === 'infinity') return Infinity;
      if (node.v === '-infinity') return -Infinity;
      if (node.v === '-0') return -0;
      if (typeof node.v !== 'number') throw new TypeError('Invalid tagged number');
      return node.v;
    case 'bigint': return BigInt(node.v);
    case 'date': return new Date(node.v);
    case 'array': return node.v.map(decodeValue);
    case 'object': {
      const result = {};
      for (const pair of node.v) {
        if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string') {
          throw new TypeError('Invalid tagged object entry');
        }
        Object.defineProperty(result, pair[0], {
          value: decodeValue(pair[1]),
          enumerable: true,
          configurable: true,
          writable: true,
        });
      }
      return result;
    }
    default: throw new TypeError(`Unknown tagged bridge value: ${node.t}`);
  }
}

exports.encodeBridgeValue = function encodeBridgeValue(value) {
  return JSON.stringify({ v: VERSION, value: encodeValue(value) });
};

exports.decodeBridgeValue = function decodeBridgeValue(payload) {
  const envelope = JSON.parse(payload);
  if (!envelope || envelope.v !== VERSION) throw new TypeError('Unsupported bridge value version');
  return decodeValue(envelope.value);
};
