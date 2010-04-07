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
import("etherpad.store.eepnet_trial");
import("etherpad.store.eepnet_checkout");
import("etherpad.sessions.getSession");
import("etherpad.utils.*");

import("etherpad.control.store.eepnet_checkout_control");
import("etherpad.control.pro.admin.team_billing_control");

jimport("java.lang.System.out.println");

//----------------------------------------------------------------

function onStartup() {}

function onRequest() {
  var disp = new Dispatcher();
  disp.addLocations([
    [DirMatcher('/ep/store/eepnet-checkout/'), forward(eepnet_checkout_control)],
  ]);
  return disp.dispatch();
}

//----------------------------------------------------------------

function render_main() {
  response.redirect("/ep/about/pricing");
}

//----------------------------------------------------------------
// Flow goes through these 4 pages in order:
//----------------------------------------------------------------

function render_eepnet_eval_signup_get() {
  renderFramed("store/eepnet_eval_signup.ejs", {
    trialDays: eepnet_trial.getTrialDays(),
    oldData: (getSession().pricingContactData || {}),
    sfIndustryList: eepnet_trial.getSalesforceIndustryList()
  });
  delete getSession().errorMsg;
}

// function render_eepnet_eval_signup_post() {
//   response.setContentType("text/plain; charset=utf-8");
//   var data = {};
//   var fields = ['firstName', 'lastName', 'email', 'orgName',
//     'jobTitle', 'phone', 'estUsers', 'industry'];
// 
//   if (!getSession().pricingContactData) {
//     getSession().pricingContactData = {};
//   }
// 
//   function _redirectErr(msg) {
//     response.write(fastJSON.stringify({error: msg}));
//     response.stop();
//   }
// 
//   fields.forEach(function(f) { 
//     getSession().pricingContactData[f] = request.params[f];
//   });
// 
//   fields.forEach(function(f) {
//     data[f] = request.params[f];
//     if (!(data[f] && (data[f].length > 0))) {
//        _redirectErr("All fields are required.");
//     }
//   });
// 
//   // validate email
//   if (!isValidEmail(data.email)) {
//     _redirectErr("That email address doesn't look valid.");
//   }
// 
//   // check that email not already registered.
//   if (eepnet_trial.hasEmailAlreadyDownloaded(data.email)) {
//     _redirectErr("That email has already downloaded a free trial."+
//     ' <a href="/ep/store/eepnet-recover-license">Recover a lost license key here</a>.');
//   }
// 
//   // Looks good!  Create and email license key...
//   eepnet_trial.createAndMailNewLicense(data);
//   getSession().message = "A license key has been sent to "+data.email;
//   
//   // Generate web2lead info and return it
//   var web2leadData = eepnet_trial.getWeb2LeadData(data, request.clientAddr, getSession().initialReferer);
//   response.write(fastJSON.stringify(web2leadData));
// }
// 
// function render_salesforce_web2lead_ok() {
//   renderFramedHtml([
//     '<script>',
//     'top.location.href = "'+request.scheme+'://'+request.host+'/ep/store/eepnet-download";',
//     '</script>'
//   ].join('\n'));
// }
// 
// function render_eepnet_eval_download() {
//   // NOTE: keep this URL around for historical reasons?
//   response.redirect("/ep/store/eepnet-download");
// }
// 
// function render_eepnet_download() {
//   renderFramed("store/eepnet_download.ejs", {
//     message: (getSession().message || null),
//     versionString: (PNE_RELEASE_VERSION+"&nbsp;("+PNE_RELEASE_DATE +")")
//   });
//   delete getSession().message;
// }
// 
// function render_eepnet_download_zip() {
//   response.redirect("/static/zip/pne-release/etherpad-pne-"+PNE_RELEASE_VERSION+".zip");
// }
// 
// function render_eepnet_download_nextsteps() {
//   renderFramed("store/eepnet_eval_nextsteps.ejs");
// }

//----------------------------------------------------------------
// recover a lost license
//----------------------------------------------------------------
function render_eepnet_recover_license_get() {
  var d = DIV({className: "fpcontent"});

  d.push(P("Recover your lost license key."));

  if (getSession().message) {
    d.push(DIV({id: "resultmsg",
		style: "border: 1px solid #333; padding: 0 1em; background: #efe; margin: 1em 0;"}, getSession().message));
    delete getSession().message;
  }
  if (getSession().error) {
    d.push(DIV({id: "errormsg",
		style: "border: 1px solid red; padding: 0 1em; background: #fee; margin: 1em 0;"}, getSession().error));
    delete getSession().error;
  }

  d.push(FORM({style: "border: 1px solid #222; padding: 2em; background: #eee;",
	       action: request.path, method: "post"},
	      LABEL({htmlFor: "email"},
		    "Your email address:"),
	      INPUT({type: "text", name: "email", id: "email"}),
	      INPUT({type: "submit", id: "submit", value: "Submit"})));

  renderFramedHtml(d);
}

function render_eepnet_recover_license_post() {
  var email = request.params.email;
  if (!eepnet_trial.hasEmailAlreadyDownloaded(email) && !eepnet_trialhasEmailAlreadyPurchased(email)) {
    getSession().error = P("License not found for email: \"", email, "\".");
    response.redirect(request.path);
  }
  if (eepnet_checkout.hasEmailAlreadyPurchased(email)) {
    eepnet_checkout.mailLostLicense(email);
  } else if (eepnet_trial.hasEmailAlreadyDownloaded(email)) {
    eepnet_trial.mailLostLicense(email);
  }
  getSession().message = P("Your license information has been sent to ", email, ".");
  response.redirect(request.path);
}

//----------------------------------------------------------------
function render_eepnet_purchase_get() {
  renderFramed("store/eepnet_purchase.ejs", {});
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
