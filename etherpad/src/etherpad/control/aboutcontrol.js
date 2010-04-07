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

function render_product() {
  if (request.params.from) { response.redirect(request.path); }
  renderFramed("about/product_body.ejs");
}

function render_faq() {
  renderFramed("about/faq_body.ejs", {
    LI: LI,
    H2: H2,
    A: A,
    html: html
  });
}

function render_pne_faq() {
  renderFramed("about/pne-faq.ejs");
}

function render_company() {
  renderFramed("about/company_body.ejs");
}

function render_contact() {
  renderFramed("about/contact_body.ejs");
}

function render_privacy() {
  renderFramed("about/privacy_body.ejs");
}

function render_tos() {
  renderFramed("about/tos_body.ejs");
}

function render_testimonials() {
  renderFramed("about/testimonials.ejs");
}

function render_appjet() {
  response.redirect("/ep/blog/posts/etherpad-and-appjet");
//  renderFramed("about/appjet_body.ejs");
}

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

function render_forums() {
  renderFramed("about/forums_body.ejs");
}

function render_blog() {
  renderFramed("about/blog_body.ejs");
}

function render_really_real_time() {
  renderFramed("about/simultaneously.ejs");
}
  
function render_simultaneously() {
  renderFramed("about/simultaneously.ejs");
}

//----------------------------------------------------------------
// pricing
//----------------------------------------------------------------

function render_pricing() {
  renderFramed("about/pricing.ejs", {
    trialDays: eepnet_trial.getTrialDays(),
    costPerUser: checkout.dollars(eepnet_checkout.COST_PER_USER)
  });
}

function render_pricing_free() {
  renderFramed("about/pricing_free.ejs", {
    maxUsersPerPad: quotas.getMaxSimultaneousPadEditors()
  });
}

function render_pricing_eepnet() {
  renderFramed("about/pricing_eepnet.ejs", {
    trialDays: eepnet_trial.getTrialDays(),
    costPerUser: checkout.dollars(eepnet_checkout.COST_PER_USER)
  });
}

function render_pricing_pro() {
  renderFramed("about/pricing_pro.ejs", {});
}

function render_eepnet_pricing_contact_post() {
  response.setContentType("text/plain; charset=utf-8");
  var data = {};
  var fields = ['firstName', 'lastName', 'email', 'orgName', 
                'jobTitle', 'phone', 'estUsers', 'industry'];

  if (!getSession().pricingContactData) {
    getSession().pricingContactData = {};
  }

  function err(m) {
    response.write(m);
    response.stop();
  }

  fields.forEach(function(f) { 
    getSession().pricingContactData[f] = request.params[f];
  });

  fields.forEach(function(f) {
    data[f] = request.params[f];
    if (!(data[f] && (data[f].length > 0))) {
       err("All fields are required.");
    }
  });
  
  if (!isValidEmail(data.email)) {
    err("Error: Invalid Email");
  }

  // log this data to a file
  fields.ip = request.clientAddr;
  fields.sessionReferer = getSession().initialReferer;
  log.custom("eepnet_pricing_inquiry", fields);

  // submit web2lead
  var ref = getSession().initialReferer;
  var googleQuery = extractGoogleQuery(ref);
  var wlparams = {
    oid: "00D80000000b7ey",
    first_name: data.firstName,
    last_name: data.lastName,
    email: data.email,
    company: data.orgName,
    title: data.jobTitle,
    phone: data.phone,
    '00N80000003FYtG': data.estUsers,
    '00N80000003FYto': ref,
    '00N80000003FYuI': googleQuery,
    lead_source: 'EEPNET Pricing Inquiry',
    industry: data.industry,
    retURL: 'http://'+request.host+'/ep/store/salesforce-web2lead-ok'
  };

  var result = netutils.urlPost(
    "http://www.salesforce.com/servlet/servlet.WebToLead?encoding=UTF-8",
    wlparams, {});

  // now send an email sales notification
  var hostname = ipToHostname(request.clientAddr) || "unknown";
  var subject = 'EEPNET Pricing Inquiry: '+data.email+' / '+hostname;
  var body = [
    "", "This is an automated email.", "",
    data.firstName+" "+data.lastName+" ("+data.orgName+") has inquired about EEPNET pricing.",
    "",
    "This record has automatically been added to SalesForce.  See the salesforce lead page for more details.",
    "", "Session Referer: "+ref, ""
  ].join("\n");
  var toAddr = 'sales@etherpad.com';
  if (isTestEmail(data.email)) {
    toAddr = 'blackhole@appjet.com';
  }
  sendEmail(toAddr, 'sales@etherpad.com', subject, {}, body);

  // all done!
  response.write("OK");
}

function render_pricing_interest_signup() {
  response.setContentType('text/plain; charset=utf-8');

  var email = request.params.email;
  var interestedNet = request.params.interested_net;
  var interestedHosted = request.params.interested_hosted;

  if (!isValidEmail(email)) {
    response.write("Error: Invalid Email");
    response.stop();
  }

  log.custom("pricing_interest", 
    {email: email, 
     net: interestedNet,
     hosted: interestedHosted});

  response.write('OK');
}

function render_pricing_eepnet_users() {
  renderFramed('about/pricing_eepnet_users.ejs', {});
}

function render_pricing_eepnet_support() {
  renderFramed('about/pricing_eepnet_support.ejs', {});
}


//------------------------------------------------------------
// survey

function render_survey() {
  var id = request.params.id;
  log.custom("pro-user-survey", { surveyProAccountId: (id || "unknown") });
  response.redirect("http://www.surveymonkey.com/s.aspx?sm=yT3ALP0pb_2fP_2bHtcfzvpkXQ_3d_3d");
}


//------------------------------------------------------------

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

