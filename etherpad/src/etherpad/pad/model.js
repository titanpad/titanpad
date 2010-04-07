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

import("fastJSON");
import("sqlbase.sqlbase");
import("sqlbase.sqlcommon");
import("sqlbase.sqlobj");
import("timer");
import("sync");

import("etherpad.collab.ace.easysync2.{Changeset,AttribPool}");
import("etherpad.log");
import("etherpad.pad.padevents");
import("etherpad.pad.padutils");
import("etherpad.pad.dbwriter");
import("etherpad.pad.pad_migrations");
import("etherpad.pad.pad_security");
import("etherpad.collab.collab_server");
import("cache_utils.syncedWithCache");
jimport("net.appjet.common.util.LimitedSizeMapping");

jimport("java.lang.System.out.println");

jimport("java.util.concurrent.ConcurrentHashMap");
jimport("net.appjet.oui.GlobalSynchronizer");
jimport("net.appjet.oui.exceptionlog");

function onStartup() {
  appjet.cache.pads = {};
  appjet.cache.pads.meta = new ConcurrentHashMap();
  appjet.cache.pads.temp = new ConcurrentHashMap();
  appjet.cache.pads.revs = new ConcurrentHashMap();
  appjet.cache.pads.revs10 = new ConcurrentHashMap();
  appjet.cache.pads.revs100 = new ConcurrentHashMap();
  appjet.cache.pads.revs1000 = new ConcurrentHashMap();
  appjet.cache.pads.chat = new ConcurrentHashMap();
  appjet.cache.pads.revmeta = new ConcurrentHashMap();
  appjet.cache.pads.authors = new ConcurrentHashMap();
  appjet.cache.pads.apool = new ConcurrentHashMap();
}

var _JSON_CACHE_SIZE = 10000;

// to clear: appjet.cache.padmodel.modelcache.map.clear()
function _getModelCache() {
  return syncedWithCache('padmodel.modelcache', function(cache) {
    if (! cache.map) {
      cache.map = new LimitedSizeMapping(_JSON_CACHE_SIZE);
    }
    return cache.map;
  });
}

function cleanText(txt) {
  return txt.replace(/\r\n/g,'\n').replace(/\r/g,'\n').replace(/\t/g, '        ').replace(/\xa0/g, ' ');
}

/**
 * Access a pad object, which is passed as an argument to
 * the given padFunc, which is executed inside an exclusive lock,
 * and return the result.  If the pad doesn't exist, a wrapper
 * object is still created and passed to padFunc, and it can
 * be used to check whether the pad exists and create it.
 *
 * Note: padId is a GLOBAL id.
 */
