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

import("etherpad.sessions.getSession");
import("etherpad.sessions");

import("etherpad.pad.model");
import("etherpad.pad.padutils");
import("etherpad.pad.padusers");
import("etherpad.pro.domains");
import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_accounts.getSessionProAccount");
import("etherpad.pro.pro_padmeta");
import("etherpad.pro.pro_utils");
import("etherpad.pro.pro_utils.isProDomainRequest");
import("etherpad.pad.noprowatcher");

//--------------------------------------------------------------------------------
// granting session permanent access to pads (for the session)
//--------------------------------------------------------------------------------

function _grantSessionAccessTo(globalPadId) {
  var userId = padusers.getUserId();
  syncedWithCache("pad-auth."+globalPadId, function(c) {
    c[userId] = true;
  });
}

function _doesSessionHaveAccessTo(globalPadId) {
  var userId = padusers.getUserId();
  return syncedWithCache("pad-auth."+globalPadId, function(c) {
    return c[userId];
  });
}

function revokePadUserAccess(globalPadId, userId) {
  syncedWithCache("pad-auth."+globalPadId, function(c) {
    delete c[userId];
  });
}

function revokeAllPadAccess(globalPadId) {
  syncedWithCache("pad-auth."+globalPadId, function(c) {
    for (k in c) {
      delete c[k];
    }
  });
}

//--------------------------------------------------------------------------------
// knock/answer
//--------------------------------------------------------------------------------

function clearKnockStatus(userId, globalPadId) {
  syncedWithCache("pad-guest-knocks."+globalPadId, function(c) {
    delete c[userId];
  });
}

// called by collab_server when accountholders approve or deny
function answerKnock(userId, globalPadId, status) {
  // status is either "approved" or "denied"
  syncedWithCache("pad-guest-knocks."+globalPadId, function(c) {
    // If two account-holders respond to the knock, keep the first one.
    if (!c[userId]) {
      c[userId] = status;
    }
  });
}

// returns "approved", "denied", or undefined
function getKnockAnswer(userId, globalPadId) {
  return syncedWithCache("pad-guest-knocks."+globalPadId, function(c) {
    return c[userId];
  });
}

//--------------------------------------------------------------------------------
//  main entrypoint called for every accessPad()
//--------------------------------------------------------------------------------

var _insideCheckAccessControl = false;

function checkAccessControl(globalPadId, rwMode) {
  if (!request.isDefined) {
    return; // TODO: is this the right thing to do here?
    // Empirical evidence indicates request.isDefined during comet requests,
    // but not during tasks, which is the behavior we want.
  }

  if (_insideCheckAccessControl) {
    // checkAccessControl is always allowed to access pads itself
    return;
  }
  if (isProDomainRequest() && (request.path == "/ep/account/guest-knock")) {
    return;
  }
  if (!isProDomainRequest() && (request.path == "/ep/admin/padinspector")) {
    return;
  }
  if (isProDomainRequest() && (request.path == "/ep/padlist/all-pads.zip")) {
    return;
  }
  try {
    _insideCheckAccessControl = true;

    if (!padutils.isProPadId(globalPadId)) {
      // no access control on non-pro pads yet.
      return;
    }

    if (sessions.isAnEtherpadAdmin()) {
      return;
    }
    if (_doesSessionHaveAccessTo(globalPadId)) {
      return;
    }
    _checkDomainSecurity(globalPadId);
    _checkGuestSecurity(globalPadId);
    _checkPasswordSecurity(globalPadId);

    // remember that this user has access
    _grantSessionAccessTo(globalPadId);
  }
  finally {
    // this always runs, even on error or stop
    _insideCheckAccessControl = false;
  }
}

function _checkDomainSecurity(globalPadId) {
  var padDomainId = padutils.getDomainId(globalPadId);
  if (!padDomainId) {
    return; // global pad
  }
  if (pro_utils.isProDomainRequest()) {
    var requestDomainId = domains.getRequestDomainId();
    if (requestDomainId != padDomainId) {
      throw Error("Request cross-domain pad access not allowed.");
    }
  }
}

function _checkGuestSecurity(globalPadId) {
  if (!getSession().guestPadAccess) {
    getSession().guestPadAccess = {};
  }

  var padDomainId = padutils.getDomainId(globalPadId);
  var isAccountHolder = pro_accounts.isAccountSignedIn();
  if (isAccountHolder) {
    if (getSessionProAccount().domainId != padDomainId) {
      throw Error("Account cross-domain pad access not allowed.");
    }
    return; // OK
  }

  // Not an account holder ==> Guest

  // returns either "allow", "ask", or "deny"
  var guestPolicy = model.accessPadGlobal(globalPadId, function(p) {
    if (!p.exists()) {
      return "deny";
    } else {
      return p.getGuestPolicy();
    }
  });

  var numProUsers = model.accessPadGlobal(globalPadId, function(pad) {
    return noprowatcher.getNumProUsers(pad);
  });

  if (guestPolicy == "allow") {
    return;
  }
  if (guestPolicy == "deny") {
    pro_accounts.requireAccount("Guests are not allowed to join that pad.  Please sign in.");
  }
  if (guestPolicy == "ask") {
    if (numProUsers < 1) {
      pro_accounts.requireAccount("This pad's security policy does not allow guests to join unless an account-holder is connected to the pad.");
    }
    var userId = padusers.getUserId();

    // one of {"approved", "denied", undefined}
    var knockAnswer = getKnockAnswer(userId, globalPadId);
    if (knockAnswer == "approved") {
      return;
    } else {
      var localPadId = padutils.globalToLocalId(globalPadId);
      response.redirect('/ep/account/guest-sign-in?padId='+encodeURIComponent(localPadId));
    }
  }
}

function _checkPasswordSecurity(globalPadId) {
  if (!getSession().padPasswordAuth) {
    getSession().padPasswordAuth = {};
  }
  if (getSession().padPasswordAuth[globalPadId] == true) {
    return;
  }
  var domainId = padutils.getDomainId(globalPadId);
  var localPadId = globalPadId.split("$")[1];

  if (stringutils.startsWith(request.path, "/ep/admin/recover-padtext")) {
    return;
  }

  var p = pro_padmeta.accessProPad(globalPadId, function(propad) {
    if (propad.exists()) {
      return propad.getPassword();
    } else {
      return null;
    }
  });
  if (p) {
    response.redirect('/ep/pad/auth/'+localPadId+'?cont='+encodeURIComponent(request.url));
  }
}

