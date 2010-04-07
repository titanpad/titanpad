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

import("funhtml.*");
import("stringutils.md5");
import("sqlbase.persistent_vars");

import("etherpad.licensing");

jimport("java.lang.System.out.println");
jimport("java.lang.System");


function isPNE() {
  if (appjet.cache.fakePNE || appjet.config['etherpad.fakePNE']) {
    return true;
  }
  if (getVersionString()) {
    return true;
  }
  return false;
}

/**
 * Versioning scheme: we basically just use the apache scheme of MAJOR.MINOR.PATCH:
 *
 *     Versions are denoted using a standard triplet of integers: MAJOR.MINOR.PATCH. The
 *     basic intent is that MAJOR versions are incompatible, large-scale upgrades of the API.
 *     MINOR versions retain source and binary compatibility with older minor versions, and
 *     changes in the PATCH level are perfectly compatible, forwards and backwards.
 */

function getVersionString() {
  return appjet.config['etherpad.pneVersion'];
}

function parseVersionString(x) {
  var parts = x.split('.');
  return {
    major: Number(parts[0] || 0),
    minor: Number(parts[1] || 0),
    patch: Number(parts[2] || 0)
  };
}

/* returns {major: int, minor: int, patch: int} */
function getVersionNumbers() {
  return parseVersionString(getVersionString());
}

function checkDbVersionUpgrade() {
  var dbVersionString = persistent_vars.get("db_pne_version");
  var runningVersionString = getVersionString();

  if (!dbVersionString) {
    println("Upgrading to Private Network Edition, version: "+runningVersionString);
    return;
  }

  var dbVersion = parseVersionString(dbVersionString);
  var runningVersion = getVersionNumbers();
  var force = (appjet.config['etherpad.forceDbUpgrade'] == "true");

  if (!force && (runningVersion.major != dbVersion.major)) {
    println("Error: you are attempting to update an EtherPad["+dbVersionString+
            "] database to version ["+runningVersionString+"].  This is not possible.");
    println("Exiting...");
    System.exit(1);
  }
  if (!force && (runningVersion.minor < dbVersion.minor)) {
    println("Error: your etherpad database is at a newer version ["+dbVersionString+"] than"+
            " the current running etherpad ["+runningVersionString+"].  Please upgrade to the "+
            " latest version.");
    println("Exiting...");
    System.exit(1);
  }
  if (!force && (runningVersion.minor > (dbVersion.minor + 1))) {
    println("\n\nWARNING: you are attempting to upgrade from version "+dbVersionString+" to version "+
            runningVersionString+".  It is recommended that you upgrade one minor version at a time."+
            " (The \"minor\" version number is the second number separated by dots.  For example,"+
            " if you are running version 1.2, it is recommended that you upgrade to 1.3 and then 1.4 "+
            " instead of going directly from 1.2 to 1.4.");
    println("\n\nIf you really want to do this, you can force us to attempt the upgrade with "+
            " the --etherpad.forceDbUpgrade=true flag.");
    println("\n\nExiting...");
    System.exit(1);
  }
  if (runningVersion.minor > dbVersion.minor) {
    println("Upgrading database to version "+runningVersionString);
  }
}

function saveDbVersion() {
  var dbVersionString = persistent_vars.get("db_pne_version");
  if (getVersionString() != dbVersionString) {
    persistent_vars.put('db_pne_version', getVersionString());
    println("Upgraded Private Network Edition version to ["+getVersionString()+"]");
  }
}

// These are a list of some of the config vars documented in the PNE manual.  They are here
// temporarily, until we move them to the PNE config UI.

var _eepneAllowedConfigVars = [
  'configFile',
  'etherpad.useMySQL',
  'etherpad.SQL_JDBC_DRIVER',
  'etherpad.SQL_JDBC_URL',
  'etherpad.SQL_PASSWORD',
  'etherpad.SQL_USERNAME',
  'etherpad.adminPass',
  'etherpad.licenseKey',
  'listen',
  'listenSecure',
  'smtpPass',
  'smtpServer',
  'smtpUser',
  'sslKeyPassword',
  'sslKeyStore'
];

function isServerLicensed() {
  var licenseInfo = licensing.getLicense();
  if (!licenseInfo) {
    return false;
  }
  if (licensing.isVersionTooOld()) {
    return false;
  }
  if (licensing.isExpired()) {
    return false;
  }
  return true;
}

function enableTrackingAgain() {
  delete appjet.cache.noMorePneTracking;
}

function pneTrackerHtml() {
  if (!isPNE()) {
    return "";
  }
  if (appjet.cache.noMorePneTracking) {
    return "";
  }

  var div = DIV({style: "height: 1px; width: 1px; overflow: hidden;"});

  var licenseInfo = licensing.getLicense();
  var key = null;
  if (licenseInfo) {
    key = md5(licenseInfo.key).substr(0, 16);
  }

  function trackData(name, value) {
    var imgurl = "http://etherpad.com/ep/tpne/t?";
    if (key) {
      imgurl += ("k="+key+"&");
    }
    imgurl += (encodeURIComponent(name) + "=" + encodeURIComponent(value));
    div.push(IMG({src: imgurl}));
  }

  trackData("ping", "1");
  trackData("dbdriver", appjet.config['etherpad.SQL_JDBC_DRIVER']);
  trackData("request.url", request.url);

  appjet.cache.noMorePneTracking = true;
  return div;
}



