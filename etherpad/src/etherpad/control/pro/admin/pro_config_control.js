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

import("etherpad.sessions.getSession");
import("etherpad.control.pro.admin.pro_admin_control");
import("etherpad.pro.pro_config");

function _renderTopDiv(mid, htmlId) {
  var m = getSession()[mid];
  if (m) {
    delete getSession()[mid];
    return DIV({id: htmlId}, m);
  } else {
    return '';
  }
}

function _messageDiv() { 
  return _renderTopDiv('proConfigMessage', 'pro-config-message');
}

function render_main_get() {
  pro_config.reloadConfig();
  var config = pro_config.getConfig();
  pro_admin_control.renderAdminPage('pro-config', {
    config: config,
    messageDiv: _messageDiv
  });
}

function render_main_post() {
  pro_config.setConfigVal('siteName', request.params.siteName);
  pro_config.setConfigVal('alwaysHttps', !!request.params.alwaysHttps);
  pro_config.setConfigVal('defaultPadText', request.params.defaultPadText);
  getSession().proConfigMessage = "New settings applied.";
  response.redirect(request.path);
}