function accessPadGlobal(padId, padFunc, rwMode) {
  // this may make a nested call to accessPadGlobal, so do it first
  pad_security.checkAccessControl(padId, rwMode);

  // pad is never loaded into memory (made "active") unless it has been migrated.
  // Migrations do not use accessPad, but instead access the database directly.
  pad_migrations.ensureMigrated(padId);

  var mode = (rwMode || "rw").toLowerCase();

  if (! appjet.requestCache.padsAccessing) {
    appjet.requestCache.padsAccessing = {};
  }
  if (appjet.requestCache.padsAccessing[padId]) {
    // nested access to same pad
    var p = appjet.requestCache.padsAccessing[padId];
    var m = p._meta;
    if (m && mode != "r") {
      m.status.lastAccess = +new Date();
      m.status.dirty = true;
    }
    return padFunc(p);
  }

  return doWithPadLock(padId, function() {
    return sqlcommon.inTransaction(function() {
      var meta = _getPadMetaData(padId); // null if pad doesn't exist yet

      if (meta && ! meta.status) {
        meta.status = { validated: false };
      }

      if (meta && mode != "r") {
	meta.status.lastAccess = +new Date();
      }

      function getCurrentAText() {
        var tempObj = pad.tempObj();
        if (! tempObj.atext) {
          tempObj.atext = pad.getInternalRevisionAText(meta.head);
        }
        return tempObj.atext;
      }
      function addRevision(theChangeset, author, optDatestamp) {
        var atext = getCurrentAText();
        var newAText = Changeset.applyToAText(theChangeset, atext, pad.pool());
        Changeset.copyAText(newAText, atext); // updates pad.tempObj().atext!

        var newRev = ++meta.head;

        var revs = _getPadStringArray(padId, "revs");
        revs.setEntry(newRev, theChangeset);

        var revmeta = _getPadStringArray(padId, "revmeta");
        var thisRevMeta = {t: (optDatestamp || (+new Date())),
          a: getNumForAuthor(author)};
        if ((newRev % meta.keyRevInterval) == 0) {
          thisRevMeta.atext = atext;
        }
        revmeta.setJSONEntry(newRev, thisRevMeta);

        updateCoarseChangesets(true);
      }
      function getNumForAuthor(author, dontAddIfAbsent) {
        return pad.pool().putAttrib(['author',author||''], dontAddIfAbsent);
      }
      function getAuthorForNum(n) {
        // must return null if n is an attrib number that isn't an author
        var pair = pad.pool().getAttrib(n);
        if (pair && pair[0] == 'author') {
          return pair[1];
        }
        return null;
      }

      function updateCoarseChangesets(onlyIfPresent) {
        // this is fast to run if the coarse changesets
        // are up-to-date or almost up-to-date;
        // if there's no coarse changeset data,
        // it may take a while.

        if (! meta.coarseHeads) {
          if (onlyIfPresent) {
            return;
          }
          else {
            meta.coarseHeads = {10:-1, 100:-1, 1000:-1};
          }
        }
        var head = meta.head;
        // once we reach head==9, coarseHeads[10] moves
        // from -1 up to 0; at head==19 it moves up to 1
        var desiredCoarseHeads = {
          10: Math.floor((head-9)/10),
          100: Math.floor((head-99)/100),
          1000: Math.floor((head-999)/1000)
        };
        var revs = _getPadStringArray(padId, "revs");
        var revs10 = _getPadStringArray(padId, "revs10");
        var revs100 = _getPadStringArray(padId, "revs100");
        var revs1000 = _getPadStringArray(padId, "revs1000");
        var fineArrays = [revs, revs10, revs100];
        var coarseArrays = [revs10, revs100, revs1000];
        var levels = [10, 100, 1000];
        var dirty = false;
        for(var z=0;z<3;z++) {
          var level = levels[z];
          var coarseArray = coarseArrays[z];
          var fineArray = fineArrays[z];
          while (meta.coarseHeads[level] < desiredCoarseHeads[level]) {
            dirty = true;
            // for example, if the current coarse head is -1,
            // compose 0-9 inclusive of the finer level and call it 0
            var x = meta.coarseHeads[level] + 1;
            var cs = fineArray.getEntry(10 * x);
            for(var i=1;i<=9;i++) {
              cs = Changeset.compose(cs, fineArray.getEntry(10*x + i),
                                     pad.pool());
            }
            coarseArray.setEntry(x, cs);
            meta.coarseHeads[level] = x;
          }
        }
        if (dirty) {
          meta.status.dirty = true;
        }
      }

      /////////////////// "Public" API starts here (functions used by collab_server or other modules)
      var pad = {
	// Operations that write to the data structure should
	// set meta.dirty = true.  Any pad access that isn't
	// done in "read" mode also sets dirty = true.
	getId: function() { return padId; },
	exists: function() { return !!meta; },
	create: function(optText) {
	  meta = {};
	  meta.head = -1; // incremented below by addRevision
	  pad.tempObj().atext = Changeset.makeAText("\n");
	  meta.padId = padId,
	  meta.keyRevInterval = 100;
	  meta.numChatMessages = 0;
	  var t = +new Date();
          meta.status = { validated: true };
	  meta.status.lastAccess = t;
          meta.status.dirty = true;
          meta.supportsTimeSlider = true;

	  var firstChangeset = Changeset.makeSplice("\n", 0, 0,
	    cleanText(optText || ''));
	  addRevision(firstChangeset, '');

	  _insertPadMetaData(padId, meta);

          sqlobj.insert("PAD_SQLMETA", {
            id: padId, version: 2, creationTime: new Date(t), lastWriteTime: new Date(),
            headRev: meta.head }); // headRev is not authoritative, just for info

	  padevents.onNewPad(pad);
	},
	destroy: function() { // you may want to collab_server.bootAllUsers first
          padevents.onDestroyPad(pad);

	  _destroyPadStringArray(padId, "revs");
	  _destroyPadStringArray(padId, "revs10");
	  _destroyPadStringArray(padId, "revs100");
	  _destroyPadStringArray(padId, "revs1000");
	  _destroyPadStringArray(padId, "revmeta");
	  _destroyPadStringArray(padId, "chat");
	  _destroyPadStringArray(padId, "authors");
	  _removePadMetaData(padId);
	  _removePadAPool(padId);
          sqlobj.deleteRows("PAD_SQLMETA", { id: padId });
	  meta = null;
	},
	writeToDB: function() {
          var meta2 = {};
          for(var k in meta) meta2[k] = meta[k];
          delete meta2.status;
	  sqlbase.putJSON("PAD_META", padId, meta2);

	  _getPadStringArray(padId, "revs").writeToDB();
	  _getPadStringArray(padId, "revs10").writeToDB();
	  _getPadStringArray(padId, "revs100").writeToDB();
	  _getPadStringArray(padId, "revs1000").writeToDB();
	  _getPadStringArray(padId, "revmeta").writeToDB();
	  _getPadStringArray(padId, "chat").writeToDB();
	  _getPadStringArray(padId, "authors").writeToDB();
	  sqlbase.putJSON("PAD_APOOL", padId, pad.pool().toJsonable());

          var props = { headRev: meta.head, lastWriteTime: new Date() };
          _writePadSqlMeta(padId, props);
	},
	pool: function() {
	  return _getPadAPool(padId);
	},
	getHeadRevisionNumber: function() { return meta.head; },
	getRevisionAuthor: function(r) {
	  var n = _getPadStringArray(padId, "revmeta").getJSONEntry(r).a;
	  return getAuthorForNum(Number(n));
	},
	getRevisionChangeset: function(r) {
	  return _getPadStringArray(padId, "revs").getEntry(r);
	},
	tempObj: function() { return _getPadTemp(padId); },
	getKeyRevisionNumber: function(r) {
	  return Math.floor(r / meta.keyRevInterval) * meta.keyRevInterval;
	},
	getInternalRevisionAText: function(r) {
          var cacheKey = "atext/C/"+r+"/"+padId;
          var modelCache = _getModelCache();
          var cachedValue = modelCache.get(cacheKey);
          if (cachedValue) {
            modelCache.touch(cacheKey);
            //java.lang.System.out.println("HIT! "+cacheKey);
            return Changeset.cloneAText(cachedValue);
          }
          //java.lang.System.out.println("MISS! "+cacheKey);

	  var revs = _getPadStringArray(padId, "revs");
	  var keyRev = pad.getKeyRevisionNumber(r);
	  var revmeta = _getPadStringArray(padId, "revmeta");
	  var atext = revmeta.getJSONEntry(keyRev).atext;
	  var curRev = keyRev;
	  var targetRev = r;
	  var apool = pad.pool();
	  while (curRev < targetRev) {
	    curRev++;
	    var cs = pad.getRevisionChangeset(curRev);
	    atext = Changeset.applyToAText(cs, atext, apool);
	  }
          modelCache.put(cacheKey, Changeset.cloneAText(atext));
	  return atext;
	},
	getInternalRevisionText: function(r, optInfoObj) {
	  var atext = pad.getInternalRevisionAText(r);
	  var text = atext.text;
	  if (optInfoObj) {
	    if (text.slice(-1) != "\n") {
	      optInfoObj.badLastChar = text.slice(-1);
	    }
	  }
	  return text;
	},
	getRevisionText: function(r, optInfoObj) {
	  var internalText = pad.getInternalRevisionText(r, optInfoObj);
	  return internalText.slice(0, -1);
	},
	atext: function() { return Changeset.cloneAText(getCurrentAText()); },
	text: function() { return pad.atext().text; },
	getRevisionDate: function(r) {
	  var revmeta = _getPadStringArray(padId, "revmeta");
	  return new Date(revmeta.getJSONEntry(r).t);
	},
	// note: calls like appendRevision will NOT notify clients of the change!
	// you must go through collab_server.
	// Also, be sure to run cleanText() on any text to strip out carriage returns
	// and other stuff.
	appendRevision: function(theChangeset, author, optDatestamp) {
	  addRevision(theChangeset, author || '', optDatestamp);
	},
	appendChatMessage: function(obj) {
	  var index = meta.numChatMessages;
	  meta.numChatMessages++;
	  var chat = _getPadStringArray(padId, "chat");
	  chat.setJSONEntry(index, obj);
	},
	getNumChatMessages: function() {
	  return meta.numChatMessages;
	},
	getChatMessage: function(i) {
	  var chat = _getPadStringArray(padId, "chat");
	  return chat.getJSONEntry(i);
	},
        getPadOptionsObj: function() {
          var data = pad.getDataRoot();
          if (! data.padOptions) {
            data.padOptions = {};
          }
          if ((! data.padOptions.guestPolicy) ||
            (data.padOptions.guestPolicy == 'ask')) {
            data.padOptions.guestPolicy = 'deny';
          }
          return data.padOptions;
        },
        getGuestPolicy: function() {
          // allow/ask/deny
          return pad.getPadOptionsObj().guestPolicy;
        },
        setGuestPolicy: function(policy) {
          pad.getPadOptionsObj().guestPolicy = policy;
        },
	getDataRoot: function() {
	  var dataRoot = meta.dataRoot;
	  if (! dataRoot) {
	    dataRoot = {};
	    meta.dataRoot = dataRoot;
	  }
	  return dataRoot;
	},
	// returns an object, changes to which are not reflected
	// in the DB;  use setAuthorData for mutation
	getAuthorData: function(author) {
	  var authors = _getPadStringArray(padId, "authors");
	  var n = getNumForAuthor(author, true);
          if (n < 0) {
            return null;
          }
          else {
	    return authors.getJSONEntry(n);
          }
	},
	setAuthorData: function(author, data) {
	  var authors = _getPadStringArray(padId, "authors");
	  var n = getNumForAuthor(author);
	  authors.setJSONEntry(n, data);
	},
	adoptChangesetAttribs: function(cs, oldPool) {
	  return Changeset.moveOpsToNewPool(cs, oldPool, pad.pool());
	},
	eachATextAuthor: function(atext, func) {
	  var seenNums = {};
	  Changeset.eachAttribNumber(atext.attribs, function(n) {
	    if (! seenNums[n]) {
	      seenNums[n] = true;
	      var author = getAuthorForNum(n);
	      if (author) {
		func(author, n);
	      }
	    }
	  });
	},
        getCoarseChangeset: function(start, numChangesets) {
          updateCoarseChangesets();

          if (!(numChangesets == 10 || numChangesets == 100 ||
                numChangesets == 1000)) {
            return null;
          }
          var level = numChangesets;
          var x = Math.floor(start / level);
          if (!(x >= 0 && x*level == start)) {
            return null;
          }

          var cs = _getPadStringArray(padId, "revs"+level).getEntry(x);

          if (! cs) {
            return null;
          }

          return cs;
        },
        getSupportsTimeSlider: function() {
          if (! ('supportsTimeSlider' in meta)) {
            if (padutils.isProPadId(padId)) {
              return true;
            }
            else {
              return false;
            }
          }
          else {
            return !! meta.supportsTimeSlider;
          }
        },
        setSupportsTimeSlider: function(v) {
          meta.supportsTimeSlider = v;
        },
	get _meta() { return meta; }
      };

      try {
        padutils.setCurrentPad(padId);
        appjet.requestCache.padsAccessing[padId] = pad;
        return padFunc(pad);
      }
      finally {
	padutils.clearCurrentPad();
        delete appjet.requestCache.padsAccessing[padId];
	if (meta) {
	  if (mode != "r") {
	    meta.status.dirty = true;
	  }
	  if (meta.status.dirty) {
	    dbwriter.notifyPadDirty(padId);
	  }
	}
      }
    });
  });
}

