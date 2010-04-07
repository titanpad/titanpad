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

/* global $, window */

$(document).ready(function() {
  pad.init();
});

$(window).unload(function() {
  pad.dispose();
});

var pad = {
  // don't access these directly from outside this file, except
  // for debugging
  collabClient: null,
  myUserInfo: null,
  diagnosticInfo: {},
  initTime: 0,
  clientTimeOffset: (+new Date()) - clientVars.serverTimestamp,
  preloadedImages: false,
  padOptions: {},
  resizeInited: false,

  // these don't require init; clientVars should all go through here
  getPadId: function() { return clientVars.padId; },
  getClientIp: function() { return clientVars.clientIp; },
  getIsProPad: function() { return clientVars.isProPad; },
  getColorPalette: function() { return clientVars.colorPalette; },
  getDisplayUserAgent: function() {
    return padutils.uaDisplay(clientVars.userAgent);
  },
  getIsDebugEnabled: function() { return clientVars.debugEnabled; },
  getPrivilege: function(name) { return clientVars.accountPrivs[name]; },
  getUserIsGuest: function() { return clientVars.userIsGuest; },
  //

  getUserId: function() { return pad.myUserInfo.userId; },
  getUserName: function() { return pad.myUserInfo.name; },
  sendClientMessage: function(msg) {
    pad.collabClient.sendClientMessage(msg);
  },

  initResize: function() {
    $(window).bind("resize", pad.resizePage);
    pad.resizeInited = true;
    pad.resizePage();
    // just in case, periodically check size:
    setInterval(function() { pad.resizePage(); }, 2000);
  },
  init: function() {
    pad.diagnosticInfo.uniqueId = padutils.uniqueId();
    pad.initTime = +(new Date());
    pad.padOptions = clientVars.initialOptions;

    if ((! $.browser.msie) &&
      (! ($.browser.mozilla && $.browser.version.indexOf("1.8.") == 0))) {
      document.domain = document.domain; // for comet
    }

    // for IE
    if ($.browser.msie) {
      try {
        doc.execCommand("BackgroundImageCache", false, true);
      } catch (e) {}
    }

    // order of inits is important here:

    padcookie.init(clientVars.cookiePrefsToSet);

    $("#widthprefcheck").click(pad.toggleWidthPref);
    $("#sidebarcheck").click(pad.toggleSidebar);

    pad.myUserInfo = {
      userId: clientVars.userId,
      name: clientVars.userName,
      ip: pad.getClientIp(),
      colorId: clientVars.userColor,
      userAgent: pad.getDisplayUserAgent()
    };
    if (clientVars.specialKey) {
      pad.myUserInfo.specialKey = clientVars.specialKey;
      if (clientVars.specialKeyTranslation) {
        $("#specialkeyarea").html("mode: "+
                                  String(clientVars.specialKeyTranslation).toUpperCase());
      }
    }
    paddocbar.init({isTitleEditable: pad.getIsProPad(),
                    initialTitle:clientVars.initialTitle,
                    initialPassword:clientVars.initialPassword,
                    guestPolicy: pad.padOptions.guestPolicy
                   });
    padimpexp.init();
    padsavedrevs.init(clientVars.initialRevisionList);

    padeditor.init(postAceInit, pad.padOptions.view || {});
    sidebarSplit.init();
    pad.initResize();

    paduserlist.init(pad.myUserInfo);
    padchat.init(clientVars.chatHistory, pad.myUserInfo);
    padconnectionstatus.init();
    padmodals.init();

    pad.collabClient =
      getCollabClient(padeditor.ace,
                      clientVars.collab_client_vars,
                      pad.myUserInfo,
                      { colorPalette: pad.getColorPalette() });
    pad.collabClient.setOnUserJoin(pad.handleUserJoin);
    pad.collabClient.setOnUpdateUserInfo(pad.handleUserUpdate);
    pad.collabClient.setOnUserLeave(pad.handleUserLeave);
    pad.collabClient.setOnClientMessage(pad.handleClientMessage);
    pad.collabClient.setOnServerMessage(pad.handleServerMessage);
    pad.collabClient.setOnChannelStateChange(pad.handleChannelStateChange);
    pad.collabClient.setOnInternalAction(pad.handleCollabAction);

    function postAceInit() {
      padeditbar.init();
      setTimeout(function() { padeditor.ace.focus(); }, 0);
    }

    pad.resizePage();
  },
  dispose: function() {
    padeditor.dispose();
  },
  resizePage: function() {
    if (! pad.resizeInited) {
      return;
    }
    // requires padeditor and sidebarSplit
    var pageHeight = $(window).height();
    if ($("#djs").length > 0) {
      pageHeight -= $("#djs").outerHeight();
    }
    var MIN_PAGE_HEIGHT = 400;
    if (pageHeight < MIN_PAGE_HEIGHT) {
      pageHeight = MIN_PAGE_HEIGHT;
    }
    var bottomAreaHeight = 28;
    padeditor.setBottom(pageHeight - bottomAreaHeight);
    sidebarSplit.setBottom(pageHeight - bottomAreaHeight);
    paddocbar.handleResizePage();
    padmodals.relayoutWithBottom(pageHeight);
    pad.handleWidthChange();
  },
  notifyChangeName: function(newName) {
    pad.myUserInfo.name = newName;
    pad.collabClient.updateUserInfo(pad.myUserInfo);
    padchat.handleUserJoinOrUpdate(pad.myUserInfo);
  },
  notifyChangeColor: function(newColorId) {
    pad.myUserInfo.colorId = newColorId;
    pad.collabClient.updateUserInfo(pad.myUserInfo);
    padchat.handleUserJoinOrUpdate(pad.myUserInfo);
  },
  notifyChangeTitle: function(newTitle) {
    pad.collabClient.sendClientMessage({
      type: 'padtitle',
      title: newTitle,
      changedBy: pad.myUserInfo.name || "unnamed"
    });
  },
  notifyChangePassword: function(newPass) {
    pad.collabClient.sendClientMessage({
      type: 'padpassword',
      password: newPass,
      changedBy: pad.myUserInfo.name || "unnamed"
    });
  },
  changePadOption: function(key, value) {
    var options = {};
    options[key] = value;
    pad.handleOptionsChange(options);
    pad.collabClient.sendClientMessage({
      type: 'padoptions',
      options: options,
      changedBy: pad.myUserInfo.name || "unnamed"
    });
  },
  changeViewOption: function(key, value) {
    var options = {view: {}};
    options.view[key] = value;
    pad.handleOptionsChange(options);
    pad.collabClient.sendClientMessage({
      type: 'padoptions',
      options: options,
      changedBy: pad.myUserInfo.name || "unnamed"
    });
  },
  handleOptionsChange: function(opts) {
    // opts object is a full set of options or just
    // some options to change
    if (opts.view) {
      if (! pad.padOptions.view) {
        pad.padOptions.view = {};
      }
      for(var k in opts.view) {
        pad.padOptions.view[k] = opts.view[k];
      }
      padeditor.setViewOptions(pad.padOptions.view);
    }
    if (opts.guestPolicy) {
      // order important here
      pad.padOptions.guestPolicy = opts.guestPolicy;
      paddocbar.setGuestPolicy(opts.guestPolicy);
    }
  },
  getPadOptions: function() {
    // caller shouldn't mutate the object
    return pad.padOptions;
  },
  isPadPublic: function() {
    return (! pad.getIsProPad()) || (pad.getPadOptions().guestPolicy == 'allow');
  },
  suggestUserName: function(userId, name) {
    pad.collabClient.sendClientMessage({
      type: 'suggestUserName',
      unnamedId: userId,
      newName: name
    });
  },
  handleUserJoin: function(userInfo) {
    paduserlist.userJoinOrUpdate(userInfo);
    padchat.handleUserJoinOrUpdate(userInfo);
  },
  handleUserUpdate: function(userInfo) {
    paduserlist.userJoinOrUpdate(userInfo);
    padchat.handleUserJoinOrUpdate(userInfo);
  },
  handleUserLeave: function(userInfo) {
    paduserlist.userLeave(userInfo);
    padchat.handleUserLeave(userInfo);
  },
  handleClientMessage: function(msg) {
    if (msg.type == 'suggestUserName') {
      if (msg.unnamedId == pad.myUserInfo.userId && msg.newName &&
          ! pad.myUserInfo.name) {
        pad.notifyChangeName(msg.newName);
        paduserlist.setMyUserInfo(pad.myUserInfo);
      }
    }
    else if (msg.type == 'chat') {
      padchat.receiveChat(msg);
    }
    else if (msg.type == 'padtitle') {
      paddocbar.changeTitle(msg.title);
    }
    else if (msg.type == 'padpassword') {
      paddocbar.changePassword(msg.password);
    }
    else if (msg.type == 'newRevisionList') {
      padsavedrevs.newRevisionList(msg.revisionList);
    }
    else if (msg.type == 'revisionLabel') {
      padsavedrevs.newRevisionList(msg.revisionList);
    }
    else if (msg.type == 'padoptions') {
      var opts = msg.options;
      pad.handleOptionsChange(opts);
    }
    else if (msg.type == 'guestanswer') {
      // someone answered a prompt, remove it
      paduserlist.removeGuestPrompt(msg.guestId);
    }
  },
  editbarClick: function(cmd) {
    if (padeditbar) {
      padeditbar.toolbarClick(cmd);
    }
  },
  dmesg: function(m) {
    if (pad.getIsDebugEnabled()) {
      var djs = $('#djs').get(0);
      var wasAtBottom = (djs.scrollTop - (djs.scrollHeight - $(djs).height())
                         >= -20);
      $('#djs').append('<p>'+m+'</p>');
      if (wasAtBottom) {
        djs.scrollTop = djs.scrollHeight;
      }
    }
  },
  handleServerMessage: function(m) {
    if (m.type == 'NOTICE') {
      if (m.text) {
        alertBar.displayMessage(function (abar) {
          abar.find("#servermsgdate").html(" ("+padutils.simpleDateTime(new Date)+")");
          abar.find("#servermsgtext").html(m.text);
        });
      }
      if (m.js) {
        window['ev'+'al'](m.js);
      }
    }
    else if (m.type == 'GUEST_PROMPT') {
      paduserlist.showGuestPrompt(m.userId, m.displayName);
    }
  },
  handleChannelStateChange: function(newState, message) {
    var oldFullyConnected = !! padconnectionstatus.isFullyConnected();
    var wasConnecting = (padconnectionstatus.getStatus().what == 'connecting');
    if (newState == "CONNECTED") {
      padconnectionstatus.connected();
    }
    else if (newState == "RECONNECTING") {
      padconnectionstatus.reconnecting();
    }
    else if (newState == "DISCONNECTED") {
      pad.diagnosticInfo.disconnectedMessage = message;
      pad.diagnosticInfo.padInitTime = pad.initTime;
      pad.asyncSendDiagnosticInfo();
      if (typeof window.ajlog == "string") { window.ajlog += ("Disconnected: "+message+'\n'); }
      padeditor.disable();
      padeditbar.disable();
      paddocbar.disable();
      padimpexp.disable();

      padconnectionstatus.disconnected(message);
    }
    var newFullyConnected = !! padconnectionstatus.isFullyConnected();
    if (newFullyConnected != oldFullyConnected) {
      pad.handleIsFullyConnected(newFullyConnected, wasConnecting);
    }
  },
  handleIsFullyConnected: function(isConnected, isInitialConnect) {
    // load all images referenced from CSS, one at a time,
    // starting one second after connection is first established.
    if (isConnected && ! pad.preloadedImages) {
      window.setTimeout(function() {
        if (! pad.preloadedImages) {
          pad.preloadImages();
          pad.preloadedImages = true;
        }
      }, 1000);
    }

    padsavedrevs.handleIsFullyConnected(isConnected);

    pad.determineSidebarVisibility(isConnected && ! isInitialConnect);
  },
  determineSidebarVisibility: function(asNowConnectedFeedback) {
    if (pad.isFullyConnected()) {
      var setSidebarVisibility =
        padutils.getCancellableAction(
          "set-sidebar-visibility",
          function() {
            $("body").toggleClass('hidesidebar',
                                  !! padcookie.getPref('hideSidebar'));
          });
      window.setTimeout(setSidebarVisibility,
                        asNowConnectedFeedback ? 3000 : 0);
    }
    else {
      padutils.cancelActions("set-sidebar-visibility");
      $("body").removeClass('hidesidebar');
    }
    pad.resizePage();
  },
  handleCollabAction: function(action) {
    if (action == "commitPerformed") {
      padeditbar.setSyncStatus("syncing");
    }
    else if (action == "newlyIdle") {
      padeditbar.setSyncStatus("done");
    }
  },
  hideServerMessage: function() {
    alertBar.hideMessage();
  },
  asyncSendDiagnosticInfo: function() {
    pad.diagnosticInfo.collabDiagnosticInfo = pad.collabClient.getDiagnosticInfo();
    window.setTimeout(function() {
      $.ajax({
        type: 'post',
        url: '/ep/pad/connection-diagnostic-info',
        data: {padId: pad.getPadId(), diagnosticInfo: JSON.stringify(pad.diagnosticInfo)},
        success: function() {},
        error: function() {}
      });
    }, 0);
  },
  forceReconnect: function() {
    $('form#reconnectform input.padId').val(pad.getPadId());
    pad.diagnosticInfo.collabDiagnosticInfo = pad.collabClient.getDiagnosticInfo();
    $('form#reconnectform input.diagnosticInfo').val(JSON.stringify(pad.diagnosticInfo));
    $('form#reconnectform input.missedChanges').val(JSON.stringify(pad.collabClient.getMissedChanges()));
    $('form#reconnectform').submit();
  },
  toggleWidthPref: function() {
    var newValue = ! padcookie.getPref('fullWidth');
    padcookie.setPref('fullWidth', newValue);
    $("#widthprefcheck").toggleClass('widthprefchecked', !!newValue).toggleClass(
      'widthprefunchecked', !newValue);
    pad.handleWidthChange();
  },
  toggleSidebar: function() {
    var newValue = ! padcookie.getPref('hideSidebar');
    padcookie.setPref('hideSidebar', newValue);
    $("#sidebarcheck").toggleClass('sidebarchecked', !newValue).toggleClass(
      'sidebarunchecked', !!newValue);
    pad.determineSidebarVisibility();
  },
  handleWidthChange: function() {
    var isFullWidth = padcookie.getPref('fullWidth');
    if (isFullWidth) {
      $("body").addClass('fullwidth').removeClass('limwidth').removeClass(
        'squish1width').removeClass('squish2width');
    }
    else {
      $("body").addClass('limwidth').removeClass('fullwidth');

      var pageWidth = $(window).width();
      $("body").toggleClass('squish1width', (pageWidth < 912 && pageWidth > 812)).toggleClass(
        'squish2width', (pageWidth <= 812));
    }
  },
  // this is called from code put into a frame from the server:
  handleImportExportFrameCall: function(callName, varargs) {
    padimpexp.handleFrameCall.call(padimpexp, callName,
                                   Array.prototype.slice.call(arguments, 1));
  },
  callWhenNotCommitting: function(f) {
    pad.collabClient.callWhenNotCommitting(f);
  },
  getCollabRevisionNumber: function() {
    return pad.collabClient.getCurrentRevisionNumber();
  },
  isFullyConnected: function() {
    return padconnectionstatus.isFullyConnected();
  },
  addHistoricalAuthors: function(data) {
    if (! pad.collabClient) {
      window.setTimeout(function() { pad.addHistoricalAuthors(data); },
                        1000);
    }
    else {
      pad.collabClient.addHistoricalAuthors(data);
    }
  },
  preloadImages: function() {
    var images = [
      '/static/img/jun09/pad/feedbackbox2.gif',
      '/static/img/jun09/pad/sharebox4.gif',
      '/static/img/jun09/pad/sharedistri.gif',
      '/static/img/jun09/pad/colorpicker.gif',
      '/static/img/jun09/pad/docbarstates.png',
      '/static/img/jun09/pad/overlay.png'
    ];
    function loadNextImage() {
      if (images.length == 0) {
        return;
      }
      var img = new Image();
      img.src = images.shift();
      if (img.complete) {
        scheduleLoadNextImage();
      }
      else {
        $(img).bind('error load onreadystatechange', scheduleLoadNextImage);
      }
    }
    function scheduleLoadNextImage() {
      window.setTimeout(loadNextImage, 0);
    }
    scheduleLoadNextImage();
  }
};

