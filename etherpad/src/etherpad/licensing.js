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


/*
 * This file used to control access restrictions for various sites like
 * etherpad.com or on-prem installations of etherpad, or evaluation
 * editions.  For the open-source effort, I have gutted out the
 * restrictions. --aiba
 */

import("sync.callsync");
import("stringutils");
import("fileutils.readRealFile");
import("jsutils.*");

import("etherpad.globals.*");
import("etherpad.log");
import("etherpad.pad.padutils");
import("etherpad.pne.pne_utils");

jimport("com.etherpad.Licensing");
jimport("java.lang.System.out.println");

var _editionNames = {
  0: 'ETHERPAD.COM',
  1: 'PRIVATE_NETWORK_EVALUATION',
  2: 'PRIVATE_NETWORK'
};

function onStartup() { }

//----------------------------------------------------------------

/**
 * expires is a long timestamp (set to null for never expiring).
 * maxUsers is also a long (set to -1 for infinite users).
 */
function generateNewKey(personName, orgName, expires, editionId, maxUsers) {
  return null;
}

function decodeLicenseInfoFromKey(key) {
  return null;
}

//----------------------------------------------------------------

function _getCache() {
  return {};
}

function _readKeyFile(f) {
  return null;
}

function _readLicenseKey() {
  return null;
}

function reloadLicense() {
}

function getLicense() {
  return null;
}

function isPrivateNetworkEdition() {
  return false;
}

// should really only be called for PNE requests.
// see etherpad.quotas module
function getMaxUsersPerPad() {
  return 1e9;
}

function getEditionId(editionName) {
  return _editionNames[0];
}

function getEditionName(editionId) {
  return _editionNames[editionId];
}

function isEvaluation() {
  return false;
}

function isExpired() {
  return false;
}

function isValidKey(key) {
  return true;
}

function getVersionString() {
  return "0";
}

function isVersionTooOld() {
  return false;
}

//----------------------------------------------------------------
// counting active users
//----------------------------------------------------------------

function getActiveUserQuota() {
  return 1e9;
}

function _previousMidnight() {
  // return midnight of today.
  var d = new Date();
  d.setHours(0);
  d.setMinutes(0);
  d.setSeconds(0);
  d.setMilliseconds(1); // just north of midnight
  return d;
}

function _resetActiveUserStats() {
}

function getActiveUserWindowStart() {
  return null;
}

function getActiveUserWindowHours() {
  return null;
}

function getActiveUserCount() {
  return 0;
}

function canSessionUserJoin() {
  return true;
}

function onUserJoin(userInfo) {
}

function onUserLeave() {
  // do nothing.
}


