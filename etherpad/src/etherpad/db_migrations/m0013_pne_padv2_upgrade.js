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
import("etherpad.pad.easysync2migration");
import("etherpad.pne.pne_utils");
import("sqlbase.sqlobj");
import("etherpad.log");

function run() {

  // this is a PNE-only migration
  if (! pne_utils.isPNE()) {
    return;
  }

  var migrationsNeeded = sqlobj.selectMulti("PAD_SQLMETA", {version: 1});

  if (migrationsNeeded.length == 0) {
    return;
  }

  var migrationsTotal = migrationsNeeded.length;
  var migrationsSoFar = 0;
  var progressBar = startConsoleProgressBar();

  migrationsNeeded.forEach(function(obj) {
    var padId = String(obj.id);

    log.info("Migrating pad "+padId+" from version 1 to version 2...");
    easysync2migration.migratePad(padId);
    sqlobj.update("PAD_SQLMETA", {id: padId}, {version: 2});
    log.info("Migrated pad "+padId+".");

    migrationsSoFar++;
    progressBar.update(migrationsSoFar/migrationsTotal, migrationsSoFar+"/"+migrationsTotal+" pads");
  });

  progressBar.finish();
}

