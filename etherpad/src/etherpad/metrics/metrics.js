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

import("etherpad.log.frontendLogFileName");
import("jsutils.eachProperty");
import("stringutils.startsWith");
import("fileutils.eachFileLine");

jimport("java.lang.System.out.println");

var _idleTime = 5*60*1000 // 5 minutes?

function _isPadUrl(url) {
  return url != '/' && ! startsWith(url, '/ep/');
}

function VisitData(url, referer) {
  this.url = url;
  this.referer = referer;
  this.__defineGetter__('isPadVisit', function() { 
    return _isPadUrl(this.url);
  });
}
VisitData.prototype.toString = function() {
  var re = new RegExp("^https?://"+request.host);
  if (this.referer && ! re.test(this.referer)) {
    return this.url+", from "+this.referer;
  } else {
    return this.url;
  }
}

function Event(time, type, data) {
  this.time = time;
  this.type = type;
  this.data = data;
}
Event.prototype.toString = function() {
  return "("+this.type+" "+this.data+" @ "+this.time.getTime()+")";  
}

function Flow(sessionKey, startEvent) {
  this.sessionKey = sessionKey;
  this.events = [];
  this.visitedPaths = {};
  var visitCount = 0;
  var visitsCache;
  this._updateVisitedPaths = function(url) {
    if (! this.visitedPaths[url]) {
      this.visitedPaths[url] = [visitCount];
    } else {
      this.visitedPaths[url].push(visitCount);
    }    
  }
  var isInPad = 0;
  this.push = function(evt) {
    evt.flow = this;
    this.events.push(evt);
    if (evt.type == 'visit') {
      this._updateVisitedPaths(evt.data.url);
      if (_isPadUrl(evt.data.url)) {
        this._updateVisitedPaths("(pad)");
      }
      visitCount++;
      visitsCache = undefined;
    } else if (evt.type == 'userjoin') {
      isInPad++;
    } else if (evt.type == 'userleave') {
      isInPad--;
    }
  }
  this.__defineGetter__("isInPad", function() { return isInPad > 0; });
  this.__defineGetter__("lastEvent", function() { 
    return this.events[this.events.length-1]; 
  });
  this.__defineGetter__("visits", function() {
    if (! visitsCache) {
      visitsCache = this.events.filter(function(x) { return x.type == "visit" });
    }
    return visitsCache;
  });
  startEvent.flow = this;
  this.push(startEvent);
}
Flow.prototype.toString = function() {
  return "["+this.events.map(function(x) { return x.toString(); }).join(", ")+"]";
}
Flow.prototype.includesVisit = function(path, index, useExactIndexMatch) {
  if (! this.visitedPaths[path]) return false;
  if (useExactIndexMatch) {
    return this.visitedPaths[path].some(function(x) { return x == index });
  } else {
    if (index) {
      for (var i = 0; i < this.visitedPaths[path].length; ++i) {
        if (this.visitedPaths[path][i] >= index)
          return this.visitedPaths[path][i];
      }
      return false;
    } else {
      return true;
    }
  }
}
Flow.prototype.visitIndices = function(path) {
  return this.visitedPaths[path] || [];
}

function getKeyForDate(date) {
  return date.getYear()+":"+date.getMonth()+":"+date.getDay();
}

