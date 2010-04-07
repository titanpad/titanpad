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
import("comet");
import("email.sendEmail");
import("fastJSON");
import("jsutils.eachProperty");
import("sqlbase.sqlbase");
import("stringutils.{toHTML,md5}");
import("stringutils");

import("etherpad.collab.collab_server");
import("etherpad.debug.dmesg");
import("etherpad.globals.*");
import("etherpad.helpers");
import("etherpad.licensing");
import("etherpad.quotas");
import("etherpad.log");
import("etherpad.log.{logRequest,logException}");
import("etherpad.sessions");
import("etherpad.sessions.getSession");
import("etherpad.utils.*");
import("etherpad.pro.pro_padmeta");
import("etherpad.pro.pro_pad_db");
import("etherpad.pro.pro_utils");
import("etherpad.pro.pro_accounts.getSessionProAccount");
import("etherpad.pro.domains");
import("etherpad.pro.pro_config");
import("etherpad.pne.pne_utils");
import("etherpad.pro.pro_quotas");

import("etherpad.pad.revisions");
import("etherpad.pad.chatarchive");
import("etherpad.pad.model");
import("etherpad.pad.padutils");
import("etherpad.pad.padusers");
import("etherpad.control.pad.pad_view_control");
import("etherpad.control.pad.pad_changeset_control");
import("etherpad.control.pad.pad_importexport_control");
import("etherpad.collab.readonly_server");

import("dispatch.{Dispatcher,PrefixMatcher,DirMatcher,forward}");

jimport("java.lang.System.out.println");

var DISABLE_PAD_CREATION = false;

function onStartup() {
  sqlbase.createJSONTable("PAD_DIAGNOSTIC");
}

function onRequest() {

  // TODO: take a hard look at /ep/pad/FOO/BAR/ dispatching.
  //      Perhaps standardize on /ep/pad/<pad-id>/foo
  if (request.path.indexOf('/ep/pad/auth/') == 0) {
    if (request.isGet) {
      return render_auth_get();
    }
    if (request.isPost) {
      return render_auth_post();
    }
  }

  if (pro_utils.isProDomainRequest()) {
    pro_quotas.perRequestBillingCheck();
  }

  var disp = new Dispatcher();
  disp.addLocations([
    [PrefixMatcher('/ep/pad/view/'), forward(pad_view_control)],
    [PrefixMatcher('/ep/pad/changes/'), forward(pad_changeset_control)],
    [PrefixMatcher('/ep/pad/impexp/'), forward(pad_importexport_control)],
    [PrefixMatcher('/ep/pad/export/'), pad_importexport_control.renderExport]
  ]);
  return disp.dispatch();
}

//----------------------------------------------------------------
// utils
//----------------------------------------------------------------

function getDefaultPadText() {
  if (pro_utils.isProDomainRequest()) {
    return pro_config.getConfig().defaultPadText;
  }
  return renderTemplateAsString("misc/pad_default.ejs", {padUrl: request.url.split("?", 1)[0]});
}

function assignName(pad, userId) {
  if (padusers.isGuest(userId)) {
    // use pad-specific name if possible
    var userData = pad.getAuthorData(userId);
    var nm = (userData && userData.name) || padusers.getUserName() || null;

    // don't let name guest typed in last once we've assigned a name
    // for this pad, so the user can change it
    delete getSession().guestDisplayName;

    return nm;
  }
  else {
    return padusers.getUserName();
  }
}

function assignColorId(pad, userId) {
  // use pad-specific color if possible
  var userData = pad.getAuthorData(userId);
  if (userData && ('colorId' in userData)) {
    return userData.colorId;
  }

  // assign random unique color
  function r(n) {
    return Math.floor(Math.random() * n);
  }
  var colorsUsed = {};
  var users = collab_server.getConnectedUsers(pad);
  var availableColors = [];
  users.forEach(function(u) {
    colorsUsed[u.colorId] = true;
  });
  for (var i = 0; i < COLOR_PALETTE.length; i++) {
    if (!colorsUsed[i]) {
      availableColors.push(i);
    }
  }
  if (availableColors.length > 0) {
    return availableColors[r(availableColors.length)];
  } else {
    return r(COLOR_PALETTE.length);
  }
}

