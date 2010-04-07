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

// library for pro accounts

import("funhtml.*");
import("sqlbase.sqlobj");
import("sqlbase.sqlcommon.inTransaction");
import("email.sendEmail");
import("cache_utils.syncedWithCache");
import("stringutils.*");

import("etherpad.globals.*");
import("etherpad.sessions");
import("etherpad.sessions.getSession");
import("etherpad.utils.*");
import("etherpad.pro.domains");
import("etherpad.control.pro.account_control");
import("etherpad.pro.pro_utils");
import("etherpad.pro.pro_quotas");
import("etherpad.pad.padusers");
import("etherpad.log");
import("etherpad.billing.team_billing");

jimport("org.mindrot.BCrypt");
jimport("java.lang.System.out.println");

function _dmesg(m) {
  if (!isProduction()) {
    println(m);
  }
}

function _computePasswordHash(p) {
  var pwh;
  pwh = BCrypt.hashpw(p, BCrypt.gensalt(10));
  return pwh;
}

function _withCache(name, fn) {
  return syncedWithCache('pro_accounts.'+name, fn);
}

//----------------------------------------------------------------
// validation
//----------------------------------------------------------------

function validateEmail(email) {
  if (!email) { return "Email is required."; }
  if (!isValidEmail(email)) { return "\""+email+"\" does not look like a valid email address."; }
  return null;
}

function validateFullName(name) {
  if (!name) { return "Full name is required."; }
  if (name.length < 2) { return "Full name must be at least 2 characters."; }
  return null;
}

function validatePassword(p) {
  if (!p) { return "Password is required."; }
  if (p.length < 6) { return "Passwords must be at least 6 characters."; }
  return null;
}

function validateEmailDomainPair(email, domainId) {
  // TODO: make sure the same email address cannot exist more than once within
  // the same domainid.
}

/* if domainId is null, then use domainId of current request. */
function createNewAccount(domainId, fullName, email, password, isAdmin) {
  if (!domainId) {
    domainId = domains.getRequestDomainId();
  }
  email = trim(email);
  isAdmin = !!isAdmin; // convert to bool

  // validation
  var e;
  e = validateEmail(email); if (e) { throw Error(e); }
  e = validateFullName(fullName); if (e) { throw Error(e); }
  e = validatePassword(password); if (e) { throw Error(e); }

  // xss normalization
  fullName = toHTML(fullName);

  // make sure account does not already exist on this domain.
  var ret = inTransaction(function() {
    var existingAccount = getAccountByEmail(email, domainId);
    if (existingAccount) {
      throw Error("There is already an account with that email address.");
    }
    // No existing account.  Proceed.
    var now = new Date();
    var account = {
      domainId: domainId,
      fullName: fullName,
      email: email,
      passwordHash: _computePasswordHash(password),
      createdDate: now,
      isAdmin: isAdmin
    };
    return sqlobj.insert('pro_accounts', account);
  });

  _withCache('does-domain-admin-exist', function(cache) {
    delete cache[domainId];
  });

  pro_quotas.updateAccountUsageCount(domainId);
  updateCachedActiveCount(domainId);

  if (ret) {
    log.custom('pro-accounts',
              {type: "account-created",
               accountId: ret,
               domainId: domainId,
               name: fullName,
               email: email,
               admin: isAdmin});
  }

  return ret;
}

function _checkAccess(account) {
  if (sessions.isAnEtherpadAdmin()) {
    return;
  }
  if (account.domainId != domains.getRequestDomainId()) {
    throw Error("access denied");
  }
}

function setPassword(account, newPass) {
  _checkAccess(account);
  var passHash = _computePasswordHash(newPass);
  sqlobj.update('pro_accounts', {id: account.id}, {passwordHash: passHash});
  markDirtySessionAccount(account.id);
}

function setTempPassword(account, tempPass) {
  _checkAccess(account);
  var tempPassHash = _computePasswordHash(tempPass);
  sqlobj.update('pro_accounts', {id: account.id}, {tempPassHash: tempPassHash});
  markDirtySessionAccount(account.id);
}

function setEmail(account, newEmail) {
  _checkAccess(account);
  sqlobj.update('pro_accounts', {id: account.id}, {email: newEmail});
  markDirtySessionAccount(account.id);
}

function setFullName(account, newName) {
  _checkAccess(account);
  sqlobj.update('pro_accounts', {id: account.id}, {fullName: newName});
  markDirtySessionAccount(account.id);
}

