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

import("etherpad.pad.dbwriter");
import("etherpad.utils.*");
import("etherpad.globals.*");

function onRequest() {
  if (!isProduction()) {
    return;
  }
  if (request.params.auth != 'f83kg840d12jk') {
    response.forbid();
  }
}

function render_setdbwritable() {
  var dbwritable = (String(request.params.value).toLowerCase() != 'false'); // default to true

  dbwriter.setWritableState({constant: dbwritable});

  response.write("OK, set to "+dbwritable);
}

function render_getdbwritable() {
  var state = dbwriter.getWritableState();

  response.write(String(dbwriter.getWritableStateDescription(state)));
}

function render_pausedbwriter() {
  var seconds = request.params.seconds;
  var seconds = Number(seconds || 0);
  if (isNaN(seconds)) seconds = 0;

  var finishTime = (+new Date())+(1000*seconds);
  dbwriter.setWritableState({trueAfter: finishTime});

  response.write("Paused dbwriter for "+seconds+" seconds.");
}

function render_fake_pne_on() {
  if (isProduction()) {
    response.write("has no effect in production.");
  } else {
    appjet.cache.fakePNE = true;
    response.write("OK");
  }
}

function render_fake_pne_off() {
  if (isProduction()) {
    response.write("has no effect in production.");
  } else {
    appjet.cache.fakePNE = false;
    response.write("OK");
  }
}