function _getPrivs() {
  return {
    maxRevisions: quotas.getMaxSavedRevisionsPerPad()
  };
}

//----------------------------------------------------------------
// linkfile (a file that users can save that redirects them to
// a particular pad; auto-download)
//----------------------------------------------------------------
function render_linkfile() {
  var padId = request.params.padId;

  renderHtml("pad/pad_download_link.ejs", {
    padId: padId
  });

  response.setHeader("Content-Disposition", "attachment; filename=\""+padId+".html\"");
}

//----------------------------------------------------------------
// newpad
//----------------------------------------------------------------

function render_newpad() {
  var session = getSession();
  var padId;

  if (pro_utils.isProDomainRequest()) {
    padId = pro_pad_db.getNextPadId();
  } else {
    padId = randomUniquePadId();
  }

  session.instantCreate = padId;
  response.redirect("/"+padId);
}

// Tokbox
function render_newpad_xml_post() {
  var localPadId;
  if (pro_utils.isProDomainRequest()) {
    localPadId = pro_pad_db.getNextPadId();
  } else {
    localPadId = randomUniquePadId();
  }
  // <RAFTER>
  if (DISABLE_PAD_CREATION) {
    if (! pro_utils.isProDomainRequest()) {
      utils.render500();
      return;
    }
  }
  // </RAFTER>

  padutils.accessPadLocal(localPadId, function(pad) {
    if (!pad.exists()) {
      pad.create(getDefaultPadText());
    }
  });
  response.setContentType('text/plain; charset=utf-8');
  response.write([
    '<newpad>',
    '<url>http://'+request.host+'/'+localPadId+'</url>',
    '</newpad>'
  ].join('\n'));
}

//----------------------------------------------------------------
// pad
//----------------------------------------------------------------

function _createIfNecessary(localPadId, pad) {
  if (pad.exists()) {
    delete getSession().instantCreate;
    return;
  }
  // make sure localPadId is valid.
  var validPadId = padutils.makeValidLocalPadId(localPadId);
  if (localPadId != validPadId) {
    response.redirect('/'+validPadId);
  }
  // <RAFTER>
  if (DISABLE_PAD_CREATION) {
    if (! pro_utils.isProDomainRequest()) {
      response.redirect("/ep/pad/create?padId="+encodeURIComponent(localPadId));
      return;
    }
  }
  // </RAFTER>
  // tokbox may use createImmediately
  if (request.params.createImmediately || getSession().instantCreate == localPadId) {
    pad.create(getDefaultPadText());
    delete getSession().instantCreate;
    return;
  }
  response.redirect("/ep/pad/create?padId="+encodeURIComponent(localPadId));
}

function _promptForMobileDevices(pad) {
  // TODO: also work with blackbery and windows mobile and others
  if (request.userAgent.isIPhone() && (!request.params.skipIphoneCheck)) {
    renderHtml("pad/pad_iphone_body.ejs", {padId: pad.getLocalId()});
    response.stop();
  }
}

function _checkPadQuota(pad) {
  var numConnectedUsers = collab_server.getNumConnections(pad);
  var maxUsersPerPad = quotas.getMaxSimultaneousPadEditors(pad.getId());

  if (numConnectedUsers >= maxUsersPerPad) {
    log.info("rendered-padfull");
    renderFramed('pad/padfull_body.ejs',
                  {maxUsersPerPad: maxUsersPerPad, padId: pad.getLocalId()});
    response.stop();
  }

  if (pne_utils.isPNE()) {
    if (!licensing.canSessionUserJoin()) {
      renderFramed('pad/total_users_exceeded.ejs', {
        userQuota: licensing.getActiveUserQuota(),
        activeUserWindowHours: licensing.getActiveUserWindowHours()
      });
      response.stop();
    }
  }
}

function _checkIfDeleted(pad) {
  // TODO: move to access control check on access?
  if (pro_utils.isProDomainRequest()) {
    pro_padmeta.accessProPad(pad.getId(), function(propad) {
      if (propad.exists() && propad.isDeleted()) {
        renderNoticeString("This pad has been deleted.");
        response.stop();
      }
    });
  }
}

