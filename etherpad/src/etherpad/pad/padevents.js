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

// src/etherpad/events.js

import("etherpad.licensing");
import("etherpad.log");
import("etherpad.pad.chatarchive");
import("etherpad.pad.activepads");
import("etherpad.pad.padutils");
import("etherpad.sessions");
import("etherpad.pro.pro_padmeta");
import("etherpad.pro.pro_pad_db");
import("etherpad.pad.padusers");
import("etherpad.pad.pad_security");
import("etherpad.pad.noprowatcher");
import("etherpad.collab.collab_server");
jimport("java.lang.System.out.println");

function onNewPad(pad) {
  log.custom("padevents", {
    type: "newpad",
    padId: pad.getId()
  });
  pro_pad_db.onCreatePad(pad);
}

function onDestroyPad(pad) {
  log.custom("padevents", {
    type: "destroypad",
    padId: pad.getId()
  });
  pro_pad_db.onDestroyPad(pad);
}

function onUserJoin(pad, userInfo) {
  log.callCatchingExceptions(function() {

    var name = userInfo.name || "unnamed";
    log.custom("padevents", {
      type: "userjoin",
      padId: pad.getId(),
      username: name,
      ip: userInfo.ip,
      userId: userInfo.userId
    });
    activepads.touch(pad.getId());
    licensing.onUserJoin(userInfo);
    log.onUserJoin(userInfo.userId);
    padusers.notifyActive();
    noprowatcher.onUserJoin(pad, userInfo);

  });
}

function onUserLeave(pad, userInfo) {
  log.callCatchingExceptions(function() {

    var name = userInfo.name || "unnamed";
    log.custom("padevents", {
      type: "userleave",
      padId: pad.getId(),
      username: name,
      ip: userInfo.ip,
      userId: userInfo.userId
    });
    activepads.touch(pad.getId());
    licensing.onUserLeave(userInfo);
    noprowatcher.onUserLeave(pad, userInfo);

  });
}

function onUserInfoChange(pad, userInfo) {
  log.callCatchingExceptions(function() {

    activepads.touch(pad.getId());

  });
}

function onClientMessage(pad, senderUserInfo, msg) {
  var padId = pad.getId();
  activepads.touch(padId);

  if (msg.type == "chat") {

    chatarchive.onChatMessage(pad, senderUserInfo, msg);

    var name = "unnamed";
    if (senderUserInfo.name) {
      name = senderUserInfo.name;
    }

    log.custom("chat", {
      padId: padId,
      userId: senderUserInfo.userId,
      username: name,
      text: msg.lineText
    });
  }
  else if (msg.type == "padtitle") {
    if (msg.title && padutils.isProPadId(pad.getId())) {
      pro_padmeta.accessProPad(pad.getId(), function(propad) {
        propad.setTitle(String(msg.title).substring(0, 80));
      });
    }
  }
  else if (msg.type == "padpassword") {
    if (padutils.isProPadId(pad.getId())) {
      pro_padmeta.accessProPad(pad.getId(), function(propad) {
        propad.setPassword(msg.password || null);
      });
    }
  }
  else if (msg.type == "padoptions") {
    // options object is a full set of options or just
    // some options to change
    var opts = msg.options;
    var padOptions = pad.getPadOptionsObj();
    if (opts.view) {
      if (! padOptions.view) {
        padOptions.view = {};
      }
      for(var k in opts.view) {
        padOptions.view[k] = opts.view[k];
      }
    }
    if (opts.guestPolicy) {
      padOptions.guestPolicy = opts.guestPolicy;
      if (opts.guestPolicy == 'deny') {
        // boot guests!
        collab_server.bootUsersFromPad(pad, "unauth", function(userInfo) {
          return padusers.isGuest(userInfo.userId); }).forEach(function(userInfo) {
            pad_security.revokePadUserAccess(padId, userInfo.userId); });
      }
    }
  }
  else if (msg.type == "guestanswer") {
    if ((! msg.authId) || padusers.isGuest(msg.authId)) {
      // not a pro user, forbid.
    }
    else {
      pad_security.answerKnock(msg.guestId, padId, msg.answer);
    }
  }
}

function onEditPad(pad, authorId) {
  log.callCatchingExceptions(function() {

    pro_pad_db.onEditPad(pad, authorId);

  });
}


