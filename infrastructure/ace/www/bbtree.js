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


function makeBBTree(transferContents, augment) {

  var nil = [];
  nil.push(nil,nil);
  nil.level = 0;
  var root = nil;
  augment = (augment || (function(n) {}));
  
  function skew(t) {
    if (t != nil && t[0].level == t.level) {
      // rotate right
      var tmp = t;
      t = t[0];
      tmp[0] = t[1];
      t[1] = tmp;
      reaugment(tmp);
      reaugment(t);
    }
    return t;
  }

  function split(t) {
    if (t != nil && t[1][1].level == t.level) {
      // rotate left
      var tmp = t;
      t = t[1];
      tmp[1] = t[0];
      t[0] = tmp;
      t.level++;
      reaugment(tmp);
      reaugment(t);
    }
    return t;
  }

  function reaugment(n) {
    if (n != nil) augment(n);
  }
  
  var self = {};
  
  self.insert = function(compare) {
    var n;
    function recurse(t) {
      if (t == nil) {
	t = [nil,nil];
	t.level = 1;
	n = t;
      }
      else {
	var cmp = compare(t);
	if (cmp < 0) {
	  t[0] = recurse(t[0]);
	}
	else if (cmp > 0) {
	  t[1] = recurse(t[1]);
	}
	t = skew(t);
	t = split(t);
      }
      reaugment(t);
      return t;
    }
    root = recurse(root);
    return n;
  }
  
  self.remove = function(compare) {
    var deleted = nil;
    var last;
    var deletedEqual = false;
    function recurse(t) {
      if (t != nil) {
	last = t;
	var cmp = compare(t);
	if (cmp < 0) {
	  t[0] = recurse(t[0]);
	}
	else {
	  deleted = t;
	  // whether the node called "deleted" is actually a
	  // match for deletion
	  deletedEqual = (cmp == 0);
	  t[1] = recurse(t[1]);
	}
	if (t == last && deleted != nil && deletedEqual) {
	  // t may be same node as deleted
	  transferContents(t, deleted);
	  t = t[1];
	  reaugment(deleted);
	  deleted = nil;
	}
	else {
	  reaugment(t);
	  if (t[0].level < t.level-1 ||
	      t[1].level < t.level-1) {
	    t.level--;
	    if (t[1].level > t.level)
	      t[1].level = t.level;
	    t = skew(t);
	    t[1] = skew(t[1]);
	    t[1][1] = skew(t[1][1]);
	    t = split(t);
	    t[1] = split(t[1]);
	  }
	}
      }
      return t;
    }
    root = recurse(root);
  }

  self.find = function(compare) {
    function recurse(t) {
      if (t == nil) return t;
      var cmp = compare(t);
      if (cmp < 0) {
	return recurse(t[0]);
      }
      else if (cmp > 0) {
	return recurse(t[1]);
      }
      else {
	return t;
      }
    }
    var result = recurse(root);
    return (result != nil && result) || null;
  }

  self.root = function() { return root; }

  self.forEach = function(func) {
    function recurse(t) {
      if (t != nil) {
	recurse(t[0]);
	func(t);
	recurse(t[1]);
      }
    }
    recurse(root);
  }
  
  return self;
}

