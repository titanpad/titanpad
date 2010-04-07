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

import("execution");
import("comet");
import("fastJSON");
import("cache_utils.syncedWithCache");
import("etherpad.collab.collab_server");
import("etherpad.collab.readonly_server");
import("etherpad.log");
jimport("java.util.concurrent.ConcurrentSkipListMap");
jimport("java.util.concurrent.CopyOnWriteArraySet");

function onStartup() {
  execution.initTaskThreadPool("collabroom_async", 1);
}

function _doWarn(str) {
  log.warn(appjet.executionId+": "+str);
}

// deep-copies (recursively clones) an object (or value)
function _deepCopy(obj) {
  if ((typeof obj) != 'object' || !obj) {
    return obj;
  }
  var o = {};
  for(var k in obj) {
    if (obj.hasOwnProperty(k)) {
      var v = obj[k];
      if ((typeof v) == 'object' && v) {
        o[k] = _deepCopy(v);
      }
      else {
        o[k] = v;
      }
    }
  }
  return o;
}

// calls func inside a global lock on the cache
function _withCache(func) {
  return syncedWithCache("collabroom_server", function(cache) {
    if (! cache.rooms) {
      // roomName -> { connections: CopyOnWriteArraySet<connectionId>,
      //               type: <immutable type string> }
      cache.rooms = new ConcurrentSkipListMap();
    }
    if (! cache.allConnections) {
      // connectionId -> connection object
      cache.allConnections = new ConcurrentSkipListMap();
    }
    return func(cache);
  });
}

// accesses cache without lock
function _getCache() {
  return _withCache(function(cache) { return cache; });
}

// if roomType is null, will only update an existing connection
// (otherwise will insert or update as appropriate)
function _putConnection(connection, roomType) {
  var roomName = connection.roomName;
  var connectionId = connection.connectionId;
  var socketId = connection.socketId;
  var data = connection.data;

  _withCache(function(cache) {
    var rooms = cache.rooms;
    if (! rooms.containsKey(roomName)) {
      // connection refers to room that doesn't exist / is empty
      if (roomType) {
        rooms.put(roomName, {connections: new CopyOnWriteArraySet(),
                             type: roomType});
      }
      else {
        return;
      }
    }
    if (roomType) {
      rooms.get(roomName).connections.add(connectionId);
      cache.allConnections.put(connectionId, connection);
    }
    else {
      cache.allConnections.replace(connectionId, connection);
    }
  });
}

function _removeConnection(connection) {
  _withCache(function(cache) {
    var rooms = cache.rooms;
    var thisRoom = connection.roomName;
    var thisConnectionId = connection.connectionId;
    if (rooms.containsKey(thisRoom)) {
      var roomConnections = rooms.get(thisRoom).connections;
      roomConnections.remove(thisConnectionId);
      if (roomConnections.isEmpty()) {
        rooms.remove(thisRoom);
      }
    }
    cache.allConnections.remove(thisConnectionId);
  });
}

function _getConnection(connectionId) {
  // return a copy of the connection object
  return _deepCopy(_getCache().allConnections.get(connectionId) || null);
}

function _getConnections(roomName) {
  var array = [];

  var roomObj = _getCache().rooms.get(roomName);
  if (roomObj) {
    var roomConnections = roomObj.connections;
    var iter = roomConnections.iterator();
    while (iter.hasNext()) {
      var cid = iter.next();
      var conn = _getConnection(cid);
      if (conn) {
        array.push(conn);
      }
    }
  }
  return array;
}

function sendMessage(connectionId, msg) {
  var connection = _getConnection(connectionId);
  if (connection) {
    _sendMessageToSocket(connection.socketId, msg);
    if (! comet.isConnected(connection.socketId)) {
      // defunct socket, disconnect (later)
      execution.scheduleTask("collabroom_async",
                             "collabRoomDisconnectSocket",
                             0, [connection.connectionId,
                                 connection.socketId]);
    }
  }
}

function _sendMessageToSocket(socketId, msg) {
  var msgString = fastJSON.stringify({type: "COLLABROOM", data: msg});
  comet.sendMessage(socketId, msgString);
}

function disconnectDefunctSocket(connectionId, socketId) {
  var connection = _getConnection(connectionId);
  if (connection && connection.socketId == socketId) {
    removeRoomConnection(connectionId);
  }
}

function _bootSocket(socketId, reason) {
  if (reason) {
    _sendMessageToSocket(socketId,
                         {type: "DISCONNECT_REASON", reason: reason});
  }
  comet.disconnect(socketId);
}

function bootConnection(connectionId, reason) {
  var connection = _getConnection(connectionId);
  if (connection) {
    _bootSocket(connection.socketId, reason);
    removeRoomConnection(connectionId);
  }
}

