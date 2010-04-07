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

import("sqlbase.sqlobj");
import("stringutils");

import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_accounts.getSessionProAccount");

jimport("java.lang.System.out.println");

var _COOKIE_NAME = "PUAS";

function dmesg(m) {
  if (false) {
    println("[pro-account-auto-sign-in]: "+m);
  }
}

function checkAutoSignin() {
  dmesg("checking auto sign-in...");
  if (pro_accounts.isAccountSignedIn()) {
    dmesg("account already signed in...");
    // don't mess with already signed-in account 
    return;
  }
  var cookie = request.cookies[_COOKIE_NAME];
  if (!cookie) {
    dmesg("no auto-sign-in cookie found...");
    return;
  }
  var record = sqlobj.selectSingle('pro_accounts_auto_signin', {cookie: cookie}, {});
  if (!record) {
    return;
  }

  var now = +(new Date);
  if (+record.expires < now) {
    sqlobj.deleteRows('pro_accounts_auto_signin', {id: record.id});
    response.deleteCookie(_COOKIE_NAME);
    dmesg("deleted expired record...");
    return;
  }
  // do auto-signin (bypasses normal security)
  dmesg("Doing auto sign in...");
  var account = pro_accounts.getAccountById(record.accountId);
  pro_accounts.signInSession(account);
  response.redirect('/ep/account/sign-in?cont='+encodeURIComponent(request.url));
}

function setAutoSigninCookie(rememberMe) {
  if (!pro_accounts.isAccountSignedIn()) {
    return; // only call this function after account is already signed in.
  }

  var accountId = getSessionProAccount().id;
  // delete any existing auto-signins for this account.
  sqlobj.deleteRows('pro_accounts_auto_signin', {accountId: accountId});

  // set this insecure cookie just to indicate that account is auto-sign-in-able
  response.setCookie({
    name: "ASIE",
    value: (rememberMe ? "T" : "F"),
    path: "/",
    domain: request.domain,
    expires: new Date(32503708800000), // year 3000
  });

  if (!rememberMe) {
    return;
  }

  var cookie = stringutils.randomHash(16);
  var now = +(new Date);
  var expires = new Date(now + 1000*60*60*24*30); // 30 days
  //var expires = new Date(now + 1000 * 60 * 5); // 2 minutes

  sqlobj.insert('pro_accounts_auto_signin', {cookie: cookie, accountId: accountId, expires: expires});
  response.setCookie({
    name: _COOKIE_NAME,
    value: cookie,
    path: "/ep/account/",
    domain: request.domain,
    expires: new Date(32503708800000), // year 3000
    secure: true
  });
}

