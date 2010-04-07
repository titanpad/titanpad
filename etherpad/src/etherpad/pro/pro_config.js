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
import("sqlbase.sqlobj");
import("cache_utils.syncedWithCache");

import("etherpad.globals.*");
import("etherpad.utils.*");
import("etherpad.pro.domains");
import("etherpad.pro.pro_utils");

function _guessSiteName() {
  var x = request.host.split('.')[0];
  x = (x.charAt(0).toUpperCase() + x.slice(1));
  return x;
}

function _getDefaultConfig() {
  return {
    siteName: _guessSiteName(),
    alwaysHttps: false,
    defaultPadText: renderTemplateAsString("misc/pad_default.ejs")
  };
}

// must be fast! gets called per request, on every request.
function getConfig() {
  if (!pro_utils.isProDomainRequest()) {
    return null;
  }

  if (!appjet.cache.pro_config) {
    appjet.cache.pro_config = {};
  }

  var domainId = domains.getRequestDomainId();
  if (!appjet.cache.pro_config[domainId]) {
    reloadConfig();
  }

  return appjet.cache.pro_config[domainId];
}

function reloadConfig() {
  var domainId = domains.getRequestDomainId();
  var config = _getDefaultConfig();
  var records = sqlobj.selectMulti('pro_config', {domainId: domainId}, {});

  records.forEach(function(r) {
    var name = r.name;
    var val = fastJSON.parse(r.jsonVal).x;
    config[name] = val;
  });

  if (!appjet.cache.pro_config) {
    appjet.cache.pro_config = {};
  }

  appjet.cache.pro_config[domainId] = config;
}

function setConfigVal(name, val) {
  var domainId = domains.getRequestDomainId();
  var jsonVal = fastJSON.stringify({x: val});

  var r = sqlobj.selectSingle('pro_config', {domainId: domainId, name: name});
  if (!r) {
    sqlobj.insert('pro_config', 
                  {domainId: domainId, name: name, jsonVal: jsonVal});
  } else {
    sqlobj.update('pro_config', 
                  {name: name, domainId: domainId},
                  {jsonVal: jsonVal});
  }

  reloadConfig();
}

