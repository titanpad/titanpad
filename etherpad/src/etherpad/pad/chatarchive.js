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
import("etherpad.log");

jimport("java.lang.System.out.println");

function onChatMessage(pad, senderUserInfo, msg) {
  pad.appendChatMessage({
    name: senderUserInfo.name,
    userId: senderUserInfo.userId,
    time: +(new Date),
    lineText: msg.lineText
  });
}

function getRecentChatBlock(pad, howMany) {
  var numMessages = pad.getNumChatMessages();
  var firstToGet = Math.max(0, numMessages - howMany);

  return getChatBlock(pad, firstToGet, numMessages);
}

function getChatBlock(pad, start, end) {
  if (start < 0) {
    start = 0;
  }
  if (end > pad.getNumChatMessages()) {
    end = pad.getNumChatMessages();
  }

  var historicalAuthorData = {};
  var lines = [];
  var block = {start: start, end: end,
               historicalAuthorData: historicalAuthorData,
               lines: lines};

  for(var i=start; i<end; i++) {
    var x = pad.getChatMessage(i);
    var userId = x.userId;
    if (! historicalAuthorData[userId]) {
      historicalAuthorData[userId] = (pad.getAuthorData(userId) || {});
    }
    lines.push({
      name: x.name,
      time: x.time,
      userId: x.userId,
      lineText: x.lineText
    });
  }

  return block;
}