function makeBBList() {
  var length = 0;
  var totalWidth = 0;

  function _treeSize(n) { return n.size || 0; }
  function _treeWidth(n) { return n.width || 0; }
  function _width(n) { return (n && n.entry && n.entry.width) || 0; }
  
  function _transferContents(a, b) {
    b.key = a.key;
    b.entry = a.entry;
  }
  function _augment(n) {
    n.size = _treeSize(n[0]) + _treeSize(n[1]) + 1;
    n.width = _treeWidth(n[0]) + _treeWidth(n[1]) + _width(n);
  }

  var keyToEntry = {};
  
  var bb = makeBBTree(transferContents, augment);

  function makeIndexComparator(indexFunc) {
    var curIndex = _treeSize(bb.root()[0]);
    return function (n) {
      var dir = indexFunc(curIndex, n);
      if (dir < 0) {
	curIndex -= _treeSize(n[0][1]) + 1;
      }
      else if (dir >= 0) {
	curIndex += _treeSize(n[1][0]) + 1;      
      }
      return dir;
    }
  }

  function makeWidthComparator(widthFunc) {
    var curIndex = _treeWidth(bb.root()[0]);
    return function (n) {
      var dir = indexFunc(curIndex, n);
      if (dir < 0) {
	curIndex -= _treeWidth(n[0][1]) + _width(n[0]);
      }
      else if (dir >= 0) {
	curIndex += _treeWidth(n[1][0]) + _width(n);
      }
      return dir;
    }
  }

  function numcomp(a,b) { if (a < b) return -1; if (a > b) return 1; return 0; }
  
  function removeByIndex(idx) {
    var entry;
    bb.remove(makeComparator(function (curIndex, n) {
      var cmp = numcomp(idx, curIndex);
      if (cmp == 0) entry = n.entry;
      return cmp;
    }));
    return entry;
  }

  function insertAtIndex(idx, entry) {
    var newNode = bb.insert(makeComparator(function (curIndex) {
      if (idx <= curIndex) return -1;
      return 1;
    }));
    newNode.entry = entry;
    return newNode;
  }

  var entriesByKey = {};
  
  var self = {
    splice: function (start, deleteCount, newEntryArray) {
      for(var i=0;i<deleteCount;i++) {
	var oldEntry = removeByIndex(start);
	length--;
	totalWidth -= (entry.width || 0);
	delete entriesByKey[oldEntry.key];
      }
      for(var i=0;i<newEntryArray.length;i++) {
	var entry = newEntryArray[i];
	var newNode = insertAtIndex(start+i, entry);
	length++;
	totalWidth += (entry.width || 0);
	entriesByKey[entry.key] = entry;
      }
    },
    next: function (entry) {
      
    }
  };

  return self;
}

/*function size(n) {
  return n.size || 0;
}

var a = makeBBTree(function (a,b) {
  b.data = a.data;
},
		   function (n) {
		     n.size = size(n[0]) + size(n[1]) + 1;
		   });

var arrayRep = [];

function makeComparator(indexFunc) {
  var curIndex = size(a.root()[0]);
  return function (n) {
    var dir = indexFunc(curIndex);
    if (dir < 0) {
      curIndex -= size(n[0][1]) + 1;
    }
    else if (dir >= 0) {
      curIndex += size(n[1][0]) + 1;      
    }
    return dir;
  }
}

function insert(idx, data) {
  arrayRep.splice(idx, 0, data);
  var newNode = a.insert(makeComparator(function (curIndex) {
    if (idx <= curIndex) return -1;
    return 1;
  }));
  newNode.data = data;
  checkRep();
}

function remove(idx) {
  arrayRep.splice(idx, 1);
  a.remove(makeComparator(function (curIndex) {
    return numcomp(idx, curIndex);
  }));
  checkRep();
}

function genArray() {
  var array = [];
  a.forEach(function (n) { array.push(n.data); });
  return array;
}

function checkRep() {
  var array2 = genArray();
  var str1 = array2.join(',');
  var str2 = arrayRep.join(',');
  if (str1 != str2) console.error(str1+" != "+str2);

  a.forEach(function(n) {
    if (size(n) != size(n[0]) + size(n[1]) + 1) {
      console.error("size of "+n.data+" is wrong");
    }
  });
}

function print() {
  console.log(genArray().join(','));
}

insert(0,1);
insert(0,2);
insert(0,3);
insert(1,4);
insert(4,5);
insert(0,6);
print();

function numcomp(a,b) { if (a < b) return -1; if (a > b) return 1; return 0; }
*/
/*var tree = makeBBTree(function(a, b) { b.key = a.key; });
function insert(x) { tree.insert(function(n) { return numcomp(x, n.key) }).key = x; }
function remove(x) { tree.remove(function (n) { return numcomp(x, n.key); }); }
function contains(x) { return !! tree.find(function (n) { return numcomp(x, n.key); }); }

function print() {
  function recurse(t) {
    if (! ('key' in t)) return '';
    return '('+recurse(t[0])+','+t.key+','+recurse(t[1])+')';
  }
  return recurse(tree.root());
}


insert(2);
insert(1);
insert(8);
insert(7);
console.log(print());
insert(6);
insert(3);
insert(5);
insert(4);
console.log(print());
remove(2);
remove(1);
remove(8);
remove(7);
console.log(print());
//remove(6);
//remove(3);
//remove(5);
//remove(4);
//console.log(print());
*/