/**
 * Call an arbitrary function with no arguments inside an exclusive
 * lock on a padId, and return the result.
 */
function doWithPadLock(padId, func) {
  var lockName = "document/"+padId;
  return sync.doWithStringLock(lockName, func);
}

function isPadLockHeld(padId) {
  var lockName = "document/"+padId;
  return GlobalSynchronizer.isHeld(lockName);
}

/**
 * Get pad meta-data object, which is stored in SQL as JSON
 * but cached in appjet.cache.  Returns null if pad doesn't
 * exist at all (does NOT create it).  Requires pad lock.
 */
function _getPadMetaData(padId) {
  var padMeta = appjet.cache.pads.meta.get(padId);
  if (! padMeta) {
    // not in cache
    padMeta = sqlbase.getJSON("PAD_META", padId);
    if (! padMeta) {
      // not in SQL
      padMeta = null;
    }
    else {
      appjet.cache.pads.meta.put(padId, padMeta);
    }
  }
  return padMeta;
}

/**
 * Sets a pad's meta-data object, such as when creating
 * a pad for the first time.  Requires pad lock.
 */
function _insertPadMetaData(padId, obj) {
  appjet.cache.pads.meta.put(padId, obj);
}

/**
 * Removes a pad's meta data, writing through to the database.
 * Used for the rare case of deleting a pad.
 */
