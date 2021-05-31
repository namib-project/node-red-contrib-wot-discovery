node-red-contrib-wot-discovery
=====================
![Build Status](https://github.com/JKRhb/node-red-contrib-wot-discovery/workflows/Build%20Status/badge.svg)
[![Coverage Status](https://coveralls.io/repos/github/JKRhb/node-red-contrib-wot-discovery/badge.svg?branch=main)](https://coveralls.io/github/JKRhb/node-red-contrib-wot-discovery?branch=main)
[![Dependency Status](https://david-dm.org/JKRhb/node-red-contrib-wot-discovery.png)](https://david-dm.org/JKRhb/node-red-contrib-wot-discovery)
[![Dev Dependency Status](https://david-dm.org/JKRhb/node-red-contrib-wot-discovery/dev-status.png)](https://david-dm.org/JKRhb/node-red-contrib-wot-discovery#dev-badge-embed)

Experimental Node-RED package for discovery in the Web of Things (WoT).
It provides a `wot-discovery` node that can be used for discovering and storing WoT Thing Descriptions (TDs) as well as a `wot-scripting` node that uses the WoT Scripting API (through the `node-wot` package) for triggering interaction affordances.

So far, only discovery using CoAP is supported. However, more ways of discovering and interacting with Things are supposed to be added soon.
