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

import("etherpad.utils.*");
import("etherpad.globals.*");

function onRequest() {
  var p = request.path.split('/')[3];
  if (!p) {
    p = "main";
  }
  if (_getTitle(p)) {
    _renderManualPage(p);
    return true;
  } else {
    return false;
  }
}

function _getTitle(t) {
  var titles = {
    'main': " ",
    'installation-guide': "Installation Guide",
    'upgrade-guide': "Upgrade Guide",
    'configuration-guide': "Configuration Guide",
    'troubleshooting': "Troubleshooting",
    'faq': "FAQ",
    'changelog': "ChangeLog"
  };
  return titles[t];
}

function _renderTopnav(p) {
  var d = DIV({className: "pne-manual-topnav"});
  if (p != "main") {
    d.push(A({href: '/ep/pne-manual/'}, "PNE Manual"),
           "  >  ",
           _getTitle(p));
  }
  return d;
}

function _renderManualPage(p, data) {
  data = (data || {});
  data.pneVersion = PNE_RELEASE_VERSION;

  function getContent() {
    return renderTemplateAsString('pne-manual/'+p+'.ejs', data);
  }
  renderFramed('pne-manual/manual-template.ejs', {
    getContent: getContent,
    renderTopnav: function() { return _renderTopnav(p); },
    title: _getTitle(p),
    id: p,
  });
  return true;
}



