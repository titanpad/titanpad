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
import("dispatch.{Dispatcher,DirMatcher,forward}");
import("funhtml.*");
import("cache_utils.syncedWithCache");

import("etherpad.helpers");
import("etherpad.utils.*");
import("etherpad.sessions.getSession");
import("etherpad.licensing");
import("etherpad.pne.pne_utils");
import("etherpad.pro.pro_pad_db");
import("etherpad.pro.domains");
import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_accounts.getSessionProAccount");
import("etherpad.pro.pro_padlist");

import("etherpad.control.pro.account_control");
import("etherpad.control.pro.pro_padlist_control");
import("etherpad.control.pro.admin.pro_admin_control");
import("etherpad.control.pro.admin.account_manager_control");

import("etherpad.pad.activepads");
import("etherpad.pad.model");


function onRequest() {
  var disp = new Dispatcher();
  disp.addLocations([
    [DirMatcher('/ep/account/'), forward(account_control)],
    [DirMatcher('/ep/admin/'), forward(pro_admin_control)],
    [DirMatcher('/ep/padlist/'), forward(pro_padlist_control)],
  ]);
  return disp.dispatch();
}

function render_main() {
  if (request.path == '/ep/') {
    response.redirect('/');
  }

  // recent pad list
  var livePads = pro_pad_db.listLiveDomainPads();
  var recentPads = pro_pad_db.listAllDomainPads();

  var renderLivePads = function() {
    return pro_padlist.renderPadList(livePads, ['title', 'connectedUsers'], 10);
  }

  var renderRecentPads = function() {
    return pro_padlist.renderPadList(recentPads, ['title'], 10);
  };

  var r = domains.getRequestDomainRecord();

  renderFramed('pro/pro_home.ejs', {
    isEvaluation: licensing.isEvaluation(),
    evalExpDate: licensing.getLicense().expiresDate,
    account: getSessionProAccount(),
    isPNE: pne_utils.isPNE(),
    pneVersion: pne_utils.getVersionString(),
    livePads: livePads,
    recentPads: recentPads,
    renderRecentPads: renderRecentPads,
    renderLivePads: renderLivePads,
    orgName: r.orgName
  });
  return true;
}

function render_finish_activation_get() {
  if (!isActivationAllowed()) {
    response.redirect('/');
  }

  var accountList = pro_accounts.listAllDomainAccounts();
  if (accountList.length > 1) {
    response.redirect('/');
  }
  if (accountList.length == 0) {
    throw Error("accountList.length should never be 0.");
  }

  var acct = accountList[0];
  var tempPass = stringutils.randomString(10);
  pro_accounts.setTempPassword(acct, tempPass);
  account_manager_control.sendWelcomeEmail(acct, tempPass);

  var domainId = domains.getRequestDomainId();

  syncedWithCache('pro-activations', function(c) {
    delete c[domainId];
  });

  renderNoticeString(
    DIV({style: "font-size: 16pt; border: 1px solid green; background: #eeffee; margin: 2em 4em; padding: 1em;"},
      P("Success!  You will receive an email shortly with instructions."),
      DIV({style: "display: none;", id: "reference"}, acct.id, ":", tempPass)));
}

function isActivationAllowed() {
  if (request.path != '/ep/finish-activation') {
    return false;
  }
  var allowed = false;
  var domainId = domains.getRequestDomainId();
  return syncedWithCache('pro-activations', function(c) {
    if (c[domainId]) {
      return true;
    }
    return false;
  });
}

function render_payment_required_get() {
  // Users get to this page when there is a problem with billing:
  // possibilities:
  //   * they try to create a new account but they have not entered
  //   payment information
  //
  //   * their credit card lapses and any pro request fails.
  //
  //   * others?

  var message = getSession().billingProblem || "A payment is required to proceed.";
  var adminList = pro_accounts.listAllDomainAdmins();

  renderFramed("pro/pro-payment-required.ejs", {
    message: message,
    isAdmin: pro_accounts.isAdminSignedIn(),
    adminList: adminList
  });
}