var sidebarSplit = (function(){
  var MIN_SIZED_BOX_HEIGHT = 75;

  function relayout(heightDelta) {
    heightDelta = (heightDelta || 0);

    var sizedBox1 = $("#otherusers");
    var sizedBox2 = $("#chatlines");
    var height1 = sizedBox1.height();
    var height2 = sizedBox2.height();
    var newTotalHeight = height1 + height2 + heightDelta;
    var newHeight1 = height1;
    var newHeight2 = height2;

    if (newTotalHeight >= MIN_SIZED_BOX_HEIGHT*2) {
      // room for both panes to be at least min height
      if (newTotalHeight >= self.desiredUsersBoxHeight + MIN_SIZED_BOX_HEIGHT) {
        // room for users pane to be desiredUsersBoxHeight
        newHeight1 = self.desiredUsersBoxHeight;
        newHeight2 = newTotalHeight - newHeight1;
      }
      else {
        newHeight2 = MIN_SIZED_BOX_HEIGHT;
        newHeight1 = newTotalHeight - newHeight2;
      }
    }
    else {
      newHeight1 = Math.round(newTotalHeight/2);
      newHeight2 = newTotalHeight - newHeight1;
    }

    sizedBox1.height(newHeight1);
    sizedBox2.height(newHeight2);

    $("#connectionbox").height(
      $("#myuser").outerHeight() + $("#userlistbuttonarea").outerHeight() +
        height1
    );
  }

  var self = {
    desiredUsersBoxHeight: MIN_SIZED_BOX_HEIGHT,
    init: function() {
      self.desiredUsersBoxHeight = Math.max(
        $("#otherusers").height(), MIN_SIZED_BOX_HEIGHT);
      makeDraggable($("#hdraggie"), function(eType, evt, state) {
        if (eType == 'dragstart') {
          state.startY = evt.pageY;
          state.startHeight = $("#otherusers").height();
        }
        else if (eType == 'dragupdate') {
          var newHeight = state.startHeight + (evt.pageY - state.startY);
          if (newHeight < MIN_SIZED_BOX_HEIGHT) {
            newHeight = MIN_SIZED_BOX_HEIGHT;
          }
          self.desiredUsersBoxHeight = newHeight;
          relayout();
        }
      });
    },
    setBottom: function(bottomPx) {
      var curBottom = $("#padsidebar").offset().top + $("#padsidebar").height();
      var deltaBottom = bottomPx - curBottom;

      if (deltaBottom != 0) {
        relayout(deltaBottom);
      }
    }
  };
  return self;
}());

var alertBar = (function() {

  var animator = padutils.makeShowHideAnimator(arriveAtAnimationState, false, 25, 400);

  function arriveAtAnimationState(state) {
    if (state == -1) {
      $("#alertbar").css('opacity', 0).css('display', 'block');
      pad.resizePage();
    }
    else if (state == 0) {
      $("#alertbar").css('opacity', 1);
    }
    else if (state == 1) {
      $("#alertbar").css('opacity', 0).css('display', 'none');
      pad.resizePage();
    }
    else if (state < 0) {
      $("#alertbar").css('opacity', state+1);
    }
    else if (state > 0) {
      $("#alertbar").css('opacity', 1 - state);
    }
  }

  var self = {
    displayMessage: function(setupFunc) {
      animator.show();
      setupFunc($("#alertbar"));
    },
    hideMessage: function() {
      animator.hide();
    }
  };
  return self;
}());
