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

umask 022

progress() {
	echo
	echo "  * $@"
}

OWD=`pwd`

export SCALA_HOME="/opt/titanpad/infrastructure/lib/scala-2.7.7.final"
export SCALA_LIBDIR="$SCALA_HOME/lib"
export BUILDDIR=`readlink -f $OWD/../build`
export CODEDEST=$BUILDDIR/dest
export LIBDIR=$BUILDDIR/lib
rm -rf $BUILDDIR
mkdir -p $CODEDEST
mkdir -p $LIBDIR

progress "Build Directory: $BUILDDIR"
progress "Lib Directory: $LIBDIR"

cd ../infrastructure

progress "Copying jars into libdir..."
JARS="${OOJARS} ${MYSQL_CONNECTOR_JAR} $SCALA_LIBDIR/scala-library.jar"
JARS="${JARS} `echo lib/*jar`"
JARS="${JARS} ../etherpad/lib/*.jar"
BUILDCP=""
for jar in $JARS; do
	cp $jar $LIBDIR/
	BUILDCP="${BUILDCP}:$LIBDIR/`basename $jar`"
done

CLASSPATH="$CODEDEST:$BUILDCP"
progress "CLASSPATH: $CLASSPATH"


CODEDIRS="net.appjet.common net.appjet.common.sars net.appjet.common.cli net.appjet.bodylock net.appjet.oui net.appjet.ajstdlib com.etherpad com.etherpad.openofficeservice"

for codedir in $CODEDIRS; do
	progress "Building code in $codedir..."
	files_java=`find $codedir -name '*.java'`
	if [ ! -z "$files_java" ]; then
		javac -classpath $CLASSPATH -d $CODEDEST $@ $files_java
	fi
	files_scala=`find $codedir -name '*.scala'`
	if [ ! -z "$files_scala" ]; then
		$SCALA_HOME/bin/fsc -classpath $CLASSPATH -d $CODEDEST $@ $files_scala
	fi
done

progress "Copying ajstdlib files..."
cp net.appjet.ajstdlib/streaming-client.js $CODEDEST/net/appjet/ajstdlib/
cp net.appjet.ajstdlib/streaming-iframe.html $CODEDEST/net/appjet/ajstdlib/

mkdir -p $CODEDEST/net/appjet/ajstdlib/modules

progress "Building ajstdlib javascript classfiles..."
$SCALA_HOME/bin/scala -classpath $CLASSPATH net.appjet.bodylock.Compiler \
	-destination=$CODEDEST/net/appjet/ajstdlib/ \
	-cutPrefix=framework-src \
	`find framework-src -name '*.js'`

jar cf $BUILDDIR/appjet.jar -C $CODEDEST .
ls -la $BUILDDIR/appjet.jar

progress "Done."
