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

import("sqlbase.sqlobj");
import("fastJSON");
import("stringutils");
import("jsutils.eachProperty");
import("sync");
import("etherpad.sessions");
import("etherpad.pro.pro_utils");
import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_accounts.getSessionProAccount");
import("etherpad.pro.domains");
import("stringutils.randomHash");

var _table = cachedSqlTable('pad_guests', 'pad_guests',
                            ['id', 'privateKey', 'userId'], processGuestRow);
function processGuestRow(row) {
  row.data = fastJSON.parse(row.data);
}

function notifySignIn() {
  /*if (pro_accounts.isAccountSignedIn()) {
    var proId = getUserId();
    var guestId = _getGuestUserId();

    var guestUser = _getGuestByKey('userId', guestId);
    if (guestUser) {
      var mods = {};
      mods.data = guestUser.data;
      // associate guest with proId
      mods.data.replacement = proId;
      // de-associate ET cookie with guest, otherwise
      // the ET cookie would provide a semi-permanent way
      // to effect changes under the pro account's name!
      mods.privateKey = "replaced$"+_randomString(20);
      _updateGuest('userId', guestId, mods);
    }
  }*/
}

function notifyActive() {
  if (isGuest(getUserId())) {
    _updateGuest('userId', getUserId(), {});
  }
}

function notifyUserData(userData) {
  var uid = getUserId();
  if (isGuest(uid)) {
    var data = _getGuestByKey('userId', uid).data;
    if (userData.name) {
      data.name = userData.name;
    }
    _updateGuest('userId', uid, {data: data});
  }
}

function getUserId() {
  if (pro_accounts.isAccountSignedIn()) {
    return "p."+(getSessionProAccount().id);
  }
  else {
    return getGuestUserId();
  }
}

function getUserName() {
  var uid = getUserId();
  if (isGuest(uid)) {
    var fromSession = sessions.getSession().guestDisplayName;
    return fromSession || _getGuestByKey('userId', uid).data.name || null;
  }
  else {
    return getSessionProAccount().fullName;
  }
}

function getAccountIdForProAuthor(uid) {
  if (uid.indexOf("p.") == 0) {
    return Number(uid.substring(2));
  }
  else {
    return -1;
  }
}

function getNameForUserId(uid) {
  if (isGuest(uid)) {
    return _getGuestByKey('userId', uid).data.name || null;
  }
  else {
    var accountNum = getAccountIdForProAuthor(uid);
    if (accountNum < 0) {
      return null;
    }
    else {
      return pro_accounts.getAccountById(accountNum).fullName;
    }
  }
}

function isGuest(userId) {
  return /^g/.test(userId);
}

function getGuestUserId() {
  // cache the userId in the requestCache,
  // for efficiency and consistency
  var c = appjet.requestCache;
  if (c.padGuestUserId === undefined) {
    c.padGuestUserId = _computeGuestUserId();
  }
  return c.padGuestUserId;
}

function _getGuestTrackerId() {
  // get ET cookie
  var tid = sessions.getTrackingId();
  if (tid == '-') {
    // no tracking cookie?  not a normal request?
    return null;
  }

  // get domain ID
  var domain = "-";
  if (pro_utils.isProDomainRequest()) {
    // e.g. "3"
    domain = String(domains.getRequestDomainId());
  }

  // combine them
  return domain+"$"+tid;
}

function _insertGuest(obj) {
  // only requires 'userId' in obj

  obj.createdDate = new Date;
  obj.lastActiveDate = new Date;
  if (! obj.data) {
    obj.data = {};
  }
  if ((typeof obj.data) == "object") {
    obj.data = fastJSON.stringify(obj.data);
  }
  if (! obj.privateKey) {
    // private keys must be unique
    obj.privateKey = "notracker$"+_randomString(20);
  }

  return _table.insert(obj);
}

function _getGuestByKey(keyColumn, value) {
  return _table.getByKey(keyColumn, value);
}

function _updateGuest(keyColumn, value, obj) {
  var obj2 = {};
  eachProperty(obj, function(k,v) {
    if (k == "data" && (typeof v) == "object") {
      obj2.data = fastJSON.stringify(v);
    }
    else {
      obj2[k] = v;
    }
  });

  obj2.lastActiveDate = new Date;

  _table.updateByKey(keyColumn, value, obj2);
}

function _newGuestUserId() {
  return "g."+_randomString(16);
}

function _computeGuestUserId() {
  // always returns some userId

  var privateKey = _getGuestTrackerId();

  if (! privateKey) {
    // no tracking cookie, pretend there is one
    privateKey = randomHash(16);
  }

  var userFromTracker = _table.getByKey('privateKey', privateKey);
  if (userFromTracker) {
    // we know this guy
    return userFromTracker.userId;
  }

  // generate userId
  var userId = _newGuestUserId();
  var guest = {userId:userId, privateKey:privateKey};
  var data = {};
  guest.data = data;

  var prefsCookieData = _getPrefsCookieData();
  if (prefsCookieData) {
    // found an old prefs cookie with an old userId
    var oldUserId = prefsCookieData.userId;
    // take the name and preferences
    if ('name' in prefsCookieData) {
      data.name = prefsCookieData.name;
    }
    /*['fullWidth','viewZoom'].forEach(function(pref) {
      if (pref in prefsCookieData) {
        data.prefs[pref] = prefsCookieData[pref];
      }
    });*/
  }

  _insertGuest(guest);
  return userId;
}

