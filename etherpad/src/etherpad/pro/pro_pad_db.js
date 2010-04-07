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
import("stringutils");

import("etherpad.pad.padutils");
import("etherpad.collab.collab_server");

import("etherpad.pro.pro_pad_editors");
import("etherpad.pro.domains");
import("etherpad.pro.pro_accounts.getSessionProAccount");

jimport("java.lang.System.out.println");


// TODO: actually implement the cache part

// NOTE: must return a deep-CLONE of the actual record, because caller
//       may proceed to mutate the returned record.

function _makeRecord(r) {
  if (!r) {
    return null;
  }
  r.proAttrs = {};
  if (r.proAttrsJson) {
    r.proAttrs = fastJSON.parse(r.proAttrsJson);
  }
  if (!r.proAttrs.editors) {
    r.proAttrs.editors = [];
  }
  r.proAttrs.editors.sort();
  return r;
}

function getSingleRecord(domainId, localPadId) {
  // TODO: make clone
  // TODO: use cache
  var record = sqlobj.selectSingle('pro_padmeta', {domainId: domainId, localPadId: localPadId});
  return _makeRecord(record);
}

function update(padRecord) {
  // TODO: use cache

  padRecord.proAttrsJson = fastJSON.stringify(padRecord.proAttrs);
  delete padRecord.proAttrs;

  sqlobj.update('pro_padmeta', {id: padRecord.id}, padRecord);
}


//--------------------------------------------------------------------------------
// create/edit/destory events
//--------------------------------------------------------------------------------

function onCreatePad(pad) {
  if (!padutils.isProPad(pad)) { return; }

  var data = {
    domainId: padutils.getDomainId(pad.getId()),
    localPadId: padutils.getLocalPadId(pad),
    createdDate: new Date(),
  };

  if (getSessionProAccount()) {
    data.creatorId = getSessionProAccount().id;
  }

  sqlobj.insert('pro_padmeta', data);
}

// Not a normal part of the UI.  This is only called from admin interface,
// and thus should actually destroy all record of the pad.
function onDestroyPad(pad) {
  if (!padutils.isProPad(pad)) { return; }

  sqlobj.deleteRows('pro_padmeta', {
    domainId: padutils.getDomainId(pad.getId()),
    localPadId: padutils.getLocalPadId(pad)
  });
}

// Called within the context of a comet post.
function onEditPad(pad, padAuthorId) {
  if (!padutils.isProPad(pad)) { return; }

  var editorId = undefined;
  if (getSessionProAccount()) {
    editorId = getSessionProAccount().id;
  }

  if (!(editorId && (editorId > 0))) {
    return; // etherpad admins
  }

  pro_pad_editors.notifyEdit(
    padutils.getDomainId(pad.getId()),
    padutils.getLocalPadId(pad),
    editorId,
    new Date()
  );
}

//--------------------------------------------------------------------------------
// accessing the pad list.
//--------------------------------------------------------------------------------

function _makeRecordList(lis) {
  lis.forEach(function(r) {
    r = _makeRecord(r);
  });
  return lis;
}

function listMyPads() {
  var domainId = domains.getRequestDomainId();
  var accountId = getSessionProAccount().id;

  var padlist = sqlobj.selectMulti('pro_padmeta', {domainId: domainId, creatorId: accountId, isDeleted: false, isArchived: false});
  return _makeRecordList(padlist);
}

function listAllDomainPads() {
  var domainId = domains.getRequestDomainId();
  var padlist = sqlobj.selectMulti('pro_padmeta', {domainId: domainId, isDeleted: false, isArchived: false});
  return _makeRecordList(padlist);
}

function listArchivedPads() {
  var domainId = domains.getRequestDomainId();
  var padlist = sqlobj.selectMulti('pro_padmeta', {domainId: domainId, isDeleted: false, isArchived: true});
  return _makeRecordList(padlist);
}

function listPadsByEditor(editorId) {
  editorId = Number(editorId);
  var domainId = domains.getRequestDomainId();
  var padlist = sqlobj.selectMulti('pro_padmeta', {domainId: domainId, isDeleted: false, isArchived: false});
  padlist = _makeRecordList(padlist);
  padlist = padlist.filter(function(p) {
    // NOTE: could replace with binary search to speed things up,
    // since we know that editors array is sorted.
    return (p.proAttrs.editors.indexOf(editorId) >= 0);
  });
  return padlist;
}

function listLiveDomainPads() {
  var thisDomainId = domains.getRequestDomainId();
  var allLivePadIds = collab_server.getAllPadsWithConnections();
  var livePadMap = {};

  allLivePadIds.forEach(function(globalId) {
    if (padutils.isProPadId(globalId)) {
      var domainId = padutils.getDomainId(globalId);
      var localId = padutils.globalToLocalId(globalId);
      if (domainId == thisDomainId) {
        livePadMap[localId] = true;
      }
    }
  });

  var padList = listAllDomainPads();
  padList = padList.filter(function(p) {
    return (!!livePadMap[p.localPadId]);
  });

  return padList;
}

//--------------------------------------------------------------------------------
// misc utils
//--------------------------------------------------------------------------------


function _withCache(name, fn) {
  return syncedWithCache('pro-padmeta.'+name, fn);
}

function _withDomainCache(domainId, name, fn) {
  return _withCache(name+"."+domainId, fn);
}



// returns the next pad ID to use for a newly-created pad on this domain.
function getNextPadId() {
  var domainId = domains.getRequestDomainId();
  return _withDomainCache(domainId, 'padcounters', function(c) {
    var ret;
    if (c.x === undefined) {
      c.x = _getLargestNumericPadId(domainId) + 1;
    }
    while (sqlobj.selectSingle('pro_padmeta', {domainId: domainId, localPadId: String(c.x)})) {
      c.x++;
    }
    ret = c.x;
    c.x++;
    return ret;
  });
}

function _getLargestNumericPadId(domainId) {
  var max = 0;
  var allPads = listAllDomainPads();
  allPads.forEach(function(p) {
    if (stringutils.isNumeric(p.localPadId)) {
      max = Math.max(max, Number(p.localPadId));
    }
  });
  return max;
}



