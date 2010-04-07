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

import("dateutils");
import("fastJSON");
import("fileutils");
import("jsutils.{eachProperty,keys}");
import("stringutils.{randomHash,startsWith,endsWith}");
import("sync");

jimport("net.appjet.common.util.ExpiringMapping");

//----------------------------------------------------------------

var _DEFAULT_COOKIE_NAME = "SessionID";
var _DEFAULT_SERVER_EXPIRATION = 3*24*60*60*1000; // 72 hours

function getSessionId(cookieName, createIfNotPresent, domain) {
  if (request.isComet || request.isCron) {
    return null;
  }

  if (request.cookies[cookieName]) {
    return request.cookies[cookieName];
  }

  if (!createIfNotPresent) {
    return null;
  }

  // Keep sessionId in requestCache so this function can be called multiple
  // times per request without multiple calls to setCookie().
  if (!appjet.requestCache.sessionId) {
    var sessionId = randomHash(16);

    response.setCookie({
      name: cookieName,
      value: sessionId,
      path: "/",
      domain: (domain || undefined)
    });

    appjet.requestCache.sessionId = sessionId;
  }

  return appjet.requestCache.sessionId;
}

function _getExpiringSessionMap(db) {
  sync.callsyncIfTrue(db,
    function() { return (!db.map); },
    function() { db.map = new ExpiringMapping(_DEFAULT_SERVER_EXPIRATION); });
  return db.map;
}

function _getCachedDb() {
  return appjet.cacheRoot("net.appjet.ajstdlib.session");
}

//----------------------------------------------------------------

function getSession(opts) {
  // Session options.
  if (!opts) { opts = {}; }
  var cookieName = opts.cookieName || _DEFAULT_COOKIE_NAME;

  // get cookie ID (sets response cookie if necessary)
  var sessionId = getSessionId(cookieName, true, opts.domain);

  // get expiring session map
  var db = _getCachedDb();
  var map = _getExpiringSessionMap(db);

  // get session data object
  var domainKey = (opts.domain ? opts.domain : "");
  var dataKey = [domainKey, sessionId].join('$');

  var sessionData = map.get(dataKey);
  if (!sessionData) {
    sessionData = {};
    map.put(dataKey, sessionData);
  }
  else {
    map.touch(dataKey);
  }

  return sessionData;
}

function writeSessionsToDisk() {
  var dateString = dateutils.dateFormat(new Date(), "yyyy-MM-dd");
  var dataFile = new Packages.java.io.File(appjet.config.sessionStoreDir+"/sessions-"+dateString+".jslog");
  dataFile.getParentFile().mkdirs();
  var writer = new java.io.FileWriter(dataFile);
  var map = _getCachedDb().map;
  if (! map) { return; }
  var keyIterator = map.listAllKeys().iterator();
  while (keyIterator.hasNext()) {
    var key = keyIterator.next();
    var session = map.get(key);
    if (keys(session).length == 0) { continue; }
    var obj = { key: key, session: session };
    var json = fastJSON.stringify(obj);
    writer.write(json);
    writer.write("\n");
  }
  writer.flush();
  writer.close();
}

function _extractDate(fname) {
  var datePart = fname.substr("sessions-".length, "2009-09-24".length);
  return Number(datePart.split("-").join(""));
}

function readLatestSessionsFromDisk() {
  var dir = new Packages.java.io.File(appjet.config.sessionStoreDir);
  if (! dir.exists()) { return; }
  var files = dir.listFiles(new Packages.java.io.FilenameFilter({ 
    accept: function(dir, name) { 
      return startsWith(name, "sessions") && endsWith(name, ".jslog") 
    }
  }));
  if (files.length == 0) { return; }
  var latestFile = files[0];
  for (var i = 1; i < files.length; ++i) {
    if (_extractDate(files[i].getName()) > _extractDate(latestFile.getName())) {
      latestFile = files[i];
    }
  }
  var map = _getExpiringSessionMap(_getCachedDb());
  fileutils.eachFileLine(latestFile, function(json) {
    try {
      var obj = fastJSON.parse(json);
      var key = obj.key;
      var session = obj.session;
      map.put(key, session);      
    } catch (err) {
      Packages.java.lang.System.out.println("Error reading sessions file on line '"+json+"': "+String(err));
    }
  });
  latestFile.renameTo(new Packages.java.io.File(latestFile.getParent()+"/used-"+latestFile.getName()));
}
