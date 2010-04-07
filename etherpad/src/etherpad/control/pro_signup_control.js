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

import("jsutils.*");
import("cache_utils.syncedWithCache");
import("funhtml.*");
import("stringutils");
import("stringutils.*");
import("sqlbase.sqlcommon");

import("etherpad.sessions.getSession");
import("etherpad.utils.*");

import("etherpad.pro.pro_accounts");
import("etherpad.pro.domains");

import("etherpad.control.pro_beta_control");
import("etherpad.control.pro.admin.account_manager_control");

import("etherpad.helpers");

function onRequest() {
  if (!getSession().ods) {
    getSession().ods = {};
  }
  if (request.method == "POST") {
    // add params to cart
    eachProperty(request.params, function(k,v) {
      getSession().ods[k] = stringutils.toHTML(v);
    });
  }
}

function _errorDiv() {
  var m = getSession().errorMessage;
  if (m) {
    delete getSession().errorMessage;
    return DIV({className: 'err'}, m);
  }
  return "";
}

function _input(id, type) {
  return INPUT({type: type ? type : 'text', name: id, id: id,
                value: getSession().ods[id] || ""});
}

function _inf(id, label, type) {
  return DIV(
    DIV({style: "width: 100px; text-align: right; float: left; padding-top: 3px;"}, label, ":  "),
    DIV({style: "text-align: left; float: left;"},
        _input(id, type)),
    DIV({style: "height: 6px; clear: both;"}, " "));
}

function render_main_get() {
  // observe activation code
  if (request.params.sc) {
    getSession().betaActivationCode = request.params.sc;
    response.redirect(request.path);
  }

  // validate activation code
  var activationCode = getSession().betaActivationCode;
  var err = pro_beta_control.isValidCode(activationCode);
  if (err) {
    renderNoticeString(DIV({style: "border: 1px solid red; background: #fdd; font-weight: bold; padding: 1em;"},
      err));
    response.stop();
  }

  // serve activation page
  renderFramed('main/pro_signup_body.ejs', {
    errorDiv: _errorDiv,
    input: _input,
    inf: _inf
  });
}

function _err(m) {
  if (m) {
    getSession().errorMessage = m;
    response.redirect(request.path);
  }
}

function render_main_post() {
  var subdomain = trim(String(request.params.subdomain).toLowerCase());
  var fullName = request.params.fullName;
  var email = trim(request.params.email);

  // validate activation code
  var activationCode = getSession().betaActivationCode;
  var err = pro_beta_control.isValidCode(activationCode);
  if (err) {
    resonse.write(err);
  }

  /*
  var password = request.params.password;
  var passwordConfirm = request.params.passwordConfirm;
  */
  var orgName = subdomain;

  //---- basic validation ----
  if (!/^\w[\w\d\-]*$/.test(subdomain)) {
    _err("Invalid domain: "+subdomain);
  }
  if (subdomain.length < 2) {
    _err("Subdomain must be at least 2 characters.");
  }
  if (subdomain.length > 60) {
    _err("Subdomain must be <= 60 characters.");
  }

/*
  if (password != passwordConfirm) {
    _err("Passwords do not match.");
  }
  */

  _err(pro_accounts.validateFullName(fullName));
  _err(pro_accounts.validateEmail(email));
//  _err(pro_accounts.validatePassword(password));

  //---- database validation ----

  if (domains.doesSubdomainExist(subdomain)) {
    _err("The domain "+subdomain+" is already in use.");
  }

  //---- looks good.  create records! ----

  // TODO: log a bunch of stuff, and request IP address, etc.

  var ok = false;
  sqlcommon.inTransaction(function() {
    var tempPass = stringutils.randomString(10);
    // TODO: move validation code into domains.createNewSubdomain...
    var domainId = domains.createNewSubdomain(subdomain, orgName);
    var accountId = pro_accounts.createNewAccount(domainId, fullName, email, tempPass, true);
    // send welcome email
    syncedWithCache('pro-activations', function(c) {
      c[domainId] = true;
    });
    ok = true;
    if (activationCode) {
      pro_beta_control.notifyActivated(activationCode);
    }
  });

  if (ok) {
    response.redirect('http://'+subdomain+"."+request.host+'/ep/finish-activation');
  } else {
    response.write("There was an error processing your request.");
  }
}