function render_pad(localPadId) {
  var proTitle = null, documentBarTitle, initialPassword = null;
  var isPro = isProDomainRequest();
  var userId = padusers.getUserId();

  var opts = {};
  var globalPadId;

  if (isPro) {
    pro_quotas.perRequestBillingCheck();
  }

  padutils.accessPadLocal(localPadId, function(pad) {
    globalPadId = pad.getId();
    request.cache.globalPadId = globalPadId;
    _createIfNecessary(localPadId, pad);
    _promptForMobileDevices(pad);
    _checkPadQuota(pad);
    _checkIfDeleted(pad);

    if (request.params.inviteTo) {
      getSession().nameGuess = request.params.inviteTo;
      response.redirect('/'+localPadId);
    }
    var displayName;
    if (request.params.displayName) { // tokbox
      displayName = String(request.params.displayName);
    }
    else {
      displayName = assignName(pad, userId);
    }

    if (isProDomainRequest()) {
      pro_padmeta.accessProPadLocal(localPadId, function(propad) {
        proTitle = propad.getDisplayTitle();
        initialPassword = propad.getPassword();
      });
    }
    documentBarTitle = (proTitle || "Public Pad");

    var specialKey = request.params.specialKey ||
      (sessions.isAnEtherpadAdmin() ? collab_server.getSpecialKey('invisible') :
       null);
    if (request.params.fullScreen) { // tokbox, embedding
      opts.fullScreen = true;
    }
    if (request.params.tokbox) {
      opts.tokbox = true;
    }
    if (request.params.sidebar) {
      opts.sidebar = Boolean(Number(request.params.sidebar));
    }

    helpers.addClientVars({
      padId: localPadId,
      globalPadId: globalPadId,
      userAgent: request.headers["User-Agent"],
      collab_client_vars: collab_server.getCollabClientVars(pad),
      debugEnabled: request.params.djs,
      clientIp: request.clientAddr,
      colorPalette: COLOR_PALETTE,
      nameGuess: (getSession().nameGuess || null),
      initialRevisionList: revisions.getRevisionList(pad),
      serverTimestamp: +(new Date),
      accountPrivs: _getPrivs(),
      chatHistory: chatarchive.getRecentChatBlock(pad, 30),
      numConnectedUsers: collab_server.getNumConnections(pad),
      isProPad: isPro,
      initialTitle: documentBarTitle,
      initialPassword: initialPassword,
      initialOptions: pad.getPadOptionsObj(),
      userIsGuest: padusers.isGuest(userId),
      userId: userId,
      userName: displayName,
      userColor: assignColorId(pad, userId),
      specialKey: specialKey,
      specialKeyTranslation: collab_server.translateSpecialKey(specialKey),
      opts: opts
    });
  });

  var isProUser = (isPro && ! padusers.isGuest(userId));

  var isFullWidth = false;
  var hideSidebar = false;
  var cookiePrefs = padutils.getPrefsCookieData();
  if (cookiePrefs) {
    isFullWidth = !! cookiePrefs.fullWidth;
    hideSidebar = !! cookiePrefs.hideSidebar;
  }
  if (opts.fullScreen) {
    isFullWidth = true;
    if (opts.tokbox) {
      hideSidebar = true;
    }
  }
  if ('sidebar' in opts) {
    hideSidebar = ! opts.sidebar;
  }
  var bodyClass = (isFullWidth ? "fullwidth" : "limwidth")+
    " "+(isPro ? "propad" : "nonpropad")+" "+
    (isProUser ? "prouser" : "nonprouser");

  var cookiePrefsToSet = {fullWidth:isFullWidth, hideSidebar:hideSidebar};
  helpers.addClientVars({cookiePrefsToSet: cookiePrefsToSet});

  renderHtml("pad/pad_body2.ejs",
             {localPadId:localPadId,
              pageTitle:toHTML(proTitle || localPadId),
              initialTitle:toHTML(documentBarTitle),
              bodyClass: bodyClass,
              hasOffice: hasOffice(),
              isPro: isPro,
              isProAccountHolder: isProUser,
              account: getSessionProAccount(), // may be falsy
              toHTML: toHTML,
              prefs: {isFullWidth:isFullWidth, hideSidebar:hideSidebar},
              signinUrl: '/ep/account/sign-in?cont='+
                encodeURIComponent(request.url),
              fullSuperdomain: pro_utils.getFullSuperdomainHost()
             });
  return true;
}