function _removePadMetaData(padId) {
  appjet.cache.pads.meta.remove(padId);
  sqlbase.deleteJSON("PAD_META", padId);
}

function _getPadAPool(padId) {
  var padAPool = appjet.cache.pads.apool.get(padId);
  if (! padAPool) {
    // not in cache
    padAPool = new AttribPool();
    padAPoolJson = sqlbase.getJSON("PAD_APOOL", padId);
    if (padAPoolJson) {
      // in SQL
      padAPool.fromJsonable(padAPoolJson);
    }
    appjet.cache.pads.apool.put(padId, padAPool);
  }
  return padAPool;
}

/**
 * Removes a pad's apool data, writing through to the database.
 * Used for the rare case of deleting a pad.
 */
function _removePadAPool(padId) {
  appjet.cache.pads.apool.remove(padId);
  sqlbase.deleteJSON("PAD_APOOL", padId);
}

/**
 * Get an object for a pad that's not persisted in storage,
 * e.g. for tracking open connections.  Creates object
 * if necessary.  Requires pad lock.
 */
function _getPadTemp(padId) {
  var padTemp = appjet.cache.pads.temp.get(padId);
  if (! padTemp) {
    padTemp = {};
    appjet.cache.pads.temp.put(padId, padTemp);
  }
  return padTemp;
}

