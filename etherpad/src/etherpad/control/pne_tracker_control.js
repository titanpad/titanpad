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

import("image");
import("blob");
import("sqlbase.sqlobj");
import("jsutils.*");

function render_t() {
  var data = {
    date: new Date(),
    remoteIp: request.clientAddr
  };
  if (request.params.k) {
    data.keyHash = request.params.k;
  }
  var found = false;
  eachProperty(request.params, function(name, value) {
    if (name != "k") {
      data.name = name;
      data.value = value;
      found = true;
    }
  });
  if (found) {
    sqlobj.insert('pne_tracking_data', data);
  }

  // serve a 1x1 white image
  if (!appjet.cache.pneTrackingImage) {
    appjet.cache.pneTrackingImage = image.solidColorImageBlob(1, 1, "ffffff");
  }
  blob.serveBlob(appjet.cache.pneTrackingImage);
}