function _getPrefsCookieData() {
  // get userId from old prefs cookie if possible,
  // but don't allow modern usernames

  var prefsCookie = request.cookies['prefs'];
  if (! prefsCookie) {
    return null;
  }
  if (prefsCookie.charAt(0) != '%') {
    return null;
  }
  try {
    var cookieData = fastJSON.parse(unescape(prefsCookie));
    // require one to three digits followed by dot at beginning of userId
    if (/^[0-9]{1,3}\./.test(String(cookieData.userId))) {
      return cookieData;
    }
  }
  catch (e) {
    return null;
  }

  return null;
}

function _randomString(len) {
  // use only numbers and lowercase letters
  var pieces = [];
  for(var i=0;i<len;i++) {
    pieces.push(Math.floor(Math.random()*36).toString(36).slice(-1));
  }
  return pieces.join('');
}


function cachedSqlTable(cacheName, tableName, keyColumns, processFetched) {
  // Keeps a cache of sqlobj rows for the case where
  // you want to select one row at a time by a single column
  // at a time, taken from some set of key columns.
  // The cache maps (keyColumn, value), e.g. ("id", 4) or
  // ("secondaryKey", "foo123"), to an object, and each
  // object is either present for all keyColumns
  // (e.g. "id", "secondaryKey") or none.

  if ((typeof keyColumns) == "string") {
    keyColumns = [keyColumns];
  }
  processFetched = processFetched || (function(o) {});

  function getCache() {
    // this function is normally fast, only slow when cache
    // needs to be created for the first time
    var cache = appjet.cache[cacheName];
    if (cache) {
      return cache;
    }
    else {
      // initialize in a synchronized block (double-checked locking);
      // uses same lock as cache_utils.syncedWithCache would use.
      sync.doWithStringLock("cache/"+cacheName, function() {
        if (! appjet.cache[cacheName]) {
          // values expire after 10 minutes
          appjet.cache[cacheName] =
            new net.appjet.common.util.ExpiringMapping(10*60*1000);
        }
      });
      return appjet.cache[cacheName];
    }
  }

  function cacheKey(keyColumn, value) {
    // e.g. "id$4"
    return keyColumn+"$"+String(value);
  }

  function getFromCache(keyColumn, value) {
    return getCache().get(cacheKey(keyColumn, value));
  }
  function putInCache(obj) {
    var cache = getCache();
    // put in cache, keyed on all keyColumns we care about
    keyColumns.forEach(function(keyColumn) {
      cache.put(cacheKey(keyColumn, obj[keyColumn]), obj);
    });
  }
  function touchInCache(obj) {
    var cache = getCache();
    keyColumns.forEach(function(keyColumn) {
      cache.touch(cacheKey(keyColumn, obj[keyColumn]));
    });
  }
  function removeObjFromCache(obj) {
    var cache = getCache();
    keyColumns.forEach(function(keyColumn) {
      cache.remove(cacheKey(keyColumn, obj[keyColumn]));
    });
  }
  function removeFromCache(keyColumn, value) {
    var cached = getFromCache(keyColumn, value);
    if (cached) {
      removeObjFromCache(cached);
    }
  }

  var self = {
    clearCache: function() {
      getCache().clear();
    },
    getByKey: function(keyColumn, value) {
      // get cached object, if any
      var cached = getFromCache(keyColumn, value);
      if (! cached) {
        // nothing in cache for this query, fetch from SQL
        var keyToValue = {};
        keyToValue[keyColumn] = value;
        var fetched = sqlobj.selectSingle(tableName, keyToValue);
        if (fetched) {
          processFetched(fetched);
          // fetched something, stick it in the cache
          putInCache(fetched);
        }
        return fetched;
      }
      else {
        // touch cached object and return
        touchInCache(cached);
        return cached;
      }
    },
    updateByKey: function(keyColumn, value, obj) {
      var keyToValue = {};
      keyToValue[keyColumn] = value;
      sqlobj.updateSingle(tableName, keyToValue, obj);
      // remove old object from caches but
      // don't put obj in cache, because it
      // is likely a partial object
      removeFromCache(keyColumn, value);
    },
    insert: function(obj) {
      var returnVal = sqlobj.insert(tableName, obj);
      // remove old object from caches but
      // don't put obj in the cache; it doesn't
      // have all values, e.g. for auto-generated ids
      removeObjFromCache(obj);
      return returnVal;
    },
    deleteByKey: function(keyColumn, value) {
      var keyToValue = {};
      keyToValue[keyColumn] = value;
      sqlobj.deleteRows(tableName, keyToValue);
      removeFromCache(keyColumn, value);
    }
  };
  return self;
}

function _getClientIp() {
  return (request.isDefined && request.clientIp) || '';
}

function getUserIdCreatedDate(userId) {
  var record = sqlobj.selectSingle('pad_cookie_userids', {id: userId});
  if (! record) { return; } // hm. weird case.
  return record.createdDate;
}