function getCallbacksForRoom(roomName, roomType) {
  if (! roomType) {
    var room = _getCache().rooms.get(roomName);
    if (room) {
      roomType = room.type;
    }
  }

  var emptyCallbacks = {};
  emptyCallbacks.introduceUsers =
    function (joiningConnection, existingConnection) {};
  emptyCallbacks.extroduceUsers =
    function extroduceUsers(leavingConnection, existingConnection) {};
  emptyCallbacks.onAddConnection = function (joiningData) {};
  emptyCallbacks.onRemoveConnection = function (leavingData) {};
  emptyCallbacks.handleConnect =
    function(data) { return /*userInfo or */null; };
  emptyCallbacks.clientReady = function(newConnection, data) {};
  emptyCallbacks.handleMessage = function(connection, msg) {};

  if (roomType == collab_server.PADPAGE_ROOMTYPE) {
    return collab_server.getRoomCallbacks(roomName, emptyCallbacks);
  }
  else if (roomType == readonly_server.PADVIEW_ROOMTYPE) {
    return readonly_server.getRoomCallbacks(roomName, emptyCallbacks);
  }
  else {
    //java.lang.System.out.println("UNKNOWN ROOMTYPE: "+roomType);
    return emptyCallbacks;
  }
}

// roomName must be globally unique, just within roomType;
// data must have a userInfo.userId
function addRoomConnection(roomName, roomType,
                           connectionId, socketId, data) {
  var callbacks = getCallbacksForRoom(roomName, roomType);

  comet.setAttribute(socketId, "connectionId", connectionId);

  bootConnection(connectionId, "userdup");
  var joiningConnection = {roomName:roomName,
                           connectionId:connectionId, socketId:socketId,
                           data:data};
  _putConnection(joiningConnection, roomType);
  var connections = _getConnections(roomName);
  var joiningUser = data.userInfo.userId;

  connections.forEach(function(connection) {
    if (connection.socketId != socketId) {
      var user = connection.data.userInfo.userId;
      if (user == joiningUser) {
        bootConnection(connection.connectionId, "userdup");
      }
      else {
        callbacks.introduceUsers(joiningConnection, connection);
      }
    }
  });

  callbacks.onAddConnection(data);

  return joiningConnection;
}

function removeRoomConnection(connectionId) {
  var leavingConnection = _getConnection(connectionId);
  if (leavingConnection) {
    var roomName = leavingConnection.roomName;
    var callbacks = getCallbacksForRoom(roomName);

    _removeConnection(leavingConnection);

    _getConnections(roomName).forEach(function (connection) {
      callbacks.extroduceUsers(leavingConnection, connection);
    });

    callbacks.onRemoveConnection(leavingConnection.data);
  }
}

function getConnection(connectionId) {
  return _getConnection(connectionId);
}

function updateRoomConnectionData(connectionId, data) {
  var connection = _getConnection(connectionId);
  if (connection) {
    connection.data = data;
    _putConnection(connection);
  }
}

function getRoomConnections(roomName) {
  return _getConnections(roomName);
}

function getAllRoomsOfType(roomType) {
  var rooms = _getCache().rooms;
  var roomsIter = rooms.entrySet().iterator();
  var array = [];
  while (roomsIter.hasNext()) {
    var entry = roomsIter.next();
    var roomName = entry.getKey();
    var roomStruct = entry.getValue();
    if (roomStruct.type == roomType) {
      array.push(roomName);
    }
  }
  return array;
}

function getSocketConnectionId(socketId) {
  var result = comet.getAttribute(socketId, "connectionId");
  return result && String(result);
}

function handleComet(cometOp, cometId, msg) {
  var cometEvent = cometOp;

  function requireTruthy(x, id) {
    if (!x) {
      _doWarn("Collab operation rejected due to missing value, case "+id);
      if (messageSocketId) {
        comet.disconnect(messageSocketId);
      }
      response.stop();
    }
    return x;
  }

  if (cometEvent != "disconnect" && cometEvent != "message") {
    response.stop();
  }

  var messageSocketId = requireTruthy(cometId, 2);
  var messageConnectionId = getSocketConnectionId(messageSocketId);

  if (cometEvent == "disconnect") {
    if (messageConnectionId) {
      removeRoomConnection(messageConnectionId);
    }
  }
  else if (cometEvent == "message") {
    if (msg.type == "CLIENT_READY") {
      var roomType = requireTruthy(msg.roomType, 4);
      var roomName = requireTruthy(msg.roomName, 11);

      var socketId = messageSocketId;
      var connectionId = messageSocketId;
      var clientReadyData = requireTruthy(msg.data, 12);

      var callbacks = getCallbacksForRoom(roomName, roomType);
      var userInfo =
        requireTruthy(callbacks.handleConnect(clientReadyData), 13);

      var newConnection = addRoomConnection(roomName, roomType,
                                            connectionId, socketId,
                                            {userInfo: userInfo});

      callbacks.clientReady(newConnection, clientReadyData);
    }
    else {
      if (messageConnectionId) {
        var connection = getConnection(messageConnectionId);
        if (connection) {
          var callbacks = getCallbacksForRoom(connection.roomName);
          callbacks.handleMessage(connection, msg);
        }
      }
    }
  }
}