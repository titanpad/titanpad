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

import("fastJSON");
import("funhtml.*");
import("stringutils.toHTML");

import("etherpad.globals.*");
import("etherpad.helpers.*");
import("etherpad.licensing");
import("etherpad.log");
import("etherpad.utils.*");

import("etherpad.control.blogcontrol");

import("etherpad.pad.model");
import("etherpad.collab.collab_server");

jimport("java.lang.System.out.println");

//----------------------------------------------------------------

function render_main() {
  if (request.path == '/ep/') {
    response.redirect('/');
  }
  renderFramed('main/home.ejs', {
    newFromEtherpad: blogcontrol.render_new_from_etherpad()
  });
  return true;
}

function render_support() {
  renderFramed("main/support_body.ejs");
}

function render_changelog_get() {
  renderFramed("main/changelog.ejs");
}


