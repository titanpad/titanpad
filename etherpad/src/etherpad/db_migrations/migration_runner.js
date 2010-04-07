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

// Database migrations.

import("sqlbase.sqlcommon");
import("sqlbase.sqlobj");

import("etherpad.globals.*");
import("etherpad.utils.*");
import("etherpad.log");
import("etherpad.pne.pne_utils");

jimport("java.lang.System.out.println");

//----------------------------------------------------------------
// 1 migration per file
//----------------------------------------------------------------

var migrations = [
  "m0000_test",
  "m0001_eepnet_signups_init",
  "m0002_eepnet_signups_2",
  "m0003_create_tests_table_v2",
  "m0004_convert_all_tables_to_innodb",
  "m0005_create_billing_tables",
  "m0006_eepnet_signups_3",
  "m0007_create_pro_tables_v4",
  "m0008_persistent_vars",
  "m0009_pad_tables",
  "m0010_pad_sqlmeta",
  "m0011_pro_users_temppass",
  "m0012_pro_users_auto_signin",
  "m0013_pne_padv2_upgrade",
  "m0014_pne_globalpadids",
  "m0015_padmeta_passwords",
  "m0016_pne_tracking_data",
  "m0017_pne_tracking_data_v2",
  "m0018_eepnet_checkout_tables",
  "m0019_padmeta_deleted",
  "m0020_padmeta_archived",
  "m0021_pro_padmeta_json",
  "m0022_create_userids_table",
  "m0023_create_usagestats_table",
  "m0024_statistics_table",
  "m0025_rename_pro_users_table",
  "m0026_create_guests_table",
  "m0027_pro_config",
  "m0028_ondemand_beta_emails",
  "m0029_lowercase_subdomains",
  "m0030_fix_statistics_values",
  "m0031_deleted_pro_users",
  "m0032_reduce_topvalues_counts",
  "m0033_pro_account_usage",
  "m0034_create_recurring_billing_table",
  "m0035_add_email_to_paymentinfo",
  "m0036_create_missing_subscription_records",
  "m0037_create_pro_referral_table",
  "m0038_pad_coarse_revs"
];

var mscope = this;
migrations.forEach(function(m) {
  import.call(mscope, "etherpad.db_migrations."+m);
});

//----------------------------------------------------------------

function dmesg(m) {
  if ((!isProduction()) || appjet.cache.db_migrations_print_debug) {
    log.info(m);
    println(m);
  }
}

function onStartup() {
  appjet.cache.db_migrations_print_debug = true;
  if (!sqlcommon.doesTableExist("db_migrations")) {
    appjet.cache.db_migrations_print_debug = false;
    sqlobj.createTable('db_migrations', {
      id: 'INT NOT NULL '+sqlcommon.autoIncrementClause()+' PRIMARY KEY',
      name: 'VARCHAR(255) NOT NULL UNIQUE',
      completed: 'TIMESTAMP'
    });
  }

  if (pne_utils.isPNE()) { pne_utils.checkDbVersionUpgrade(); }
  runMigrations();
  if (pne_utils.isPNE()) { pne_utils.saveDbVersion(); }
}

function _migrationName(m) {
  m = m.replace(/^m\d+\_/, '');
  m = m.replace(/\_/g, '-');
  return m;
}

function getCompletedMigrations() {
  var completedMigrationsList = sqlobj.selectMulti('db_migrations', {}, {});
  var completedMigrations = {};

  completedMigrationsList.forEach(function(c) {
    completedMigrations[c.name] = true;
  });

  return completedMigrations;
}

function runMigrations() {
  var completedMigrations = getCompletedMigrations();

  dmesg("Checking for database migrations...");
  migrations.forEach(function(m) {
    var name = _migrationName(m);
    if (!completedMigrations[name]) {
      sqlcommon.inTransaction(function() {
        dmesg("performing database migration: ["+name+"]");
        var startTime = +(new Date);

        mscope[m].run();

        var elapsedMs = +(new Date) - startTime;
        dmesg("migration completed in "+elapsedMs+"ms");

        sqlobj.insert('db_migrations', {
          name: name,
          completed: new Date()
        });
      });
    }
  });
}