/**
 * Returns an object with methods for manipulating a string array, where name
 * is something like "revs" or "chat".  The object must be acquired and used
 * all within a pad lock.
 */
function _getPadStringArray(padId, name) {
  var padFoo = appjet.cache.pads[name].get(padId);
  if (! padFoo) {
    padFoo = {};
    // writes go into writeCache, which is authoritative for reads;
    // reads cause pages to be read into readCache
    padFoo.readCache = {};
    padFoo.writeCache = {};
    appjet.cache.pads[name].put(padId, padFoo);
  }
  var tableName = "PAD_"+name.toUpperCase();
  var self = {
    getEntry: function(idx) {
      var n = Number(idx);
      if (padFoo.writeCache[n]) return padFoo.writeCache[n];
      if (padFoo.readCache[n]) return padFoo.readCache[n];
      sqlbase.getPageStringArrayElements(tableName, padId, n, padFoo.readCache);
      return padFoo.readCache[n]; // null if not present in SQL
    },
    setEntry: function(idx, value) {
      var n = Number(idx);
      var v = String(value);
      padFoo.writeCache[n] = v;
    },
    getJSONEntry: function(idx) {
      var result = self.getEntry(idx);
      if (! result) return result;
      return fastJSON.parse(String(result));
    },
    setJSONEntry: function(idx, valueObj) {
      self.setEntry(idx, fastJSON.stringify(valueObj));
    },
    writeToDB: function() {
      sqlbase.putDictStringArrayElements(tableName, padId, padFoo.writeCache);
      // copy key-vals of writeCache into readCache
      var readCache = padFoo.readCache;
      var writeCache = padFoo.writeCache;
      for(var p in writeCache) {
        readCache[p] = writeCache[p];
      }
      padFoo.writeCache = {};
    }
  };
  return self;
}

/**
 * Destroy a string array;  writes through to the database.  Must be
 * called within a pad lock.
 */
function _destroyPadStringArray(padId, name) {
  appjet.cache.pads[name].remove(padId);
  var tableName = "PAD_"+name.toUpperCase();
  sqlbase.clearStringArray(tableName, padId);
}

/**
 * SELECT the row of PAD_SQLMETA for the given pad.  Requires pad lock.
 */
function _getPadSqlMeta(padId) {
  return sqlobj.selectSingle("PAD_SQLMETA", { id: padId });
}

function _writePadSqlMeta(padId, updates) {
  sqlobj.update("PAD_SQLMETA", { id: padId }, updates);
}


// called from dbwriter
function removeFromMemory(pad) {
  // safe to call if all data is written to SQL, otherwise will lose data;
  var padId = pad.getId();
  appjet.cache.pads.meta.remove(padId);
  appjet.cache.pads.revs.remove(padId);
  appjet.cache.pads.revs10.remove(padId);
  appjet.cache.pads.revs100.remove(padId);
  appjet.cache.pads.revs1000.remove(padId);
  appjet.cache.pads.chat.remove(padId);
  appjet.cache.pads.revmeta.remove(padId);
  appjet.cache.pads.apool.remove(padId);
  collab_server.removeFromMemory(pad);
}