function setIsAdmin(account, newVal) {
  _checkAccess(account);
  sqlobj.update('pro_accounts', {id: account.id}, {isAdmin: newVal});
  markDirtySessionAccount(account.id);
}

function setDeleted(account) {
  _checkAccess(account);
  if (!isNumeric(account.id)) {
    throw new Error("Invalid account id: "+account.id);
  }
  sqlobj.update('pro_accounts', {id: account.id}, {isDeleted: true});
  markDirtySessionAccount(account.id);
  pro_quotas.updateAccountUsageCount(account.domainId);
  updateCachedActiveCount(account.domainId);

  log.custom('pro-accounts',
             {type: "account-deleted",
              accountId: account.id,
              domainId: account.domainId,
              name: account.fullName,
              email: account.email,
              admin: account.isAdmin,
              createdDate: account.createdDate.getTime()});
}

//----------------------------------------------------------------

function doesAdminExist() {
  var domainId = domains.getRequestDomainId();
  return _withCache('does-domain-admin-exist', function(cache) {
    if (cache[domainId] === undefined) {
      _dmesg("cache miss for doesAdminExist (domainId="+domainId+")");
      var admins = sqlobj.selectMulti('pro_accounts', {domainId: domainId, isAdmin: true}, {});
      cache[domainId] = (admins.length > 0);
    }
    return cache[domainId]
  });
}

function getSessionProAccount() {
  if (sessions.isAnEtherpadAdmin()) {
    return getEtherpadAdminAccount();
  }
  var account = getSession().proAccount;
  if (!account) {
    return null;
  }
  if (account.isDeleted) {
    delete getSession().proAccount;
    return null;
  }
  return account;
}

function isAccountSignedIn() {
  if (getSessionProAccount()) {
    return true;
  } else {
    return false;
  }
}

function isAdminSignedIn() {
  return isAccountSignedIn() && getSessionProAccount().isAdmin;
}

function requireAccount(message) {
  if ((request.path == "/ep/account/sign-in") ||
      (request.path == "/ep/account/sign-out") ||
      (request.path == "/ep/account/guest-sign-in") ||
      (request.path == "/ep/account/guest-knock") ||
      (request.path == "/ep/account/forgot-password")) {
    return;
  }

  function checkSessionAccount() {
    if (!getSessionProAccount()) {
      if (message) {
        account_control.setSigninNotice(message);
      }
      response.redirect('/ep/account/sign-in?cont='+encodeURIComponent(request.url));
    }
  }

  checkSessionAccount();

  if (getSessionProAccount().domainId != domains.getRequestDomainId()) {
    // This should theoretically never happen unless the account is spoofing cookies / trying to
    // hack the site.
    pro_utils.renderFramedMessage("Permission denied.");
    response.stop();
  }
  // update dirty session account if necessary
  _withCache('dirty-session-accounts', function(cache) {
    var uid = getSessionProAccount().id;
    if (cache[uid]) {
      reloadSessionAccountData(uid);
      cache[uid] = false;
    }
  });

  // need to check again in case dirty update caused account to be marked
  // deleted.
  checkSessionAccount();
}

function requireAdminAccount() {
  requireAccount();
  if (!getSessionProAccount().isAdmin) {
    pro_utils.renderFramedMessage("Permission denied.");
    response.stop();
  }
}

/* returns undefined on success, error string otherise. */
function authenticateSignIn(email, password) {
  var accountRecord = getAccountByEmail(email, null);
  if (!accountRecord) {
    return "Account not found: "+email;
  }

  if (BCrypt.checkpw(password, accountRecord.passwordHash) != true) {
    return "Incorrect password.  Please try again.";
  }

  signInSession(accountRecord);

  return undefined; // success
}

function signOut() {
  delete getSession().proAccount;
}

function authenticateTempSignIn(uid, tempPass) {
  var emsg = "That password reset link that is no longer valid.";

  var account = getAccountById(uid);
  if (!account) {
    return emsg+" (Account not found.)";
  }
  if (account.domainId != domains.getRequestDomainId()) {
    return emsg+" (Wrong domain.)";
  }
  if (!account.tempPassHash) {
    return emsg+" (Expired.)";
  }
  if (BCrypt.checkpw(tempPass, account.tempPassHash) != true) {
    return emsg+" (Bad temp pass.)";
  }

  signInSession(account);

  getSession().accountMessage = "Please choose a new password";
  getSession().changePass = true;

  response.redirect("/ep/account/");
}

