node-red-contrib-wot-discovery
=====================
![Build Status](https://github.com/JKRhb/node-red-contrib-wot-discovery/workflows/Build%20Status/badge.svg)
[![Coverage Status](https://coveralls.io/repos/github/JKRhb/node-red-contrib-wot-discovery/badge.svg?branch=main)](https://coveralls.io/github/JKRhb/node-red-contrib-wot-discovery?branch=main)
[![Dependency Status](https://david-dm.org/JKRhb/node-red-contrib-wot-discovery.png)](https://david-dm.org/JKRhb/node-red-contrib-wot-discovery)
[![Dev Dependency Status](https://david-dm.org/JKRhb/node-red-contrib-wot-discovery/dev-status.png)](https://david-dm.org/JKRhb/node-red-contrib-wot-discovery#dev-badge-embed)

Experimental Node-RED package for discovery in the Web of Things (WoT).
It provides a `wot-discovery` node that can be used for discovering and storing WoT Thing Descriptions (TDs) as well as a `wot-scripting` node that serves as an interface to [`node-wot`](https://github.com/eclipse/thingweb.node-wot) for triggering interaction affordances.

![Screenshot of wot-discovery and wot-scripting](https://user-images.githubusercontent.com/12641361/120551508-66437480-c3f6-11eb-963f-36380b66e84f.png)

## `wot-discovery` Node

The discovery node can obtain TDs from the local network (using CoAP) or from a MQTT broker and save them either in the context or in the original message object that was passed to the node.

When using CoAP, you can choose between a number of different methods for obtaining TDs, all of which use IP multicast (both IPv4 and IPv6).
You can choose between the multicast addresses for all IPv4/IPv6 nodes or the respective addresses for "All CoAP Nodes".

Supported methods for CoAP so far include:

- Discovery from `/.well-known/wot-thing-discription`.
- Discovery using the CoRE Link Format and `/.well-known/core` (the correct content type and resource type has to be set in the list of links).
- Discovery from CoRE Resource Directories. For this method, available Resource Directories are discovered first which are then queried for links pointing to TDs.

For MQTT, WoT producers have to publish their TDs to a topic with the prefix `wot/td` which can then be queried by the discovery node.

## `wot-scripting` Node

The scripting node consumes TDs that are passed in inside a message object (in the field `thingDescription`).
You can choose which kind of affordance type should be triggered and define a filter (either by affordance name or by the semantic `@type`).
If an affordance returns an output, you can choose where this output should be saved (either in the message or the context) and which field should be used.
