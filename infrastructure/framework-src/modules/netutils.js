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

/**
 * @fileOverview A collection of network-related utilities.
 */

import("jsutils.eachProperty");

jimport("java.net.InetAddress");

 
function urlPost(url0, params, options) {
  var url = new java.net.URL(url0);
  
  var data;
  if (typeof(params) == 'string') {
    data = params;
  } else if (typeof(params) == 'object') {
    var components = [];
    eachProperty(params, function(k, v) {
      components.push(encodeURIComponent(k)+"="+encodeURIComponent(v));
    });
    data = components.join('&');
  }
  var dataBytes = (new java.lang.String(data)).getBytes("UTF-8");
  var conn = url.openConnection();
  conn.setInstanceFollowRedirects(true);
  conn.setRequestMethod("POST");
  conn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded; charset=utf-8");
  conn.setRequestProperty("Content-Length", dataBytes.length);
  conn.setDoInput(true);
  conn.setDoOutput(true);
  conn.setConnectTimeout(30*1000);
  conn.setReadTimeout(30*1000);
  conn.getOutputStream().write(dataBytes);
  var content = conn.getContent();
  var responseCode = conn.getResponseCode();
  var contentType = conn.getContentType();
  var contentEncoding = conn.getContentEncoding();
  
  if ((content instanceof java.io.InputStream) && (new java.lang.String(contentType)).startsWith("text/")) {
    if (! contentEncoding) {
      var encoding = contentType.split(/;\s*/);
      if (encoding.length > 1) {
        encoding = encoding[1].split("=");
        if (encoding[0] == "charset")
          contentEncoding = encoding[1];
      }
    }
    content = net.appjet.common.util.BetterFile.getStreamBytes(content);
    if (contentEncoding) {
      content = (new java.lang.String(content, contentEncoding));
    }
  }
  
  return {
    content: content,
    status: responseCode,
    contentType: contentType,
    contentEncoding: contentEncoding
  };
}

function getHostnameFromIp(ip) {
  var ret = null;
  try {
    var addr = InetAddress.getByName(ip);
    ret = addr.getHostName();
  } catch (ex) { }
  return ret;
}



