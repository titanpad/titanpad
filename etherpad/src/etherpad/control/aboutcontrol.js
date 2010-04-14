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

import("email.sendEmail");
import("funhtml.*", "stringutils.*");
import("netutils");
import("execution");

import("etherpad.utils.*");
import("etherpad.log");
import("etherpad.globals.*");
import("etherpad.quotas");
import("etherpad.sessions.getSession");
import("etherpad.store.eepnet_trial");
import("etherpad.store.checkout");
import("etherpad.store.eepnet_checkout");

jimport("java.lang.System.out.println");

//----------------------------------------------------------------

function render_about() {
  renderFramed("about/about_body.ejs");
}

function render_impressum() {
  renderFramed("about/impressum_body.ejs");
}

/*
function render_screencast() {
  if (request.params.from) { response.redirect(request.path); }
  var screencastUrl;
//  if (isProduction()) {
    screencastUrl = encodeURIComponent("http://etherpad.s3.amazonaws.com/epscreencast800x600.flv");
//  } else {
//    screencastUrl = encodeURIComponent("/static/flv/epscreencast800x600.flv");
//  }
  renderFramed("about/screencast_body.ejs", {screencastUrl: screencastUrl});
}
*/


//------------------------------------------------------------
/*
import("etherpad.billing.billing");

function render_testbillingnotify() {
  var ret = billing.handlePaypalNotification();
  if (ret.status == 'completion') {
    // do something with purchase ret.purchaseInfo
  } else if (ret.status != 'redundant') {
    java.lang.System.out.println("Whoa error: "+ret.toSource());
  }
  response.write("ok");
}
*/

