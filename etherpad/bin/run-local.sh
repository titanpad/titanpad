#!/bin/bash -e

#  Copyright 2009 Google Inc.
#  
#  Licensed under the Apache License, Version 2.0 (the "License");
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#  
#       http://www.apache.org/licenses/LICENSE-2.0
#  
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS-IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.

mkdir -p data/appjet

MXRAM="1G"
if [ ! -z $1 ]; then
    if [ ! '-' = `echo $1 | head -c 1` ]; then
        MXRAM="$1";
        shift;
    fi
fi

CP="appjet-eth-dev.jar:data"
for f in lib/*.jar; do
    CP="$CP:$f"
done

if [ -z "$JAVA" ]; then
    JAVA=java
fi

# etherpad properties file
cfg_file=./data/etherpad.local.properties
if [ ! -f $cfg_file ]; then
  cfg_file=./etc/etherpad.localdev-default.properties
fi
if [[ $1 == "--cfg" ]]; then
  cfg_file=${2}
  shift;
  shift;
fi

echo "Using config file: ${cfg_file}"

$JAVA -classpath $CP \
    -server \
    -Xmx${MXRAM} \
    -Xms${MXRAM} \
    -Djava.awt.headless=true \
    -XX:MaxGCPauseMillis=500 \
    -XX:+UseConcMarkSweepGC \
    -XX:+CMSIncrementalMode \
    -XX:CMSIncrementalSafetyFactor=50 \
    -XX:+PrintGCDetails \
    -XX:+PrintGCTimeStamps \
    -Xloggc:./data/logs/backend/jvm-gc.log \
    -Dappjet.jmxremote=true \
    $JAVA_OPTS \
    net.appjet.oui.main \
    --configFile=${cfg_file} \
    "$@"

