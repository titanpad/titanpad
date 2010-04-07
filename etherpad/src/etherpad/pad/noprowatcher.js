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

/*
 * noprowatcher keeps track of when a pad has had no pro user
 * in it for a certain period of time, after which all guests
 * are booted.
 */

import("etherpad.pad.padutils");
import("etherpad.collab.collab_server");
import("etherpad.pad.padusers");
import("etherpad.pad.pad_security");
import("etherpad.pad.model");
import("cache_utils.syncedWithCache");
import("execution");
import("etherpad.sessions");

function onStartup() {
  execution.initTaskThreadPool("noprowatcher", 1);
}

function getNumProUsers(pad) {
  var n = 0;
  collab_server.getConnectedUsers(pad).forEach(function(info) {
    if (! padusers.isGuest(info.userId)) {
      n++; // found a non-guest
    }
  });
  return n;
}

var _EMPTY_TIME = 60000;

function checkPad(padOrPadId) {
  if ((typeof padOrPadId) == "string") {
    return model.accessPadGlobal(padOrPadId, function(pad) {
      return checkPad(pad);
    });
  }
  var pad = padOrPadId;

  if (! padutils.isProPad(pad)) {
    return; // public pad
  }

  if (pad.getGuestPolicy() == 'allow') {
    return; // public access
  }

  if (sessions.isAnEtherpadAdmin()) {
    return;
  }

  var globalPadId = pad.getId();

  var numConnections = collab_server.getNumConnections(pad);
  var numProUsers = getNumProUsers(pad);
  syncedWithCache('noprowatcher.no_pros_since', function(noProsSince) {
    if (! numConnections) {
      // no connections, clear state and we're done
      delete noProsSince[globalPadId];
    }
    else if (numProUsers) {
      // pro users in pad, so we're not in a span of time with
      // no pro users
      delete noProsSince[globalPadId];
    }
    else {
      // no pro users in pad
      var since = noProsSince[globalPadId];
      if (! since) {
        // no entry in cache, that means last time we checked
        // there were still pro users, but now there aren't
        noProsSince[globalPadId] = +new Date;
        execution.scheduleTask("noprowatcher", "noProWatcherCheckPad",
                               _EMPTY_TIME+1000, [globalPadId]);
      }
      else {
        // already in a span of time with no pro users
        if ((+new Date) - since > _EMPTY_TIME) {
          // _EMPTY_TIME milliseconds since we first noticed no pro users
          collab_server.bootAllUsersFromPad(pad, "unauth");
          pad_security.revokeAllPadAccess(globalPadId);
        }
      }
    }
  });
}

function onUserJoin(pad, userInfo) {
  checkPad(pad);
}

function onUserLeave(pad, userInfo) {
  checkPad(pad);
}