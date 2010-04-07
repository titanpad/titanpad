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

if [ -z "$JAR" ]; then
    if [ ! -z `which fastjar` ]; then
        JAR=fastjar
    else
        JAR=jar
    fi
fi

function notify {
    if [ ! -z `which growlnotify` ]; then
	echo $0 finished | growlnotify
    fi   
}
trap notify EXIT

source ../infrastructure/bin/compilecache.sh

suffix="-dev";
if [ "$1" == "prod" ]; then
    suffix="";
    shift;
fi

OWD=`pwd`
cd ../infrastructure
JAR=$JAR bin/makejar.sh $@

rm -rf build/etherpad-jars
mkdir -p build/etherpad-jars

echo "including etherpad JARs..."

JARFILES="echo ../etherpad/lib/*.jar"
function genjar {
    echo "unzipping JARs..."
    pushd $1 >> /dev/null

    for a in ../../../etherpad/lib/*.jar; do
	$JAR xf $a
	rm -rf META-INF/{MANIFEST.MF,NOTICE{,.txt},LICENSE{,.txt},INDEX.LIST,SUN_MICR.{RSA,SF},maven}
    done

    popd >> /dev/null    
}
cacheonfiles JAR-etherpad "$JARFILES" genjar 1

echo "updating..."

pushd buildcache/JAR-etherpad >> /dev/null
$JAR uf ../../build/appjet.jar `ls . | grep -v "^t$"`

echo "done."

popd >> /dev/null

dst="$OWD/appjet-eth$suffix.jar"
cp -f build/appjet.jar $dst
cd $OWD
echo "wrote $dst"
