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

if [ `whoami` != "root" ]; then
  echo "Must run as root, i.e., sudo $0"
  exit 1
fi

db="etherpad"

echo "Creating etherpad ${db}..."
echo "create database ${db};" | ${mysql} -u root

echo "Granting priviliges..."
echo "grant all privileges on ${db}.* to 'etherpad'@'localhost' identified by 'password';" | ${mysql} -u root

echo "Success"
