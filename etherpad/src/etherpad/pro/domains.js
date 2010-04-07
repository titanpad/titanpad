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

// Library for managing subDomains

import("jsutils.*");
import("sqlbase.sqlobj");

import("etherpad.pro.pro_utils");
import("etherpad.pne.pne_utils");
import("etherpad.licensing");

jimport("java.lang.System.out.println");

// reserved domains
var reservedSubdomains = {
  'alpha': 1,
  'beta': 1,
  'blog': 1,
  'comet': 1,
  'diagnostic': 1,
  'forums': 1,
  'forumsdev': 1,
  'staging': 1,
  'web': 1,
  'www': 1
};

function _getCache() {
  if (!appjet.cache.pro_domains) {
    appjet.cache.pro_domains = {
      records: {id: {}, subDomain: {}}
    };
  }
  return appjet.cache.pro_domains;
}

function doesSubdomainExist(subDomain) {
  if (reservedSubdomains[subDomain]) {
    return true;
  }
  if (getDomainRecordFromSubdomain(subDomain) != null) {
    return true;
  }
  return false;
}

function _updateCache(locator) {
  var record = sqlobj.selectSingle('pro_domains', locator);
  var recordCache = _getCache().records;

  if (record) {
    // update both maps: recordCache.id, recordCache.subDomain
    keys(recordCache).forEach(function(key) {
      recordCache[key][record[key]] = record;
    });
  } else {
    // write false for whatever hit with this locator
    keys(locator).forEach(function(key) {
      recordCache[key][locator[key]] = false;
    });
  }
}

function getDomainRecord(domainId) {
  if (!(domainId in _getCache().records.id)) {
    _updateCache({id: domainId});
  }
  var record = _getCache().records.id[domainId];
  return (record ? record : null);
}

function getDomainRecordFromSubdomain(subDomain) {
  subDomain = subDomain.toLowerCase();
  if (!(subDomain in _getCache().records.subDomain)) {
    _updateCache({subDomain: subDomain});
  }
  var record = _getCache().records.subDomain[subDomain];
  return (record ? record : null);
}

/** returns id of newly created subDomain */
function createNewSubdomain(subDomain, orgName) {
  var id = sqlobj.insert('pro_domains', {subDomain: subDomain, orgName: orgName});
  _updateCache({id: id});
  return id;
}

function getPrivateNetworkDomainId() {
  var r = getDomainRecordFromSubdomain('<<private-network>>');
  if (!r) {
    throw Error("<<private-network>> does not exist in the domains table!");
  }
  return r.id;
}

/** returns null if not found. */
function getRequestDomainRecord() {
  if (pne_utils.isPNE()) {
    var r = getDomainRecord(getPrivateNetworkDomainId());
    if (appjet.cache.fakePNE) {
      r.orgName = "fake";
    } else {
      var licenseInfo = licensing.getLicense();
      if (licenseInfo) {
        r.orgName = licenseInfo.organizationName;
      } else {
        r.orgName = "Private Network Edition TRIAL";
      }
    }
    return r;
  } else {
    var subDomain = pro_utils.getProRequestSubdomain();
    var r = getDomainRecordFromSubdomain(subDomain);
    return r;
  }
}

/* throws exception if not pro domain request. */
function getRequestDomainId() {
  var r = getRequestDomainRecord();
  if (!r) {
    throw Error("Error getting request domain id.");
  }
  return r.id;
}


