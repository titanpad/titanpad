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
import("funhtml.*");
import("dispatch.{Dispatcher,DirMatcher,forward}");

import("etherpad.licensing");
import("etherpad.control.admincontrol");
import("etherpad.control.pro.admin.license_manager_control");
import("etherpad.control.pro.admin.account_manager_control");
import("etherpad.control.pro.admin.pro_config_control");
import("etherpad.control.pro.admin.team_billing_control");

import("etherpad.pad.padutils");

import("etherpad.admin.shell");
import("etherpad.sessions");
import("etherpad.sessions.getSession");

import("etherpad.pne.pne_utils");
import("etherpad.pro.pro_accounts");
import("etherpad.utils.*");

//----------------------------------------------------------------

var _pathPrefix = '/ep/admin/';

var _PRO = 1;
var _PNE_ONLY = 2;
var _ONDEMAND_ONLY = 3;

function _getLeftnavItems() {
  var nav = [
    _PRO, [
      [_PRO, null, "Admin"],
      [_PNE_ONLY, "pne-dashboard", "Server Dashboard"],
      [_PNE_ONLY, "pne-license-manager/", "Manage License"],
      [_PRO, "account-manager/", "Manage Accounts"],
      [_PRO, "recover-padtext", "Recover Pad Text"],
      [_PRO, null, "Configuration"],
      [_PRO, [[_PNE_ONLY, "pne-config", "Private Server Configuration"],
              [_PRO, "pro-config", "Application Configuration"]]],
      [_PNE_ONLY, null, "Documentation"],
      [_PNE_ONLY, "/ep/pne-manual/", "Administrator's Manual"],
      [_ONDEMAND_ONLY, null, "Billing"],
      [_ONDEMAND_ONLY, "billing/", "Payment Information"],
      [_ONDEMAND_ONLY, "billing/invoices", "Past Invoices"],
    ]
  ];
  return nav;
}

function renderAdminLeftNav() {
  function _make(x) {
    if ((x[0] == _PNE_ONLY) && !pne_utils.isPNE()) {
      return null;
    }
    if ((x[0] == _ONDEMAND_ONLY) && pne_utils.isPNE()) {
      return null;
    }

    if (x[1] instanceof Array) {
      return _makelist(x[1]);
    } else {
      return _makeitem(x);
    }
  }
  var selected;
  function _makeitem(x) {
    if (x[1]) {
      var p = x[1];
      if (x[1].charAt(0) != '/') {
        p = _pathPrefix+p;
      }
      var li = LI(A({href: p}, x[2]));
      if (stringutils.startsWith(request.path, p)) {
        // select the longest prefix match.
        if (! selected || p.length > selected.path.length) {
          selected = {path: p, li: li};
        }
      }
      return li;
    } else {
      return LI(DIV({className: 'leftnav-title'}, x[2]));
    }
  }
  function _makelist(x) {
    var ul = UL();
    x.forEach(function(y) { 
      var t = _make(y);
      if (t) { ul.push(t); }
    });
    return ul;
  }
  var d = DIV(_make(_getLeftnavItems()));
  if (selected) { 
    selected.li.attribs.className = "selected";
  }
  // leftnav looks stupid when it's not very tall.
  for (var i = 0; i < 10; i++) { d.push(BR()); }
  return d;
}

function renderAdminPage(p, data) {
  appjet.requestCache.proTopNavSelection = 'admin';
  function getAdminContent() {
    if (typeof(p) == 'function') {
      return p();
    } else {
      return renderTemplateAsString('pro/admin/'+p+'.ejs', data);
    }
  }
  renderFramed('pro/admin/admin-template.ejs', {
    getAdminContent: getAdminContent,
    renderAdminLeftNav: renderAdminLeftNav,
    validLicense: pne_utils.isServerLicensed(),
  });
}

//----------------------------------------------------------------

function onRequest() {
  var disp = new Dispatcher();
  disp.addLocations([
    [DirMatcher(license_manager_control.getPath()), forward(license_manager_control)],
    [DirMatcher('/ep/admin/account-manager/'), forward(account_manager_control)],
    [DirMatcher('/ep/admin/pro-config/'), forward(pro_config_control)],
    [DirMatcher('/ep/admin/billing/'), forward(team_billing_control)],
  ]);

  if (disp.dispatch()) {
    return true;
  }

  // request will be handled by this module.
  pro_accounts.requireAdminAccount();
}

function render_main() {
//  renderAdminPage('admin');
  response.redirect('/ep/admin/account-manager/')
}

