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

import("etherpad.utils.*");
import("etherpad.globals.*");
import("etherpad.billing.team_billing");

var _helpTopics = [
/*  ['essentials', "EtherPad Essentials"], */
  ['billing', "Account Quotas and Billing"],
/*  ['guests', "Collaborating with Teammates and Guests"] */
];

function onRequest() {
  var pageId = request.path.split('/')[3];
  if (!pageId) {
    _renderPage('main');
    return true;
  }
  for (var i = 0; i < _helpTopics.length; i++) {
    var t = _helpTopics[i];
    if (t[0] == pageId) {
      _renderPage(pageId);
      return true;
    }
  }

  response.redirect('/ep/pro-help/');
}

function _renderPage(pageId) {
  function renderContent() {
    return renderTemplateAsString('pro-help/'+pageId+'.ejs', {
      helpTopics: _helpTopics,
      numFreeAccounts: PRO_FREE_ACCOUNTS,
      pricePerAccount: team_billing.COST_PER_USER
    });
  }

  renderFramed('pro-help/pro-help-template.ejs', {
    renderContent: renderContent
  });
}




