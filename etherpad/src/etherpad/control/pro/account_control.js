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
import("stringutils.*");
import("funhtml.*");
import("email.sendEmail");
import("cache_utils.syncedWithCache");

import("etherpad.helpers");
import("etherpad.utils.*");
import("etherpad.sessions.getSession");
import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_accounts.getSessionProAccount");
import("etherpad.pro.domains");
import("etherpad.pro.pro_utils");
import("etherpad.pro.pro_account_auto_signin");
import("etherpad.pro.pro_config");
import("etherpad.pad.pad_security");
import("etherpad.pad.padutils");
import("etherpad.pad.padusers");
import("etherpad.collab.collab_server");

function onRequest() {
  if (!getSession().tempFormData) {
    getSession().tempFormData = {};
  }

  return false; // path not handled here
}

//--------------------------------------------------------------------------------
// helpers
//--------------------------------------------------------------------------------

function _redirOnError(m, clearQuery) {
  if (m) {
    getSession().accountFormError = m;

    var dest = request.url;
    if (clearQuery) {
      dest = request.path;
    }
    response.redirect(dest);
  }
}

function setSigninNotice(m) {
  getSession().accountSigninNotice = m;
}

function setSessionError(m) {
  getSession().accountFormError = m;
}

function _topDiv(id, name) {
  var m = getSession()[name];
  if (m) {
    delete getSession()[name];
    return DIV({id: id}, m);
  } else {
    return '';
  }
}

function _messageDiv() { return _topDiv('account-message', 'accountMessage'); }
function _errorDiv() { return _topDiv('account-error', 'accountFormError'); }
function _signinNoticeDiv() { return _topDiv('signin-notice', 'accountSigninNotice'); }

function _renderTemplate(name, data) {
  data.messageDiv = _messageDiv;
  data.errorDiv = _errorDiv;
  data.signinNotice = _signinNoticeDiv;
  data.tempFormData = getSession().tempFormData;
  renderFramed('pro/account/'+name+'.ejs', data);
}

//----------------------------------------------------------------
// /ep/account/
//----------------------------------------------------------------

function render_main_get() {
  _renderTemplate('my-account', {
    account: getSessionProAccount(),
    changePass: getSession().changePass
  });
}

function render_update_info_get() {
  response.redirect('/ep/account/');
}

function render_update_info_post() {
  var fullName = request.params.fullName;
  var email = trim(request.params.email);

  getSession().tempFormData.email = email;
  getSession().tempFormData.fullName = fullName;

  _redirOnError(pro_accounts.validateEmail(email));
  _redirOnError(pro_accounts.validateFullName(fullName));
  
  pro_accounts.setEmail(getSessionProAccount(), email);
  pro_accounts.setFullName(getSessionProAccount(), fullName);

  getSession().accountMessage = "Info updated.";
  response.redirect('/ep/account/');
}

function render_update_password_get() {
  response.redirect('/ep/account/');
}

function render_update_password_post() {
  var password = request.params.password;
  var passwordConfirm = request.params.passwordConfirm;

  if (password != passwordConfirm) { _redirOnError('Passwords did not match.'); }

  _redirOnError(pro_accounts.validatePassword(password));
  
  pro_accounts.setPassword(getSessionProAccount(), password);

  if (getSession().changePass) {
    delete getSession().changePass;
    response.redirect('/');
  }

  getSession().accountMessage = "Password updated.";
  response.redirect('/ep/account/');
}

//--------------------------------------------------------------------------------
// signin/signout
//--------------------------------------------------------------------------------

function render_sign_in_get() {
  if (request.params.uid && request.params.tp) {
    var m = pro_accounts.authenticateTempSignIn(Number(request.params.uid), request.params.tp);
    if (m) {
      getSession().accountFormError = m;
      response.redirect('/ep/account/');
    }
  }
  if (request.params.instantSigninKey) {
    _attemptInstantSignin(request.params.instantSigninKey);
  }
  if (getSession().recentlySignedOut && getSession().accountFormError) {
    delete getSession().accountFormError;
    delete getSession().recentlySignedOut;
  }
  // Note: must check isAccountSignedIn before calling checkAutoSignin()!
  if (pro_accounts.isAccountSignedIn()) {
    _redirectToPostSigninDestination();
  }
  pro_account_auto_signin.checkAutoSignin();
  var domainRecord = domains.getRequestDomainRecord();
  var showGuestBox = false;
  if (request.params.guest && request.params.padId) {
    showGuestBox = true;
  }
  _renderTemplate('signin', {
    domain: pro_utils.getFullProDomain(),
    siteName: toHTML(pro_config.getConfig().siteName),
    email: getSession().tempFormData.email || "",
    password: getSession().tempFormData.password || "",
    rememberMe: getSession().tempFormData.rememberMe || false,
    showGuestBox: showGuestBox,
    localPadId: request.params.padId
  });
}

function _attemptInstantSignin(key) {
  // See src/etherpad/control/global_pro_account_control.js
  var email = null;
  var password = null;
  syncedWithCache('global_signin_passwords', function(c) {
    if (c[key]) {
      email = c[key].email;
      password = c[key].password;
    }
    delete c[key];
  });
  getSession().tempFormData.email = email;
  _redirOnError(pro_accounts.authenticateSignIn(email, password), true);
}

