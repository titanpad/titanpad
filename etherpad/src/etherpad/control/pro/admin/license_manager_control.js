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

import("fileutils.writeRealFile");
import("stringutils");

import("etherpad.licensing");
import("etherpad.sessions.getSession");
import("etherpad.utils.*");
import("etherpad.pne.pne_utils");

import("etherpad.control.pro.admin.pro_admin_control");

jimport("java.lang.System.out.println");

//----------------------------------------------------------------
// license manager
//----------------------------------------------------------------

function getPath() {
  return '/ep/admin/pne-license-manager/';
}

function _getTemplateData(data) {
  var licenseInfo = licensing.getLicense();
  data.licenseInfo = licenseInfo;
  data.isUnlicensed = !licenseInfo;
  data.isEvaluation = licensing.isEvaluation();
  data.isExpired = licensing.isExpired();
  data.isTooOld = licensing.isVersionTooOld();
  data.errorMessage = (getSession().errorMessage || null);
  data.runningVersionString = pne_utils.getVersionString();
  data.licenseVersionString = licensing.getVersionString();
  return data;
}

function render_main_get() {
  licensing.reloadLicense();
  var licenseInfo = licensing.getLicense();
  if (!licenseInfo || licensing.isExpired()) {
    response.redirect(getPath()+'edit');
  }

  pro_admin_control.renderAdminPage('pne-license-manager', 
                                    _getTemplateData({edit: false}));
}

function render_edit_get() {
  licensing.reloadLicense();
  
  if (request.params.btn) { response.redirect(request.path); }

  var licenseInfo = licensing.getLicense();
  var oldData = getSession().oldLicenseData;
  if (!oldData) {
    oldData = {};
    if (licenseInfo) {
      oldData.orgName = licenseInfo.organizationName;
      oldData.personName = licenseInfo.personName;
    }
  }

  pro_admin_control.renderAdminPage('pne-license-manager', 
                                    _getTemplateData({edit: true, oldData: oldData}));

  delete getSession().errorMessage;
}

function render_edit_post() {
  pne_utils.enableTrackingAgain();

  function _trim(s) {
    if (!s) { return ''; }
    return stringutils.trim(s);
  }
  function _clean(s) {
    s = s.replace(/\W/g, '');
    s = s.replace(/\+/g, '');
    return s;
  }

  if (request.params.cancel) {
    delete getSession().oldLicenseData;
    response.redirect(getPath());
  }

  var personName = _trim(request.params.personName);
  var orgName = _trim(request.params.orgName);
  var licenseString = _clean(request.params.licenseString);

  getSession().oldLicenseData = {
    personName: personName, orgName: orgName, licenseString: licenseString};

  var key = [personName,orgName,licenseString].join(":");
  println("validating key [ "+key+" ]");

  if (!licensing.isValidKey(key)) {
    getSession().errorMessage = "Invalid License Key";
    response.redirect(request.path);
  }

  // valid key.  write to disk.
  var writeSuccess = false;
  try {
    println("writing key file: ./data/license.key");
    writeRealFile("./data/license.key", key);
    writeSuccess = true;
  } catch (ex) {
    println("exception: "+ex);
    getSession().errorMessage = "Failed to write key to disk. (Do you have permission to write ./data/license.key ?).";
  }
  response.redirect(getPath());
}