function parseEvents(dates) {
  if (! appjet.cache["metrics-events"]) {
    appjet.cache["metrics-events"] = {};
  }
  var events = {};
  function eventArray(key) {
    if (! events[key]) {
      events[key] = [];
    }
    return events[key];
  }

  dates.sort(function(a, b) { return a.getTime() - b.getTime(); });
  dates.forEach(function(day) {
    if (! appjet.cache["metrics-events"][getKeyForDate(day)]) {
      var daysEvents = {};
      function daysEventArray(key) {
        if (! daysEvents[key]) {
          daysEvents[key] = [];
        }
        return daysEvents[key];
      }
      var requestLog = frontendLogFileName("request", day);
      if (requestLog) {
        eachFileLine(requestLog, function(line) {
          var s = line.split("\t");
          var sessionKey = s[3];
          if (sessionKey == "-") { return; }
          var time = new Date(Number(s[1]));
          var path = s[7];
          var referer = (s[9] == "-" ? null : s[9]);
          var userAgent = s[10];
          var statusCode = s[5];
          // Remove bots and other automatic or irrelevant requests.
          // There's got to be something better than a whitelist.
          if (userAgent.indexOf("Mozilla") < 0 &&
              userAgent.indexOf("Opera") < 0) {
             return;
          }
          if (path == "/favicon.ico") { return; }
          daysEventArray(sessionKey).push(new Event(time, "visit", new VisitData(path, referer)));
        });
      }
      var padEventLog = frontendLogFileName("padevents", day);
      if (padEventLog) {
        eachFileLine(padEventLog, function(line) {
          var s = line.split("\t");
          var sessionKey = s[7];
          if (sessionKey == "-") { return; }
          var time = new Date(Number(s[1]));
          var padId = s[3];
          var evt = s[2];
          daysEventArray(sessionKey).push(new Event(time, evt, padId));
        });
      }
      var chatLog = frontendLogFileName("chat", day);
      if (chatLog) {
        eachFileLine(chatLog, function(line) {
          var s = line.split("\t");
          var sessionKey = s[4];
          if (sessionKey == "-") { return; }
          var time = new Date(Number(s[1]));
          var padId = s[2];
          daysEventArray(sessionKey).push(new Event(time, "chat", padId));
        });
      }
      eachProperty(daysEvents, function(k, v) {
        v.sort(function(a, b) { return a.time.getTime() - b.time.getTime()});
      });
      appjet.cache["metrics-events"][getKeyForDate(day)] = daysEvents;
    }
    eachProperty(appjet.cache["metrics-events"][getKeyForDate(day)], function(k, v) {
      Array.prototype.push.apply(eventArray(k), v);
    });
  });

  return events;
}

function getFlows(startDate, endDate) {
  if (! endDate) { endDate = startDate; }
  if (! appjet.cache.flows || request.params.clearCache == "1") {
    appjet.cache.flows = {};
  }
  if (appjet.cache.flows[getKeyForDate(startDate)+"-"+getKeyForDate(endDate)]) {
    return appjet.cache.flows[getKeyForDate(startDate)+"-"+getKeyForDate(endDate)];
  }

  var datesForEvents = [];
  for (var i = startDate; i.getTime() <= endDate.getTime(); i = new Date(i.getTime()+86400*1000)) {
    datesForEvents.push(i);
  }

  var events = parseEvents(datesForEvents);
  var flows = {};
    
  eachProperty(events, function(k, eventArray) {
    flows[k] = [];
    function lastFlow() {
      var f = flows[k];
      if (f.length > 0) {
        return f[f.length-1];
      }
    }
    var lastTime = 0;
    eventArray.forEach(function(evt) {
      var l = lastFlow();
      
      if (l && (l.lastEvent.time.getTime() + _idleTime > evt.time.getTime() || l.isInPad)) {
        l.push(evt);
      } else {
        flows[k].push(new Flow(k, evt));
      }
    });
  });
  appjet.cache.flows[getKeyForDate(startDate)+"-"+getKeyForDate(endDate)] = flows;
  return flows;
}

function _uniq(array) {
  var seen = {};
  return array.filter(function(x) {
    if (seen[x]) {
      return false;
    }
    seen[x] = true;
    return true;
  });
}

function getFunnel(startDate, endDate, pathsArray, useConsecutivePaths) {
  var flows = getFlows(startDate, endDate)
    
  var flowsAtStep = pathsArray.map(function() { return []; });
  eachProperty(flows, function(k, flowArray) {
    flowArray.forEach(function(flow) {
      if (flow.includesVisit(pathsArray[0])) {
        flowsAtStep[0].push({f: flow, i: flow.visitIndices(pathsArray[0])});
      }
    });
  });
  for (var i = 0; i < pathsArray.length-1; ++i) {
    flowsAtStep[i].forEach(function(fobj) {
      var newIndices = fobj.i.map(function(index) { 
        var nextIndex = 
          fobj.f.includesVisit(pathsArray[i+1], index+1, useConsecutivePaths);
        if (nextIndex !== false) {
          return (useConsecutivePaths ? index+1 : nextIndex);
        }
      }).filter(function(x) { return x !== undefined; });
      if (newIndices.length > 0) {
        flowsAtStep[i+1].push({f: fobj.f, i: newIndices});
      }
    });
  }
  return {
    flows: flowsAtStep.map(function(x) { return x.map(function(y) { return y.f; }); }),
    visitCounts: flowsAtStep.map(function(x) { return x.length; }),
    visitorCounts: flowsAtStep.map(function(x) { 
      return _uniq(x.map(function(y) { return y.f.sessionKey; })).length 
    })
  };
}

