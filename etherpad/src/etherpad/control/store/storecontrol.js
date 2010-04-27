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

import("dispatch.{Dispatcher,DirMatcher,forward}");
import("fastJSON");
import("funhtml.*");

import('etherpad.globals.*');
import("etherpad.sessions.getSession");
import("etherpad.utils.*");

import("etherpad.control.pro.admin.team_billing_control");

jimport("java.lang.System.out.println");

//----------------------------------------------------------------

function onStartup() {}

function onRequest() {
  var disp = new Dispatcher();
  //disp.addLocations([
  //]);
  return disp.dispatch();
}

//----------------------------------------------------------------

function render_main() {
  response.redirect("/ep/about/pricing");
}

//--------------------------------------------------------------------------------
// csc-help page
//--------------------------------------------------------------------------------

function render_csc_help_get() {
  response.write(renderTemplateAsString("store/csc-help.ejs"));
}

//--------------------------------------------------------------------------------
// paypal notifications for pro
//--------------------------------------------------------------------------------

function render_paypalnotify() {
  team_billing_control.handlePaypalNotify();
}
