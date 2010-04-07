/**
 * Copyright 2009 Google Inc.
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 *      http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileOverview A collection of core JavaScript utilities.
 */

/**
 * Iterator convenience for JavaScript Objects.
 *
 * Note that if func returns false, the iteration will be immediately terminated.
 * (Returning undefined, or not specifying a return type, does not terminate the iteration).
 *
 * @example
var pastels = {
  red: "#fcc",
  green: "#cfc",
  blue: "#ccf"
};
eachProperty(pastels, function(key, value) {
  print(DIV({style: 'background: '+value+';'}, key));
});
 *
 * @param {object} obj The object over which to iterate.
 * @param {function} func The function to run on each [key,value] pair.
 */
function eachProperty(obj, func) {
  var r;
  for (k in obj) {
    if (!obj.hasOwnProperty || obj.hasOwnProperty(k)) {
      r = func(k,obj[k]);
      if (r === false) {
        break;
      }
    }
  }
}

/**
 * Douglas Crockford's "object" function for prototypal inheritance, taken from
 * http://javascript.crockford.com/prototypal.html
 *
 * @param {object} parent The parent object.
 * @return {object} A new object whose prototype is parent.
 */
function object(parent) {
  function f() {};
  f.prototype = parent;
  return new f();
}

/**
 * Creates an array of the properties of <code>obj</code>,
 * <em>not</em> including built-in or inherited properties.  If no
 * argument is given, applies to the global object.
 *
 * @example
// Prints "abc"
keys({a: 1, b: 2, c: 3}).forEach(function(k) {
  print(k);
}
 *
 * @example
// Prints all the functions and object members of the global "appjet" object,
// one per line.
print(keys(appjet).join('\n'));
 *
 * @param {object} obj
 */
function keys(obj) {
  var array = [];
  var o = obj;
  if (o == undefined) {
    o = this;
  }
  for(var k in o) {
    if (!obj.hasOwnProperty || o.hasOwnProperty(k)) {
      array.push(k);
    }
  }
  return array;
}

/**
 * Comparator that returns -1, +1, or 0 depending on whether a &lt; b, or a &gt; b, or
 * neither, respectively.
 * @param {object} a
 * @param {object} b
 * @return {number} -1, 0, or +1
 */
function cmp(a,b) {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

function arrayToSet(arr) {
  var set = {};
  arr.forEach(function(x) {
    set[x] = true;
  });
  return set;
}

function mergeArrays(mergeFunction, a1, a2, etc) {
  var len = a1.length;
  var arrays = Array.prototype.slice.call(arguments, 1);
  for (var i = 0; i < arrays.length; ++i) {
    if (arrays[i].length != len) {
      return;
    }
  }
  out = [];
  for (var i = 0; i < a1.length; ++i) {
    out.push(mergeFunction.apply(this, arrays.map(function(array) { return array[i]; })));
  }
  return out;
}

function debug(obj) {
  if (typeof(obj) == 'object') {
    var ret = [];
    if (obj) {
      eachProperty(obj, function(k, v) {
        ret.push(k+" -> "+debug(v));
      });
      return '['+ret.join(", ")+']';
    } else {
      return String(obj);
    }
  } else {
    return String(obj);
  }
}

/**
 * Create a scala function out of the given JS function.
 */
function scalaFn(nargs, f) {
  if (typeof(f) == 'function') {
    return new Packages.scala['Function'+nargs]({
      apply: f
    });
  } else {
    return new Packages.scala['Function'+nargs]({
      apply: function() { return f; }
    })
  }
}

function scalaF0(f) {
  return scalaFn(0, f);
}

function scalaF1(f) {
  return scalaFn(1, f);
}

/** 
 * Some bonus functions for functional programming.
 */
function f_curry(thisPtr, f, arg1, arg2, etc) {
  var curriedArgs = Array.prototype.slice.call(arguments, 2);
  return function() {
    var args = Array.prototype.slice.call(arguments, 0);
    return f.apply(thisPtr, curriedArgs.concat(args));
  }
}

function f_limitArgs(thisPtr, f, n) {
  return function() {
    var args = Array.prototype.slice.call(arguments, 0, n);
    return f.apply(thisPtr, args);
  }
}