function render_create_get() {
  var padId = request.params.padId;
  // <RAFTER>
  var template = (DISABLE_PAD_CREATION && ! pro_utils.isProDomainRequest()) ?
    "pad/create_body_rafter.ejs" :
    "pad/create_body.ejs";
  // </RAFTER>
  renderFramed(template, {padId: padId,
                          fullSuperdomain: pro_utils.getFullSuperdomainHost()});
}

function render_create_post() {
  var padId = request.params.padId;
  getSession().instantCreate = padId;
  response.redirect("/"+padId);
}

//----------------------------------------------------------------
// saverevision
//----------------------------------------------------------------

function render_saverevision_post() {
  var padId = request.params.padId;
  var savedBy = request.params.savedBy;
  var savedById = request.params.savedById;
  var revNum = request.params.revNum;
  var privs = _getPrivs();
  padutils.accessPadLocal(padId, function(pad) {
    if (! pad.exists()) { response.notFound(); }
    var currentRevs = revisions.getRevisionList(pad);
    if (currentRevs.length >= privs.maxRevisions) {
      response.forbid();
    }
    var savedRev = revisions.saveNewRevision(pad, savedBy, savedById,
                                             revNum);
    readonly_server.broadcastNewRevision(pad, savedRev);
    response.setContentType('text/x-json');
    response.write(fastJSON.stringify(revisions.getRevisionList(pad)));
  });
}

function render_saverevisionlabel_post() {
  var userId = request.params.userId;
  var padId = request.params.padId;
  var revId = request.params.revId;
  var newLabel = request.params.newLabel;
  padutils.accessPadLocal(padId, function(pad) {
    revisions.setLabel(pad, revId, userId, newLabel);
    response.setContentType('text/x-json');
    response.write(fastJSON.stringify(revisions.getRevisionList(pad)));
  });
}

function render_getrevisionatext_get() {
  var padId = request.params.padId;
  var revId = request.params.revId;
  var result = null;

  var rev = padutils.accessPadLocal(padId, function(pad) {
    var r = revisions.getStoredRevision(pad, revId);
    var forWire = collab_server.getATextForWire(pad, r.revNum);
    result = {atext:forWire.atext, apool:forWire.apool,
              historicalAuthorData:forWire.historicalAuthorData};
    return r;
  }, "r");

  response.setContentType('text/plain; charset=utf-8');
  response.write(fastJSON.stringify(result));
}

//----------------------------------------------------------------
// reconnect
//----------------------------------------------------------------

function _recordDiagnosticInfo(padId, diagnosticInfoJson) {

  var diagnosticInfo = {};
  try {
    diagnosticInfo = fastJSON.parse(diagnosticInfoJson);
  } catch (ex) {
    log.warn("Error parsing diagnosticInfoJson: "+ex);
    diagnosticInfo = {error: "error parsing JSON"};
  }

  // ignore userdups, unauth
  if (diagnosticInfo.disconnectedMessage == "userdup" ||
      diagnosticInfo.disconnectedMessage == "unauth") {
    return;
  }

  var d = new Date();

  diagnosticInfo.date = +d;
  diagnosticInfo.strDate = String(d);
  diagnosticInfo.clientAddr = request.clientAddr;
  diagnosticInfo.padId = padId;
  diagnosticInfo.headers = {};
  eachProperty(request.headers, function(k,v) {
    diagnosticInfo.headers[k] = v;
  });

  var uid = diagnosticInfo.uniqueId;

  sqlbase.putJSON("PAD_DIAGNOSTIC", (diagnosticInfo.date)+"-"+uid, diagnosticInfo);

}

function recordMigratedDiagnosticInfo(objArray) {
  objArray.forEach(function(obj) {
    sqlbase.putJSON("PAD_DIAGNOSTIC", (obj.date)+"-"+obj.uniqueId, obj);
  });
}