function render_pne_dashboard() {
  renderAdminPage('pne-dashboard', {
    renderUptime: admincontrol.renderServerUptime,
    renderResponseCodes: admincontrol.renderResponseCodes,
    renderPadConnections: admincontrol.renderPadConnections,
    renderTransportStats: admincontrol.renderCometStats,
    todayActiveUsers: licensing.getActiveUserCount(),
    userQuota: licensing.getActiveUserQuota()
  });
}

var _documentedServerOptions = [
  'listen',
  'listenSecure',
  'transportUseWildcardSubdomains',
  'sslKeyStore',
  'sslKeyPassword',
  'etherpad.soffice',
  'etherpad.adminPass',
  'etherpad.SQL_JDBC_DRIVER',
  'etherpad.SQL_JDBC_URL',
  'etherpad.SQL_USERNAME',
  'etherpad.SQL_PASSWORD',
  'smtpServer',
  'smtpUser',
  'smtpPass',
  'configFile',
  'etherpad.licenseKey',
  'verbose'
];

function render_pne_config_get() {
  renderAdminPage('pne-config', {
    propKeys: _documentedServerOptions,
    appjetConfig: appjet.config
  });
}

function render_pne_advanced_get() {
  response.redirect("/ep/admin/shell");
}

function render_shell_get() {
  if (!(pne_utils.isPNE() || sessions.isAnEtherpadAdmin())) {
    return false;
  }
  appjet.requestCache.proTopNavSelection = 'admin';
  renderAdminPage('pne-shell', {
    oldCmd: getSession().pneAdminShellCmd,
    result: getSession().pneAdminShellResult,
    elapsedMs: getSession().pneAdminShellElapsed
  });
  delete getSession().pneAdminShellResult;
  delete getSession().pneAdminShellElapsed;
}

function render_shell_post() {
  if (!(pne_utils.isPNE() || sessions.isAnEtherpadAdmin())) {
    return false;
  }
  var cmd = request.params.cmd;
  var start = +(new Date);
  getSession().pneAdminShellCmd = cmd;
  getSession().pneAdminShellResult = shell.getResult(cmd);
  getSession().pneAdminShellElapsed = +(new Date) - start;
  response.redirect(request.path);
}

function render_recover_padtext_get() {
  function getNumRevisions(localPadId) {
    return padutils.accessPadLocal(localPadId, function(pad) {
      if (!pad.exists()) { return null; }
      return 1+pad.getHeadRevisionNumber();
    });
  }
  function getPadText(localPadId, revNum) {
    return padutils.accessPadLocal(localPadId, function(pad) {
      if (!pad.exists()) { return null; }
      return pad.getRevisionText(revNum);
    });
  }

  var localPadId = request.params.localPadId;
  var revNum = request.params.revNum;

  var d = DIV({style: "font-size: .8em;"});

  d.push(FORM({action: request.path, method: "get"},
            P({style: "margin-top: 0;"}, LABEL("Pad ID: "), 
            INPUT({type: "text", name: "localPadId", value: localPadId || ""}),
            INPUT({type: "submit", value: "Submit"}))));

  var showPadHelp = false;
  var revisions = null;

  if (!localPadId) {
    showPadHelp = true;
  } else {
    revisions = getNumRevisions(localPadId);
    if (!revisions) {
      d.push(P("Pad not found: "+localPadId));
    } else {
      d.push(P(B(localPadId), " has ", revisions, " revisions."));
      d.push(P("Enter a revision number (0-"+revisions+") to recover the pad text for that revision:"));
      d.push(FORM({action: request.path, method: "get"},
              P(LABEL("Revision number:"),
                INPUT({type: "hidden", name: "localPadId", value: localPadId}),
                INPUT({type: "text", name: "revNum", value: revNum || (revisions - 1)}),
                INPUT({type: "submit", value: "Submit"}))));
    }
  }

  if (showPadHelp) {
    d.push(P({style: "font-size: 1em; color: #555;"},
             'The pad ID is the same as the URL to the pad, without the leading "/".',
             '  For example, if the pad lives at http://etherpad.com/foobar,',
             ' then the pad ID is "foobar" (without the quotes).'))
  }

  if (revisions && revNum && (revNum < revisions)) {
    var padText = getPadText(localPadId, revNum);
    d.push(P(B("Pad text for ["+localPadId+"] revision #"+revNum)));
    d.push(DIV({style: "font-family: monospace; border: 1px solid #ccc; background: #ffe; padding: 1em;"}, padText));
  }

  renderAdminPage(function() { return d; });
}


