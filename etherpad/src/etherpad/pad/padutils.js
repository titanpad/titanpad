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
import("stringutils");

import("etherpad.control.pro.account_control");

import("etherpad.pro.pro_utils");
import("etherpad.pro.domains");
import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_padmeta");
import("etherpad.pad.model");
import("etherpad.sessions.getSession");

jimport("java.lang.System.out.println");


function setCurrentPad(p) {
  appjet.context.attributes().update("currentPadId", p);
}

function clearCurrentPad() {
  appjet.context.attributes()['$minus$eq']("currentPadId");
}

function getCurrentPad() {
  var padOpt = appjet.context.attributes().get("currentPadId");
  if (padOpt.isEmpty()) return null;
  return padOpt.get();
}

function _parseCookie(text) {
  try {
    var cookieData = fastJSON.parse(unescape(text));
    return cookieData;
  }
  catch (e) {
    return null;
  }
}

function getPrefsCookieData() {
  var prefsCookie = request.cookies['prefs'];
  if (!prefsCookie) {
    return null;
  }

  return _parseCookie(prefsCookie);
}

function getPrefsCookieUserId() {
  var cookieData = getPrefsCookieData();
  if (! cookieData) {
    return null;
  }
  return cookieData.userId || null;
}

/**
 * Not valid to call this function outisde a HTTP request.
 */
function accessPadLocal(localPadId, fn, rwMode) {
  if (!request.isDefined) {
    throw Error("accessPadLocal() cannot run outside an HTTP request.");
  }
  var globalPadId = getGlobalPadId(localPadId);
  var fnwrap = function(pad) {
    pad.getLocalId = function() {
      return getLocalPadId(pad);
    };
    return fn(pad);
  }
  return model.accessPadGlobal(globalPadId, fnwrap, rwMode);
}

/**
 * Not valid to call this function outisde a HTTP request.
 */
function getGlobalPadId(localPadId) {
  if (!request.isDefined) {
    throw Error("getGlobalPadId() cannot run outside an HTTP request.");
  }
  if (pro_utils.isProDomainRequest()) {
    return makeGlobalId(domains.getRequestDomainId(), localPadId);
  } else {
    // etherpad.com pads
    return localPadId;
  }
}

function makeGlobalId(domainId, localPadId) {
  return [domainId, localPadId].map(String).join('$');
}

function globalToLocalId(globalId) {
  var parts = globalId.split('$');
  if (parts.length == 1) {
    return parts[0];
  } else {
    return parts[1];
  }
}

function getLocalPadId(pad) {
  var globalId = pad.getId();
  return globalToLocalId(globalId);
}

function isProPadId(globalPadId) {
  return (globalPadId.indexOf("$") > 0);
}

function isProPad(pad) {
  return isProPadId(pad.getId());
}

function getDomainId(globalPadId) {
  var parts = globalPadId.split("$");
  if (parts.length < 2) {
    return null;
  } else {
    return Number(parts[0]);
  }
}

function makeValidLocalPadId(str) {
  return str.replace(/[^a-zA-Z0-9\-]/g, '-');
}

function getProDisplayTitle(localPadId, title) {
  if (title) {
    return title;
  }
  if (stringutils.isNumeric(localPadId)) {
    return ("Untitled "+localPadId);
  } else {
    return (localPadId);
  }
}