function signInSession(account) {
  account.lastLoginDate = new Date();
  account.tempPassHash = null;
  sqlobj.updateSingle('pro_accounts', {id: account.id}, account);
  reloadSessionAccountData(account.id);
  padusers.notifySignIn();
}

function listAllDomainAccounts(domainId) {
  if (domainId === undefined) {
    domainId = domains.getRequestDomainId();
  }
  var records = sqlobj.selectMulti('pro_accounts',
    {domainId: domainId, isDeleted: false}, {});
  return records;
}

function listAllDomainAdmins(domainId) {
  if (domainId === undefined) {
    domainId = domains.getRequestDomainId();
  }
  var records = sqlobj.selectMulti('pro_accounts',
    {domainId: domainId, isDeleted: false, isAdmin: true},
    {});
  return records;
}

function getActiveCount(domainId) {
  var records = sqlobj.selectMulti('pro_accounts',
    {domainId: domainId, isDeleted: false}, {});
  return records.length;
}

/* getAccountById works for deleted and non-deleted accounts.
 * The assumption is that cases whewre you look up an account by ID, you
 * want the account info even if the account has been deleted.  For
 * example, when asking who created a pad.
 */
function getAccountById(accountId) {
  var r = sqlobj.selectSingle('pro_accounts', {id: accountId});
  if (r) {
    return r;
  } else {
    return undefined;
  }
}

/* getting an account by email only returns the account if it is
 * not deleted.  The assumption is that when you look up an account by
 * email address, you only want active accounts.  Furthermore, some
 * deleted accounts may match a given email, but only one non-deleted
 * account should ever match a single (email,domainId) pair.
 */
function getAccountByEmail(email, domainId) {
  if (!domainId) {
    domainId = domains.getRequestDomainId();
  }
  var r = sqlobj.selectSingle('pro_accounts', {domainId: domainId, email: email, isDeleted: false});
  if (r) {
    return r;
  } else {
    return undefined;
  }
}

function getFullNameById(id) {
  if (!id) {
    return null;
  }

  return _withCache('names-by-id', function(cache) {
    if (cache[id] === undefined) {
      _dmesg("cache miss for getFullNameById (accountId="+id+")");
      var r = getAccountById(id);
      if (r) {
        cache[id] = r.fullName;
      } else {
        cache[id] = false;
      }
    }
    if (cache[id]) {
      return cache[id];
    } else {
      return null;
    }
  });
}

function getTempSigninUrl(account, tempPass) {
  return [
    'https://', httpsHost(pro_utils.getFullProHost()), '/ep/account/sign-in?',
    'uid=', account.id, '&tp=', tempPass
  ].join('');
}


// TODO: this session account object storage / dirty cache is a
// ridiculous hack.  What we should really do is have a caching/access
// layer for accounts similar to accessPad() and accessProPadMeta(), and
// have that abstraction take care of caching and marking accounts as
// dirty.  This can be incorporated into getSessionProAccount(), and we
// should actually refactor that into accessSessionProAccount().

/* will force session data for this account to be updated next time that
 * account requests a page. */
function markDirtySessionAccount(uid) {
  var domainId = domains.getRequestDomainId();

  _withCache('dirty-session-accounts', function(cache) {
    cache[uid] = true;
  });
  _withCache('names-by-id', function(cache) {
    delete cache[uid];
  });
  _withCache('does-domain-admin-exist', function(cache) {
    delete cache[domainId];
  });
}

function reloadSessionAccountData(uid) {
  if (!uid) {
    uid = getSessionProAccount().id;
  }
  getSession().proAccount = getAccountById(uid);
}

function getAllAccountsWithEmail(email) {
  var accountRecords = sqlobj.selectMulti('pro_accounts', {email: email, isDeleted: false}, {});
  return accountRecords;
}

function getEtherpadAdminAccount() {
  return {
    id: 0,
    isAdmin: true,
    fullName: "ETHERPAD ADMIN",
    email: "support@etherpad.com",
    domainId: domains.getRequestDomainId(),
    isDeleted: false
  };
}

function getCachedActiveCount(domainId) {
  return _withCache('user-counts.'+domainId, function(c) {
    if (!c.count) {
      c.count = getActiveCount(domainId);
    }
    return c.count;
  });
}

function updateCachedActiveCount(domainId) {
  _withCache('user-counts.'+domainId, function(c) {
    c.count = getActiveCount(domainId);
  });
}






