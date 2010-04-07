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

import("stringutils");
import("cache_utils.syncedWithCache");
import("sync");

import("etherpad.pad.padutils");
import("etherpad.pro.pro_pad_db");

function _doWithProPadLock(domainId, localPadId, func) {
  var lockName = ["pro-pad", domainId, localPadId].join("/");
  return sync.doWithStringLock(lockName, func);
}

function accessProPad(globalPadId, fn) {
  // retrieve pad from cache
  var domainId = padutils.getDomainId(globalPadId);
  if (!domainId) {
    throw Error("not a pro pad: "+globalPadId);
  }
  var localPadId = padutils.globalToLocalId(globalPadId);
  var padRecord = pro_pad_db.getSingleRecord(domainId, localPadId);

  return _doWithProPadLock(domainId, localPadId, function() {
    var isDirty = false;

    var proPad = {
      exists: function() { return !!padRecord; },
      getDomainId: function() { return domainId; },
      getLocalPadId: function() { return localPadId; },
      getGlobalId: function() { return globalPadId; },
      getDisplayTitle: function() { return padutils.getProDisplayTitle(localPadId, padRecord.title); },
      setTitle: function(newTitle) {
        padRecord.title = newTitle;
        isDirty = true;
      },
      isDeleted: function() { return padRecord.isDeleted; },
      markDeleted: function() {
        padRecord.isDeleted = true;
        isDirty = true;
      },
      getPassword: function() { return padRecord.password; },
      setPassword: function(newPass) {
        if (newPass == "") {
          newPass = null;
        }
        padRecord.password = newPass;
        isDirty = true;
      },
      isArchived: function() { return padRecord.isArchived; },
      markArchived: function() {
        padRecord.isArchived = true;
        isDirty = true;
      },
      unmarkArchived: function() {
        padRecord.isArchived = false;
        isDirty = true;
      },
      setLastEditedDate: function(d) {
        padRecord.lastEditedDate = d;
        isDirty = true;
      },
      addEditor: function(editorId) {
        var es = String(editorId);
        if (es && es.length > 0 && stringutils.isNumeric(editorId)) {
          if (padRecord.proAttrs.editors.indexOf(editorId) < 0) {
            padRecord.proAttrs.editors.push(editorId);
            padRecord.proAttrs.editors.sort();
          }
          isDirty = true;
        }
      },
      setLastEditor: function(editorId) {
        var es = String(editorId);
        if (es && es.length > 0 && stringutils.isNumeric(editorId)) {
          padRecord.lastEditorId = editorId;
          this.addEditor(editorId);
          isDirty = true;
        }
      }
    };

    var ret = fn(proPad);

    if (isDirty) {
      pro_pad_db.update(padRecord);
    }

    return ret;
  });
}

function accessProPadLocal(localPadId, fn) {
   var globalPadId = padutils.getGlobalPadId(localPadId);
   return accessProPad(globalPadId, fn);
}

