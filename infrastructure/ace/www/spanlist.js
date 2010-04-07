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


function newSpanList() {
  function encodeInt(num) {
    num = num & 0x1fffffff;
    // neither 16-bit char can be 0x0001 or mistakable for the other
    return String.fromCharCode(((num >> 15) & 0x3fff) | 0x4000) +
      String.fromCharCode((num & 0x7fff) | 0x8000);
  }
  function decodeInt(str) {
    return ((str.charCodeAt(0) & 0x3fff) << 15) | (str.charCodeAt(1) & 0x7fff);
  }
  function indexOfInt(str, n) {
    var result = str.indexOf(encodeInt(n));
    if (result < 0) return result;
    return result/2;
  }
  function intAt(str, i) {
    var idx = i*2;
    return decodeInt(str.substr(idx, 2));
  }
  function numInts(str) { return str.length/2; }
  function subrange(str, start, end) {
    return str.substring(start*2, end*2);
  }
  var nil = "\1\1";
  var repeatNilCache = [''];
  function repeatNil(times) {
    while (times >= repeatNilCache.length) {
      repeatNilCache.push(repeatNilCache[repeatNilCache.length-1] + nil);
    }
    return repeatNilCache[times];
  }
  function indexOfNonnil(str, start) {
    startIndex = (start || 0)*2;
    var nonnilChar = /[^\1]/g;
    nonnilChar.lastIndex = startIndex;
    var result = nonnilChar.exec(str);
    if (! result) {
      return str.length/2;
    }
    return (nonnilChar.lastIndex - 1)/2;
  }
  function intSplice(str, start, delCount, newStr) {
    return str.substring(0, start*2) + newStr + str.substring((start+delCount)*2);
  }

  function entryWidth(entry) {
    if ((typeof entry) == "number") return entry;
    return (entry && entry.width) || 1;
  }

  // "func" is a function over 0..(numItems-1) that is monotonically
  // "increasing" with index (false, then true).  Finds the boundary
  // between false and true, a number between 0 and numItems inclusive.
  function binarySearch(numItems, func) {
    if (numItems < 1) return 0;
    if (func(0)) return 0;
    if (! func(numItems-1)) return numItems;
    var low = 0; // func(low) is always false
    var high = numItems-1; // func(high) is always true
    while ((high - low) > 1) {
      var x = Math.floor((low+high)/2); // x != low, x != high
      if (func(x)) high = x;
      else low = x;
    }
    return high;
  }
  
  var NEXT_ID = 1;
  var entryList = ""; // e.g. 2, 4, 3, 6
  var charList = ""; // e.g. nil, nil, nil, 2, nil, 4, nil, nil, nil, nil, 3, 6
  var keyToId = {};
  var idToKey = {};
  var idToEntry = {};
  var idToNextId = {};
  var idToPrevId = {};
  var length = 0;
  var totalWidth = 0;

  function idAtIndex(i) { return intAt(entryList, i); }
  function indexOfId(id) { return indexOfInt(entryList, id); }
  function offsetOfId(id) {
    if (! id) return totalWidth;
    var entry = idToEntry[id];
    var wid = entryWidth(entry);
    var lastCharLoc = indexOfInt(charList, id);
    return lastCharLoc + 1 - wid;
  }
  function idAtOffset(n) {
    return intAt(charList, indexOfNonnil(charList, n));
  }
  
  var self = {
    length: function() { return length; },
    totalWidth: function() { return totalWidth; },
    next: function (entryOrKey) {
      if ((typeof entryOrKey) == "object") {
	var entry = entryOrKey;
	var id = idToNextId[keyToId[entry.key]];
	if (id) return idToEntry[id];
	return null;
      }
      else {
	var k = entryOrKey;
	var id = idToNextId[keyToId[k]];
	if (id) return idToKey[id];
	return null;
      }
    },
    prev: function (entryOrKey) {
      if ((typeof entryOrKey) == "object") {
	var entry = entryOrKey;
	var id = idToPrevId[keyToId[entry.key]];
	if (id) return idToEntry[id];
	return null;
      }
      else {
	var k = entryOrKey;
	var id = idToPrevId[keyToId[k]];
	if (id) return idToKey[id];
	return null;
      }
    },
    atKey: function (k) { return idToEntry[keyToId[k]]; },
    atIndex: function (i) { return idToEntry[idAtIndex(i)]; },
    keyAtIndex: function(i) { return idToKey[idAtIndex(i)]; },
    keyAtOffset: function(n) { return idToKey[idAtOffset(n)]; },
    containsKey: function (k) { return !! keyToId[k]; },
    indexOfKey: function (k) { return indexOfId(keyToId[k]); },
    indexOfEntry: function (entry) { return self.indexOfKey(entry.key); },
    setKeyWidth: function (k, width) {
      var id = keyToId[k];
      var charStart = offsetOfId(id);
      var oldWidth = entryWidth(idToEntry[id]);
      var toDelete = 0;
      var toInsert = 0;
      if (width < oldWidth) toDelete = oldWidth - width;
      else if (width > oldWidth) toInsert = width - oldWidth;
      charList = intSplice(charList, charStart, toDelete, repeatNil(toInsert));      
      totalWidth += (width - oldWidth);
    },
    setEntryWidth: function (entry, width) {
      return self.setKeyWidth(entry.key, width);
    },
    getEntryWidth: function (entry) {
      return entryWidth(entry);
    },
    getKeyWidth: function (k) {
      return entryWidth(idToEntry[keyToId[k]]);
    },
    offsetOfKey: function(k) { return offsetOfId(keyToId[k]); },
    offsetOfEntry: function(entry) { return self.offsetOfKey(entry.key); },
    offsetOfIndex: function (i) {
      if (i < 0) return 0;
      else if (i >= length) {
	return totalWidth;
      }
      else {
	return offsetOfId(idAtIndex(i));
      }
    },
    atOffset: function (n) {
      return idToEntry[idAtOffset(n)];
    },
    indexOfOffset: function (n) {
      if (n < 0) return 0;
      else if (n >= totalWidth) return length;
      return indexOfId(idAtOffset(n));
    },
    search: function(entryFunc) {
      return binarySearch(length, function (i) {
	return entryFunc(idToEntry[idAtIndex(i)]);
      });
    },
    push: function(entry, optKey) {
      self.splice(length, 0, [entry], (optKey && [optKey]));
    },
    // entries can be objects with a 'key' property, possibly a 'width' property,
    // and any other properties;  OR they can be just a width number, for an
    // ultra-light-weight representation.  In the latter case the key array is
    // used to get the keys.  Some functions become useless with this usage, i.e.
    // the ones that use an entry for identity.
    splice: function (start, deleteCount, newEntryArray, optKeyArray) {
      var charStart = self.offsetOfIndex(start);
      var charsToDelete = 0;
      var idBefore = ((start == 0) ? null : intAt(entryList, start-1));
      // idAfter is mutated into id of node following deleted nodes
      var idAfter = ((start == length) ? null : (idBefore ? idToNextId[idBefore] :
						 intAt(entryList, start)));
      if (deleteCount > 0) {
	var deleteId = idAfter;
	for(var i=0;i<deleteCount;i++) {
	  var nextId = idToNextId[deleteId];
	  var entry = idToEntry[deleteId];
	  var wid = entryWidth(entry);
	  delete keyToId[idToKey[deleteId]];
	  delete idToKey[deleteId];
	  delete idToEntry[deleteId];
	  delete idToNextId[deleteId];
	  delete idToPrevId[deleteId];
	  length--;
	  totalWidth -= wid;
	  charsToDelete += wid;
	  deleteId = nextId;
	}
	idAfter = (deleteId || null);
      }
      var newChars = [];
      var newIds = [];
      var prevId = idBefore;
      if (newEntryArray && newEntryArray.length > 0) {
	for(var i=0,n=newEntryArray.length; i<n; i++) {
	  var entry = newEntryArray[i];
	  var newId = (NEXT_ID++);
	  var encId = encodeInt(newId);
	  newIds.push(encId);
	  var wid = entryWidth(entry);
	  newChars.push(repeatNil(wid-1), encId);
	  var key = (optKeyArray ? optKeyArray[i] : entry.key);
	  keyToId[key] = newId;
	  idToKey[newId] = key;
	  idToEntry[newId] = entry;
	  if (prevId) {
	    idToNextId[prevId] = newId;
	    idToPrevId[newId] = prevId;
	  }
	  prevId = newId;
	  length++;
	  totalWidth += wid;
	}
	if (prevId && idAfter) {
	  idToNextId[prevId] = idAfter;
	  idToPrevId[idAfter] = prevId;
	}
      }
      else {
	if (idBefore && idAfter) {
	  idToNextId[idBefore] = idAfter;
	  idToPrevId[idAfter] = idBefore;
	}
	else if (idBefore) delete idToNextId[idBefore];
	else if (idAfter) delete idToPrevId[idAfter];
      }
      entryList = intSplice(entryList, start, deleteCount, newIds.join(''));
      charList = intSplice(charList, charStart, charsToDelete, newChars.join(''));
      
      if (length > 0) {
	// checkrep
	if (idToPrevId[idAtIndex(0)]) console.error("a");
	if (idToNextId[idAtIndex(length-1)]) console.error("b");
	for(var i=0;i<length-1;i++) {
	  if (idToNextId[idAtIndex(i)] != idAtIndex(i+1)) console.error("c"+i);
	}
	for(var i=1;i<length;i++) {
	  if (idToPrevId[idAtIndex(i)] != idAtIndex(i-1)) console.error("d"+i);
	}
      }
    }
  };

  return self;
}