function render_sign_in_post() {
  var email = trim(request.params.email);
  var password = request.params.password;

  getSession().tempFormData.email = email;
  getSession().tempFormData.rememberMe = request.params.rememberMe;

  _redirOnError(pro_accounts.authenticateSignIn(email, password));
  pro_account_auto_signin.setAutoSigninCookie(request.params.rememberMe);
  _redirectToPostSigninDestination();
}

function render_guest_sign_in_get() {
  var localPadId = request.params.padId;
  var domainId = domains.getRequestDomainId();
  var globalPadId = padutils.makeGlobalId(domainId, localPadId);
  var userId = padusers.getUserId();

  pro_account_auto_signin.checkAutoSignin();
  pad_security.clearKnockStatus(userId, globalPadId);

  _renderTemplate('signin-guest', {
    localPadId: localPadId,
    errorMessage: getSession().guestAccessError,
    siteName: toHTML(pro_config.getConfig().siteName),
    guestName: padusers.getUserName() || ""
  });
}

function render_guest_sign_in_post() {
  function _err(m) {
    if (m) {
      getSession().guestAccessError = m;
      response.redirect(request.url);
    }
  }
  var displayName = request.params.guestDisplayName;
  var localPadId = request.params.localPadId;
  if (!(displayName && displayName.length > 0)) {
    _err("Please enter a display name");
  }
  getSession().guestDisplayName = displayName;
  response.redirect('/ep/account/guest-knock?padId='+encodeURIComponent(localPadId)+
    "&guestDisplayName="+encodeURIComponent(displayName));
}

function render_guest_knock_get() {
  var localPadId = request.params.padId;
  helpers.addClientVars({
    localPadId: localPadId,
    guestDisplayName: request.params.guestDisplayName,
    padUrl: "http://"+httpHost(request.host)+"/"+localPadId
  });
  _renderTemplate('guest-knock', {});
}

function render_guest_knock_post() {
  var localPadId = request.params.padId;
  var displayName = request.params.guestDisplayName;
  var domainId = domains.getRequestDomainId();
  var globalPadId = padutils.makeGlobalId(domainId, localPadId);
  var userId = padusers.getUserId();

  response.setContentType("text/plain; charset=utf-8");
  // has the knock already been answsered?
  var currentAnswer = pad_security.getKnockAnswer(userId, globalPadId);
  if (currentAnswer) {
    response.write(currentAnswer);
  } else {
    collab_server.guestKnock(globalPadId, userId, displayName);
    response.write("wait");
  }
}

function _redirectToPostSigninDestination() {
  var cont = request.params.cont;
  if (!cont) { cont = '/'; }
  response.redirect(cont);
}

function render_sign_out() {
  pro_account_auto_signin.setAutoSigninCookie(false);
  pro_accounts.signOut();
  delete getSession().padPasswordAuth;
  getSession().recentlySignedOut = true;
  response.redirect("/");
}

//--------------------------------------------------------------------------------
// create-admin-account (eepnet only)
//--------------------------------------------------------------------------------

function render_create_admin_account_get() {
  if (pro_accounts.doesAdminExist()) {
    renderFramedError("An admin account already exists on this domain.");
    response.stop();
  }
  _renderTemplate('create-admin-account', {});
}

function render_create_admin_account_post() {
  var email = trim(request.params.email);
  var password = request.params.password;
  var passwordConfirm = request.params.passwordConfirm;
  var fullName = request.params.fullName;

  getSession().tempFormData.email = email;
  getSession().tempFormData.fullName = fullName;

  if (password != passwordConfirm) { _redirOnError('Passwords did not match.'); }

  _redirOnError(pro_accounts.validateEmail(email));
  _redirOnError(pro_accounts.validateFullName(fullName));
  _redirOnError(pro_accounts.validatePassword(password));

  pro_accounts.createNewAccount(null, fullName, email, password, true);

  var u = pro_accounts.getAccountByEmail(email, null);

  // TODO: should we send a welcome email here?
  //pro_accounts.sendWelcomeEmail(u);

  _redirOnError(pro_accounts.authenticateSignIn(email, password));

  response.redirect("/");
}


//--------------------------------------------------------------------------------
// forgot password
//--------------------------------------------------------------------------------

function render_forgot_password_get() {
  if (request.params.instantSubmit && request.params.email) {
    render_forgot_password_post();
  } else {
    _renderTemplate('forgot-password', {
      email: getSession().tempFormData.email || ""
    });
  }
}

function render_forgot_password_post() {
  var email = trim(request.params.email);

  getSession().tempFormData.email = email;

  var u = pro_accounts.getAccountByEmail(email, null);
  if (!u) {
    _redirOnError("Account not found: "+email);
  }

  var tempPass = stringutils.randomString(10);
  pro_accounts.setTempPassword(u, tempPass);

  var subj = "EtherPad: Request to reset your password on "+request.domain;
  var body = renderTemplateAsString('pro/account/forgot-password-email.ejs', {
    account: u,
    recoverUrl: pro_accounts.getTempSigninUrl(u, tempPass)
  });
  var fromAddr = pro_utils.getEmailFromAddr();
  sendEmail(u.email, fromAddr, subj, {}, body);

  getSession().accountMessage = "An email has been sent to "+u.email+" with instructions to reset the password.";
  response.redirect(request.path);
}