function render_reconnect() {
  var localPadId = request.params.padId;
  var globalPadId = padutils.getGlobalPadId(localPadId);
  var userId = (padutils.getPrefsCookieUserId() || undefined);
  var hasClientErrors = false;
  var uniqueId;
  try {
    var obj = fastJSON.parse(request.params.diagnosticInfo);
    uniqueId = obj.uniqueId;
    errorMessage = obj.disconnectedMessage;
    hasClientErrors = obj.collabDiagnosticInfo.errors.length > 0;
  } catch (e) {
    // guess it doesn't have errors.
  }

  log.custom("reconnect", {globalPadId: globalPadId, userId: userId,
                           uniqueId: uniqueId,
                           hasClientErrors: hasClientErrors,
                           errorMessage: errorMessage });

  try {
    _recordDiagnosticInfo(globalPadId, request.params.diagnosticInfo);
  } catch (ex) {
    log.warn("Error recording diagnostic info: "+ex+" / "+request.params.diagnosticInfo);
  }

  try {
    _applyMissedChanges(localPadId, request.params.missedChanges);
  } catch (ex) {
    log.warn("Error applying missed changes: "+ex+" / "+request.params.missedChanges);
  }

  response.redirect('/'+localPadId);
}

/* posted asynchronously by the client as soon as reconnect dialogue appears. */
function render_connection_diagnostic_info_post() {
  var localPadId = request.params.padId;
  var globalPadId = padutils.getGlobalPadId(localPadId);
  var userId = (padutils.getPrefsCookieUserId() || undefined);
  var hasClientErrors = false;
  var uniqueId;
  var errorMessage;
  try {
    var obj = fastJSON.parse(request.params.diagnosticInfo);
    uniqueId = obj.uniqueId;
    errorMessage = obj.disconnectedMessage;
    hasClientErrors = obj.collabDiagnosticInfo.errors.length > 0;
  } catch (e) {
    // guess it doesn't have errors.
  }
  log.custom("disconnected_autopost", {globalPadId: globalPadId, userId: userId,
                                       uniqueId: uniqueId,
                                       hasClientErrors: hasClientErrors,
                                       errorMessage: errorMessage});

  try {
    _recordDiagnosticInfo(globalPadId, request.params.diagnosticInfo);
  } catch (ex) {
    log.warn("Error recording diagnostic info: "+ex+" / "+request.params.diagnosticInfo);
  }
  response.setContentType('text/plain; charset=utf-8');
  response.write("OK");
}

function _applyMissedChanges(localPadId, missedChangesJson) {
  var missedChanges;
  try {
    missedChanges = fastJSON.parse(missedChangesJson);
  } catch (ex) {
    log.warn("Error parsing missedChangesJson: "+ex);
    return;
  }

  padutils.accessPadLocal(localPadId, function(pad) {
    if (pad.exists()) {
      collab_server.applyMissedChanges(pad, missedChanges);
    }
  });
}

//----------------------------------------------------------------
// feedback
//----------------------------------------------------------------

function render_feedback_post() {
  var feedback = request.params.feedback;
  var localPadId = request.params.padId;
  var globalPadId = padutils.getGlobalPadId(localPadId);
  var username = request.params.username;
  var email = request.params.email;
  var subject = 'EtherPad Feedback from '+request.clientAddr+' / '+globalPadId+' / '+username;

  if (feedback.indexOf("@") > 0) {
    subject = "@ "+subject;
  }

  feedback += "\n\n--\n";
  feedback += ("User Agent: "+request.headers['User-Agent'] + "\n");
  feedback += ("Session Referer: "+getSession().initialReferer + "\n");
  feedback += ("Email: "+email+"\n");

  // log feedback
  var userId = padutils.getPrefsCookieUserId();
  log.custom("feedback", {
    globalPadId: globalPadId,
    userId: userId,
    email: email,
    username: username,
    feedback: request.params.feedback});

  sendEmail(
    'feedback@etherpad.com',
    'feedback@etherpad.com',
    subject,
    {},
    feedback
  );
  response.write("OK");
}

