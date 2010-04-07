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

import("etherpad.utils.startConsoleProgressBar");
import("etherpad.pne.pne_utils");
import("sqlbase.sqlobj");
import("sqlbase.sqlbase");
import("etherpad.log");
import("sqlbase.sqlcommon.*");
import("etherpad.pad.padutils");

function run() {

  // this is a PNE-only migration
  if (! pne_utils.isPNE()) {
    return;
  }

  var renamesNeeded = sqlobj.selectMulti("PAD_SQLMETA", {});

  if (renamesNeeded.length == 0) {
    return;
  }

  var renamesTotal = renamesNeeded.length;
  var renamesSoFar = 0;
  var progressBar = startConsoleProgressBar();

  renamesNeeded.forEach(function(obj) {
    var oldPadId = String(obj.id);
    var newPadId;
    if (/^1\$[a-zA-Z0-9\-]+$/.test(oldPadId)) {
      // not expecting a user pad beginning with "1$";
      // this case is to avoid trashing dev databases
      newPadId = oldPadId;
    }
    else {
      var localPadId = padutils.makeValidLocalPadId(oldPadId);
      newPadId = "1$"+localPadId;

      // PAD_SQLMETA
      obj.id = newPadId;
      sqlobj.deleteRows("PAD_SQLMETA", {id:oldPadId});
      sqlobj.insert("PAD_SQLMETA", obj);

      // PAD_META
      var meta = sqlbase.getJSON("PAD_META", oldPadId);
      meta.padId = newPadId;
      sqlbase.deleteJSON("PAD_META", oldPadId);
      sqlbase.putJSON("PAD_META", newPadId, meta);

      // PAD_APOOL
      var apool = sqlbase.getJSON("PAD_APOOL", oldPadId);
      sqlbase.deleteJSON("PAD_APOOL", oldPadId);
      sqlbase.putJSON("PAD_APOOL", newPadId, apool);

      function renamePadInStringArrayTable(arrayName) {
        var stmnt = "UPDATE "+btquote("PAD_"+arrayName.toUpperCase()+"_META")+
          " SET "+btquote("ID")+" = ? WHERE "+btquote("ID")+" = ?";
        return withConnection(function(conn) {
          var pstmnt = conn.prepareStatement(stmnt);
          return closing(pstmnt, function() {
            pstmnt.setString(1, newPadId);
            pstmnt.setString(2, oldPadId);
            pstmnt.executeUpdate();
          });
        });
      }

      renamePadInStringArrayTable("revs");
      renamePadInStringArrayTable("chat");
      renamePadInStringArrayTable("revmeta");
      renamePadInStringArrayTable("authors");

      sqlobj.insert('pro_padmeta', {
        localPadId: localPadId,
        title: localPadId,
        createdDate: obj.creationTime,
        domainId: 1 // PNE
      });
    }

    renamesSoFar++;
    progressBar.update(renamesSoFar/renamesTotal, renamesSoFar+"/"+renamesTotal+" pads");
  });

  progressBar.finish();
}

