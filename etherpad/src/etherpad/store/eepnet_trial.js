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
import("sqlbase.sqlobj");
import("sqlbase.sqlcommon");
import("execution");

import("etherpad.sessions.getSession");
import("etherpad.log");
import("etherpad.licensing");
import("etherpad.utils.*");
import("etherpad.globals.*");

//----------------------------------------------------------------

function getTrialDays() {
  return 30;
}

function getTrialUserQuota() {
  return 100;
}

function mailLicense(data, licenseKey, expiresDate) {
  var toAddr = data.email;
  if (isTestEmail(toAddr)) {
    toAddr = "blackhole@appjet.com";
  }
  var subject = ('EtherPad: Trial License Information for '+
		 data.firstName+' '+data.lastName+' ('+data.orgName+')');

  var emailBody = renderTemplateAsString("email/eepnet_license_info.ejs", {
    userName: data.firstName+" "+data.lastName,
    licenseKey: licenseKey,
    expiresDate: expiresDate,
    isEvaluation: true
  });

  sendEmail(
    toAddr,
    'sales@etherpad.com',
    subject,
    {},
    emailBody
  );
}

function mailLostLicense(email) {
  var data = sqlobj.selectSingle('eepnet_signups', {email: email});
  var keyInfo = licensing.decodeLicenseInfoFromKey(data.licenseKey);
  var expiresDate = keyInfo.expiresDate;

  mailLicense(data, data.licenseKey, expiresDate);
}

function hasEmailAlreadyDownloaded(email) {
  var existingRecord = sqlobj.selectSingle('eepnet_signups', {email: email});
  if (existingRecord) {
    return true;
  } else {
    return false
  }
}

function createAndMailNewLicense(data) {
  sqlcommon.inTransaction(function() {
    var expiresDate = new Date(+(new Date)+(1000*60*60*24*getTrialDays()));
    var licenseKey = licensing.generateNewKey(
      data.firstName + ' ' + data.lastName,
      data.orgName,
	+expiresDate,
      licensing.getEditionId('PRIVATE_NETWORK_EVALUATION'),
      getTrialUserQuota()
    );

    // confirm key
    if (!licensing.isValidKey(licenseKey)) {
      throw Error("License key I just created is not valid: "+l);
    }

    // Log all this precious info
    _logDownloadData(data, licenseKey);

    // Store in database
    sqlobj.insert("eepnet_signups", {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      orgName: data.orgName,
      jobTitle: data.jobTitle,
      date: new Date(),
      signupIp: String(request.clientAddr).substr(0,16),
      estUsers: data.estUsers,
      licenseKey: licenseKey,
      phone: data.phone,
      industry: data.industry
    });

    mailLicense(data, licenseKey, expiresDate);

    // Send sales notification
    var clientAddr = request.clientAddr;
    var initialReferer = getSession().initialReferer;
    execution.async(function() {
      _sendSalesNotification(data, clientAddr, initialReferer);
    });

  }); // end transaction
}

function _logDownloadData(data, licenseKey) {
  log.custom("eepnet_download_info", {
    email: data.email,
    firstName: data.firstName,
    lastName: data.lastName,
    org: data.orgName,
    jobTitle: data.jobTitle,
    phone: data.phone,
    estUsers: data.estUsers,
    licenseKey: licenseKey,
    ip: request.clientAddr,
    industry: data.industry,
    referer: getSession().initialReferer
  });
}

function getWeb2LeadData(data, ip, ref) {
  var googleQuery = extractGoogleQuery(ref);
  var w2ldata = {
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
    lead_source: 'EEPNET Download',
    industry: data.industry
  };

  if (!isProduction()) {
//    w2ldata.debug = "1";
//    w2ldata.debugEmail = "aaron@appjet.com";
  }

  return w2ldata;
}

function _sendSalesNotification(data, ip, ref) {
  var hostname = ipToHostname(ip) || "unknown";

  var subject = "EEPNET Trial Download: "+[data.orgName, data.firstName + ' ' + data.lastName, data.email].join(" / ");

  var body = [
    "",
    "This is an automated message.",
    "",
    "Somebody downloaded a "+getTrialDays()+"-day trial of EEPNET.",
    "",
    "This lead should be automatically added to the AppJet salesforce account.",
    "",
    "Organization: "+data.orgName,
    "Industry: "+data.industry,
    "Full Name: "+data.firstName + ' ' + data.lastName,
    "Job Title: "+data.jobTitle,
    "Email: "+data.email,
    'Phone: '+data.phone,
    "Est. Users: "+data.estUsers,
    "IP Address: "+ip+" ("+hostname+")",
    "Session Referer: "+ref,
    ""
  ].join("\n");

  var toAddr = 'sales@etherpad.com';
  if (isTestEmail(data.email)) {
    toAddr = 'blackhole@appjet.com';
  }
  sendEmail(
    toAddr,
    'sales@etherpad.com',
    subject,
    {'Reply-To': data.email},
    body
  );
}

function getSalesforceIndustryList() {
  return [
    '--None--',
    'Agriculture',
    'Apparel',
    'Banking',
    'Biotechnology',
    'Chemicals',
    'Communications',
    'Construction',
    'Consulting',
    'Education',
    'Electronics',
    'Energy',
    'Engineering',
    'Entertainment',
    'Environmental',
    'Finance',
    'Food & Beverage',
    'Government',
    'Healthcare',
    'Hospitality',
    'Insurance',
    'Machinery',
    'Manufacturing',
    'Media',
    'Not For Profit',
    'Other',
    'Recreation',
    'Retail',
    'Shipping',
    'Technology',
    'Telecommunications',
    'Transportation',
    'Utilities'
  ];
}

