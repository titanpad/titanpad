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

import("etherpad.globals.*");
import("etherpad.utils.*");
import("etherpad.sessions.getSession");

import("etherpad.control.pro.admin.pro_admin_control");

import("etherpad.pne.pne_utils");
import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_accounts.getSessionProAccount");
import("etherpad.pro.pro_utils");
import("etherpad.pro.pro_config");
import("etherpad.pro.domains");
import("etherpad.billing.team_billing");

jimport("java.lang.System.out.println");

function _err(m) {
  if (m) {
    getSession().accountManagerError = m;
    response.redirect(request.path);
  }
}

function _renderTopDiv(mid, htmlId) {
  var m = getSession()[mid];
  if (m) {
    delete getSession()[mid];
    return DIV({id: htmlId}, m);
  } else {
    return '';
  }
}

function _errorDiv() { return _renderTopDiv('accountManagerError', 'error-message'); }
function _messageDiv() { return _renderTopDiv('accountManagerMessage', 'message'); }
function _warningDiv() { return _renderTopDiv('accountManagerWarning', 'warning'); }

function onRequest() {
  var parts = request.path.split('/');

  function dispatchAccountAction(action, handlerGet, handlerPost) {
    if ((parts[4] == action) && (isNumeric(parts[5]))) {
      if (request.isGet) { handlerGet(+parts[5]); }
      if (request.isPost) { handlerPost(+parts[5]); }
      return true;
    }
    return false;
  }

  if (dispatchAccountAction('account', render_account_get, render_account_post)) {
    return true;
  }
  if (dispatchAccountAction('delete-account', render_delete_account_get, render_delete_account_post)) {
    return true;
  };

  return false;
}

function render_main() {
  var accountList = pro_accounts.listAllDomainAccounts();
  pro_admin_control.renderAdminPage('account-manager', {
    accountList: accountList,
    messageDiv: _messageDiv,
    warningDiv: _warningDiv
  });
}

function render_new_get() {
  pro_admin_control.renderAdminPage('new-account', {
    oldData: getSession().accountManagerFormData || {},
    stringutils: stringutils,
    errorDiv: _errorDiv
  });
}

function _ensureBillingOK() {
  var activeAccounts = pro_accounts.getCachedActiveCount(domains.getRequestDomainId());
  if (activeAccounts < PRO_FREE_ACCOUNTS) {
    return;
  }

  var status = team_billing.getDomainStatus(domains.getRequestDomainId());
  if (!((status == team_billing.CURRENT)
        || (status == team_billing.PAST_DUE))) {
    _err(SPAN(
      "A payment profile is required to create more than ", PRO_FREE_ACCOUNTS,
      " accounts.  ",
      A({href: "/ep/admin/billing/", id: "billinglink"}, "Manage billing")));
  }
}

function render_new_post() {
  if (request.params.cancel) {
    response.redirect('/ep/admin/account-manager/');
  }

  _ensureBillingOK();

  var fullName = request.params.fullName;
  var email = trim(request.params.email);
  var tempPass = request.params.tempPass;
  var makeAdmin = !!request.params.makeAdmin;

  getSession().accountManagerFormData = {
    fullName: fullName,
    email: email,
    tempPass: tempPass,
    makeAdmin: makeAdmin
  };

  // validation
  if (!tempPass) {
    tempPass = stringutils.randomString(6);
  }

  _err(pro_accounts.validateEmail(email));
  _err(pro_accounts.validateFullName(fullName));
  _err(pro_accounts.validatePassword(tempPass));

  var existingAccount = pro_accounts.getAccountByEmail(email, null);
  if (existingAccount) {
    _err("There is already a account with that email address.");
  }

  pro_accounts.createNewAccount(null, fullName, email, tempPass, makeAdmin);
  var account = pro_accounts.getAccountByEmail(email, null);

  pro_accounts.setTempPassword(account, tempPass);
  sendWelcomeEmail(account, tempPass);

  delete getSession().accountManagerFormData;
  getSession().accountManagerMessage = "Account "+fullName+" ("+email+") created successfully.";
  response.redirect('/ep/admin/account-manager/');
}

function sendWelcomeEmail(account, tempPass) {
  var subj = "Welcome to EtherPad on "+pro_utils.getFullProDomain()+"!";
  var toAddr = account.email;
  var fromAddr = pro_utils.getEmailFromAddr();

  var body = renderTemplateAsString('pro/account/account-welcome-email.ejs', {
    account: account,
    adminAccount: getSessionProAccount(),
    signinLink: pro_accounts.getTempSigninUrl(account, tempPass),
    toEmail: toAddr,
    siteName: pro_config.getConfig().siteName
  });
  try {
    sendEmail(toAddr, fromAddr, subj, {}, body);
  } catch (ex) {
    var d = DIV();
    d.push(P("Warning: unable to send welcome email."));
    if (pne_utils.isPNE()) {
      d.push(P("Perhaps you have not ", 
               A({href: '/ep/admin/pne-config'}, "Configured SMTP on this server", "?")));
    }
    getSession().accountManagerWarning = d;
  }
}

// Managing a single account.
function render_account_get(accountId) {
  var account = pro_accounts.getAccountById(accountId);
  if (!account) {
    response.write("Account not found.");
    return true;
  }
  pro_admin_control.renderAdminPage('manage-account', {
    account: account,
    errorDiv: _errorDiv,
    warningDiv: _warningDiv
  });
}

function render_account_post(accountId) {
  if (request.params.cancel) {
    response.redirect('/ep/admin/account-manager/');
  }
  var newFullName = request.params.newFullName;
  var newEmail = request.params.newEmail;
  var newIsAdmin = !!request.params.newIsAdmin;

  _err(pro_accounts.validateEmail(newEmail));
  _err(pro_accounts.validateFullName(newFullName));

  if ((!newIsAdmin) && (accountId == getSessionProAccount().id)) {
    _err("You cannot remove your own administrator privileges.");
  }

  var account = pro_accounts.getAccountById(accountId);
  if (!account) {
    response.write("Account not found.");
    return true;
  }

  pro_accounts.setEmail(account, newEmail);
  pro_accounts.setFullName(account, newFullName);
  pro_accounts.setIsAdmin(account, newIsAdmin);

  getSession().accountManageMessage = "Info updated.";
  response.redirect('/ep/admin/account-manager/');
}

function render_delete_account_get(accountId) {
  var account = pro_accounts.getAccountById(accountId);
  if (!account) {
    response.write("Account not found.");
    return true;
  }
  pro_admin_control.renderAdminPage('delete-account', {
    account: account,
    errorDiv: _errorDiv
  });
}

function render_delete_account_post(accountId) {
  if (request.params.cancel) {
    response.redirect("/ep/admin/account-manager/account/"+accountId);
  }

  if (accountId == getSessionProAccount().id) {
    getSession().accountManagerError = "You cannot delete your own account.";
    response.redirect("/ep/admin/account-manager/account/"+accountId);
  }

  var account = pro_accounts.getAccountById(accountId);
  if (!account) {
    response.write("Account not found.");
    return true;
  }

  pro_accounts.setDeleted(account);
  getSession().accountManagerMessage = "The account "+account.fullName+" <"+account.email+"> has been deleted.";
  response.redirect("/ep/admin/account-manager/");
}