function makeHistogram(array) {
  var counts = {};
  for (var i = 0; i < array.length; ++i) {
    var value = array[i]
    if (! counts[value]) {
      counts[value] = 0;
    }
    counts[value]++;
  }
  var histogram = [];
  eachProperty(counts, function(k, v) {
    histogram.push({value: k, count: v, fraction: (v / array.length)});
  });
  histogram.sort(function(a, b) { return b.count - a.count; });
  return histogram;
}

function getOrigins(startDate, endDate, useReferer, shouldAggregatePads) {
  var key = (useReferer ? "referer" : "url");
  var flows = getFlows(startDate, endDate);
  
  var sessionKeyFirsts = [];
  var flowFirsts = [];
  eachProperty(flows, function(k, flowArray) {
    if (flowArray[0].visits[0] && flowArray[0].visits[0].data &&
        flowArray[0].visits[0].data[key]) {
      var path = flowArray[0].visits[0].data[key];
      sessionKeyFirsts.push(
        (shouldAggregatePads && ! useReferer && _isPadUrl(path) ?
         "(pad)" : path));
    }
    flowArray.forEach(function(flow) {
      if (flow.visits[0] && flow.visits[0].data &&
          flow.visits[0].data[key]) {
        var path = flow.visits[0].data[key];
        flowFirsts.push(
          (shouldAggregatePads && ! useReferer && _isPadUrl(path) ?
           "(pad)" : path));
      }
    });
  });
  
  if (useReferer) {
    flowFirsts = flowFirsts.filter(function(x) { return ! startsWith(x, "http://etherpad.com"); });
    sessionKeyFirsts = sessionKeyFirsts.filter(function(x) { return ! startsWith(x, "http://etherpad.com"); });
  }
  
  return {
    flowFirsts: makeHistogram(flowFirsts),
    sessionKeyFirsts: makeHistogram(sessionKeyFirsts)
  }
}

function getExits(startDate, endDate, src, shouldAggregatePads) {
  var flows = getFlows(startDate, endDate);
  
  var exits = [];
  
  eachProperty(flows, function(k, flowArray) {
    flowArray.forEach(function(flow) {
      var indices = flow.visitIndices(src);
      for (var i = 0; i < indices.length; ++i) {
        if (indices[i]+1 < flow.visits.length) {
          if (src != flow.visits[indices[i]+1].data.url) {
            exits.push(flow.visits[indices[i]+1]);
          }
        } else {
          exits.push("(nothing)");
        }
      }
    });
  });
  return {
    nextVisits: exits,
    histogram: makeHistogram(exits.map(function(x) { 
      if (typeof(x) == 'string') return x;
      return ((! shouldAggregatePads) || ! _isPadUrl(x.data.url) ?
              x.data.url : "(pad)" )
    }))
  }
}

jimport("org.jfree.data.general.DefaultPieDataset");
jimport("org.jfree.chart.plot.PiePlot");
jimport("org.jfree.chart.ChartUtilities");
jimport("org.jfree.chart.JFreeChart");

function _fToPct(f) {
  return Math.round(f*10000)/100;
}

function _shorten(str) {
  if (startsWith(str, "http://")) {
    str = str.substring("http://".length);
  }
  var len = 35;
  if (str.length > len) {
    return str.substring(0, len-3)+"..."
  } else {
    return str;
  }
}

function respondWithPieChart(name, histogram) {
  var width = 900;
  var height = 300;
  
  var ds = new DefaultPieDataset();
  
  var cumulative = 0;
  var other = 0;
  var otherCount = 0;
  histogram.forEach(function(x, i) {
    cumulative += x.fraction;
    if (cumulative < 0.98 && x.fraction > .01) {
      ds.setValue(_shorten(x.value)+"\n ("+x.count+" visits - "+_fToPct(x.fraction)+"%)", x.fraction);
    } else {
      other += x.fraction;
      otherCount += x.count;
    }
  });
  if (other > 0) {
    ds.setValue("Other ("+otherCount + " visits - "+_fToPct(other)+"%)", other);
  }
  
  var piePlot = new PiePlot(ds);
  
  var chart = new JFreeChart(piePlot);
  chart.setTitle(name);
  chart.removeLegend();
  
  var jos = new java.io.ByteArrayOutputStream();
  ChartUtilities.writeChartAsJPEG(
    jos, 1.0, chart, width, height);
    
  response.setContentType('image/jpeg');
  response.writeBytes(jos.toByteArray());
}