//----------------------------------------------------------------
// emailinvite
//----------------------------------------------------------------

function render_emailinvite_post() {
  var toEmails = String(request.params.toEmails).split(',');
  var padId = String(request.params.padId);
  var username = String(request.params.username);
  var subject = String(request.params.subject);
  var message = String(request.params.message);

  log.custom("padinvite",
             {toEmails: toEmails, padId: padId, username: username,
              subject: subject, message: message});

  var fromAddr = '"EtherPad" <noreply@etherpad.com>';
  // client enforces non-empty subject and message
  var subj = '[EtherPad] '+subject;
  var body = renderTemplateAsString('email/padinvite.ejs',
                                    {body: message});
  var headers = {};
  var proAccount = getSessionProAccount();
  if (proAccount) {
    headers['Reply-To'] = proAccount.email;
  }

  response.setContentType('text/plain; charset=utf-8');
  try {
    sendEmail(toEmails, fromAddr, subj, headers, body);
    response.write("OK");
  } catch (e) {
    logException(e);
    response.setStatusCode(500);
    response.write("Error");
  }
}

//----------------------------------------------------------------
// time-slider
//----------------------------------------------------------------
function render_slider() {
  var parts = request.path.split('/');
  var padOpaqueRef = parts[4];

  helpers.addClientVars({padOpaqueRef:padOpaqueRef});

  renderHtml("pad/padslider_body.ejs", {
    // properties go here
  });

  return true;
}

//----------------------------------------------------------------
// auth
//----------------------------------------------------------------

function render_auth_get() {
  var parts = request.path.split('/');
  var localPadId = parts[4];
  var errDiv;
  if (getSession().padPassErr) {
    errDiv = DIV({style: "border: 1px solid #fcc; background: #ffeeee; padding: 1em; margin: 1em 0;"},
                  B(getSession().padPassErr));
    delete getSession().padPassErr;
  } else {
    errDiv = DIV();
  }
  renderFramedHtml(function() {
    return DIV({className: "fpcontent"},
           DIV({style: "margin: 1em;"},
            errDiv,
            FORM({style: "border: 1px solid #ccc; padding: 1em; background: #fff6cc;",
                  action: request.path+'?'+request.query,
                  method: "post"},
              LABEL(B("Please enter the password required to access this pad:")),
              BR(), BR(),
              INPUT({type: "text", name: "password"}), INPUT({type: "submit", value: "Submit"})
            /*DIV(BR(), "Or ", A({href: '/ep/account/sign-in'}, "sign in"), ".")*/
            )),
          DIV({style: "padding: 0 1em;"},
            P({style: "color: #444;"},
            "If you have forgotten a pad's password, contact your site administrator.",
            " Site administrators can recover lost pad text through the \"Admin\" tab.")
          )
        );
  });
  return true;
}

function render_auth_post() {
  var parts = request.path.split('/');
  var localPadId = parts[4];
  var domainId = domains.getRequestDomainId();
  if (!getSession().padPasswordAuth) {
    getSession().padPasswordAuth = {};
  }
  var currentPassword = pro_padmeta.accessProPadLocal(localPadId, function(propad) {
    return propad.getPassword();
  });
  if (request.params.password == currentPassword) {
    var globalPadId = padutils.getGlobalPadId(localPadId);
    getSession().padPasswordAuth[globalPadId] = true;
  } else {
    getSession().padPasswordAuth[globalPadId] = false;
    getSession().padPassErr = "Incorrect password.";
  }
  var cont = request.params.cont;
  if (!cont) {
    cont = '/'+localPadId;
  }
  response.redirect(cont);
}

//----------------------------------------------------------------
// chathistory
//----------------------------------------------------------------

function render_chathistory_get() {
  var padId = request.params.padId;
  var start = Number(request.params.start || 0);
  var end = Number(request.params.end || 0);
  var result = null;

  var rev = padutils.accessPadLocal(padId, function(pad) {
    result = chatarchive.getChatBlock(pad, start, end);
  }, "r");

  response.setContentType('text/plain; charset=utf-8');
  response.write(fastJSON.stringify(result));
}

