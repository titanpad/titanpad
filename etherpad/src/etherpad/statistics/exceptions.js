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


import("fastJSON");
import("etherpad.log");
import("cache_utils.syncedWithCache");
import("funhtml.*");
import("jsutils.{eachProperty,keys}");

function _dayKey(date) {
  return [date.getFullYear(), date.getMonth()+1, date.getDate()].join(',');
}

function _dateAddDays(date, numDays) {
  return new Date((+date) + numDays*1000*60*60*24);
}

function _loadDay(date) {
  var fileName = log.frontendLogFileName('exception', date);
  if (! fileName) {
    return [];
  }
  var reader = new java.io.BufferedReader(new java.io.FileReader(fileName));
  var line = null;
  var array = [];
  while ((line = reader.readLine()) !== null) {
    array.push(fastJSON.parse(line));
  }
  return array;
}

function _accessLatestLogs(func) {
  syncedWithCache("etherpad.statistics.exceptions", function(exc) {
    if (! exc.byDay) {
      exc.byDay = {};
    }
    // always reload today from disk
    var now = new Date();
    var today = now;
    var todayKey = _dayKey(today);
    exc.byDay[todayKey] = _loadDay(today);
    var activeKeys = {};
    activeKeys[todayKey] = true;
    // load any of 7 previous days that aren't loaded or
    // were not loaded as a historical day
    for(var i=1;i<=7;i++) {
      var pastDay = _dateAddDays(today, -i);
      var pastDayKey = _dayKey(pastDay);
      activeKeys[pastDayKey] = true;
      if ((! exc.byDay[pastDayKey]) || (! exc.byDay[pastDayKey].sealed)) {
        exc.byDay[pastDayKey] = _loadDay(pastDay);
        exc.byDay[pastDayKey].sealed = true; // in the past, won't change
      }
    }
    // clear old days
    for(var k in exc.byDay) {
      if (! (k in activeKeys)) {
        delete exc.byDay[k];
      }
    }

    var logs = {
      getDay: function(daysAgo) {
        return exc.byDay[_dayKey(_dateAddDays(today, -daysAgo))];
      },
      eachLineInLastNDays: function(n, func) {
        var oldest = _dateAddDays(now, -n);
        var oldestNum = +oldest;
        for(var i=n;i>=0;i--) {
          var lines = logs.getDay(i);
          lines.forEach(function(line) {
            if (line.date > oldestNum) {
              func(line);
            }
          });
        }
      }
    };

    func(logs);
  });
}

function _exceptionHash(line) {
  // skip the first line of jsTrace, take hashCode of rest
  var trace = line.jsTrace;
  var stack = trace.substring(trace.indexOf('\n') + 1);
  return new java.lang.String(stack).hashCode();
}

// Used to take a series of strings and produce an array of
// [common prefix, example middle, common suffix], or
// [string] if the strings are the same.  Takes oldInfo
// and returns newInfo; each is either null or an array
// of length 1 or 3.
function _accumCommonPrefixSuffix(oldInfo, newString) {
  function _commonPrefixLength(a, b) {
    var x = 0;
    while (x < a.length && x < b.length && a.charAt(x) == b.charAt(x)) {
      x++;
    }
    return x;
  }

  function _commonSuffixLength(a, b) {
    var x = 0;
    while (x < a.length && x < b.length &&
           a.charAt(a.length-1-x) == b.charAt(b.length-1-x)) {
      x++;
    }
    return x;
  }

  if (! oldInfo) {
    return [newString];
  }
  else if (oldInfo.length == 1) {
    var oldString = oldInfo[0];
    if (oldString == newString) {
      return oldInfo;
    }
    var newInfo = [];
    var a = _commonPrefixLength(oldString, newString);
    newInfo[0] = newString.substring(0, a);
    oldString = oldString.substring(a);
    newString = newString.substring(a);
    var b = _commonSuffixLength(oldString, newString);
    newInfo[2] = newString.slice(-b);
    oldString = oldString.slice(0, -b);
    newString = newString.slice(0, -b);
    newInfo[1] = newString;
    return newInfo;
  }
  else {
    // oldInfo.length == 3
    var a = _commonPrefixLength(oldInfo[0], newString);
    var b = _commonSuffixLength(oldInfo[2], newString);
    return [newString.slice(0, a), newString.slice(a, -b),
            newString.slice(-b)];
  }
}

function render() {

  _accessLatestLogs(function(logs) {
    var weekCounts = {};
    var totalWeekCount = 0;

    // count exceptions of each kind in last week
    logs.eachLineInLastNDays(7, function(line) {
      var hash = _exceptionHash(line);
      weekCounts[hash] = (weekCounts[hash] || 0) + 1;
      totalWeekCount++;
    });

    var dayData = {};
    var totalDayCount = 0;

    // accumulate data about each exception in last 24 hours
    logs.eachLineInLastNDays(1, function(line) {
      var hash = _exceptionHash(line);
      var oldData = dayData[hash];
      var data = (oldData || {});
      if (! oldData) {
        data.hash = hash;
        data.trace = line.jsTrace.substring(line.jsTrace.indexOf('\n')+1);
        data.trackers = {};
      }
      var msg = line.jsTrace.substring(0, line.jsTrace.indexOf('\n'));
      data.message = _accumCommonPrefixSuffix(data.message, msg);
      data.count = (data.count || 0)+1;
      data.trackers[line.tracker] = true;
      totalDayCount++;
      dayData[hash] = data;
    });

    // put day datas in an array and sort
    var dayDatas = [];
    eachProperty(dayData, function(k,v) {
      dayDatas.push(v);
    });
    dayDatas.sort(function(a, b) {
      return b.count - a.count;
    });

    // process
    dayDatas.forEach(function(data) {
      data.weekCount = (weekCounts[data.hash] || 0);
      data.numTrackers = keys(data.trackers).length;
    });

    // gen HTML
    function num(n) { return SPAN({className:'num'}, n); }

    response.write(STYLE(html(".trace { height: 300px; overflow: auto; background: #eee; margin-left: 1em; font-family: monospace; border: 1px solid #833; padding: 4px; }\n"+
                              ".exc { margin: 1em 0; }\n"+
                              ".num { font-size: 150%; }")));

    response.write(P("Total exceptions in past day: ", num(totalDayCount),
                     ", past week: ", totalWeekCount));

    response.write(P(SMALL(EM("Data on this page is live."))));

    response.write(H2("Exceptions grouped by stack trace:"));

    dayDatas.forEach(function(data) {
      response.write(DIV({className:'exc'},
                         'Past day: ',num(data.count),', Past week: ',
                         data.weekCount,', Different tracker cookies today: ',
                         data.numTrackers,
                         '\n',data.message[0],
                         (data.message[1] && I(data.message[1])) || '',
                         (data.message[2] || ''),'\n',
                         DIV({className:'trace'}, data.trace)));
    });
  });
}
