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

import("stringutils");
import("etherpad.licensing");
import("etherpad.utils.*");
import("etherpad.pne.pne_utils");

// TODO: hook into PNE?

function getMaxSimultaneousPadEditors(globalPadId) {
  if (isProDomainRequest()) {
    if (pne_utils.isPNE()) {
      return licensing.getMaxUsersPerPad();
    } else {
      return 1e6;
    }
  } else {
    // etherpad.com public pads
    if (globalPadId && stringutils.startsWith(globalPadId, "conf-")) {
      return 64;
    } else {
      return 16;
    }
  }
  return 1e6;
}

function getMaxSavedRevisionsPerPad() {
  if (isProDomainRequest()) {
    return 1e3;
  } else {
    // free public etherpad.com
    return 100;
  }
}

