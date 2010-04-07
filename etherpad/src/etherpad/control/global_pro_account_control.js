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

import("funhtml.*");
import("stringutils");
import("stringutils.*");
import("email.sendEmail");
import("cache_utils.syncedWithCache");

import("etherpad.utils.*");
import("etherpad.sessions.getSession");

import("etherpad.pro.domains");
import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_utils");

jimport("java.lang.System.out.println");

function onRequest() {
  if (!getSession().oldFormData) {
    getSession().oldFormData = {};
  }
  return false;  // not handled yet.
}

function _errorDiv() {
  var m = getSession().proAccountControlError;
  delete getSession().proAccountControlError;
  if (m) {
    return DIV({className: "error"}, m);
  }
  return "";
}

function _redirectError(m) {
  getSession().proAccountControlError = m;
  response.redirect(request.path);
}


function render_main_get() {
  response.redirect('/ep/pro-account/sign-in');
}

function render_sign_in_get() {
  renderFramed('pro-account/sign-in.ejs', {
    oldData: getSession().oldFormData,
    errorDiv: _errorDiv
  });
}


function render_sign_in_post() {
  var email = trim(request.params.email);
  var password = request.params.password;
  var subDomain = request.params.subDomain;

  subDomain = subDomain.toLowerCase();

  getSession().oldFormData.email = email;
  getSession().oldFormData.subDomain = subDomain;

  var domainRecord = domains.getDomainRecordFromSubdomain(subDomain);
  if (!domainRecord) {
    _redirectError("Site address not found: "+subDomain+"."+request.host);
  }

  var instantSigninKey = stringutils.randomString(20);
  syncedWithCache('global_signin_passwords', function(c) {
    c[instantSigninKey] = {
      email: email,
      password: password
    };
  });

  response.redirect(
    "https://"+subDomain+"."+httpsHost(request.host)+
    "/ep/account/sign-in?instantSigninKey="+instantSigninKey);
}

function render_recover_get() {
  renderFramed('pro-account/recover.ejs', {
    oldData: getSession().oldFormData,
    errorDiv: _errorDiv
  });
}

function render_recover_post() {

  function _recoverLink(accountRecord, domainRecord) {
    var host = (domainRecord.subDomain + "." + httpsHost(request.host));
    return (
      "https://"+host+"/ep/account/forgot-password?instantSubmit=1&email="+
      encodeURIComponent(accountRecord.email));
  }

  var email = trim(request.params.email);

  // lookup all domains associated with this email
  var accountList = pro_accounts.getAllAccountsWithEmail(email);
  println("account records matching ["+email+"]: "+accountList.length);

  var domainList = [];
  for (var i = 0; i < accountList.length; i++) {
    domainList[i] = domains.getDomainRecord(accountList[i].domainId);
  }

  if (accountList.length == 0) {
    _redirectError("No accounts were found associated with the email address \""+email+"\".");
  }
  if (accountList.length == 1) {
    response.redirect(_recoverLink(accountList[0], domainList[0]));
  }
  if (accountList.length > 1) {
    var fromAddr = '"EtherPad Support" <support@etherpad.com>';
    var subj = "EtherPad: account information";
    var body = renderTemplateAsString(
      'pro/account/global-multi-domain-recover-email.ejs', {
        accountList: accountList,
        domainList: domainList,
        recoverLink: _recoverLink,
        email: email
      }
    );
    sendEmail(email, fromAddr, subj, {}, body);
    pro_utils.renderFramedMessage("Instructions have been sent to "+email+".");
  }
}


