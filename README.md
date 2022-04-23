node-red-contrib-wot-discovery
=====================
![Build Status](https://github.com/JKRhb/node-red-contrib-wot-discovery/workflows/Build%20Status/badge.svg)
[![Coverage Status](https://coveralls.io/repos/github/JKRhb/node-red-contrib-wot-discovery/badge.svg?branch=main)](https://coveralls.io/github/JKRhb/node-red-contrib-wot-discovery?branch=main)
[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)

Experimental Node-RED package for discovery in the Web of Things (WoT).
It provides a `wot-discovery` node that can be used for discovering and storing WoT Thing Descriptions (TDs) as well as a `wot-scripting` node that serves as an interface to [`node-wot`](https://github.com/eclipse/thingweb.node-wot) for triggering interaction affordances.
As a latest addition, a `wot-fetch` node provides a way to retrieve TDs directly from URLs using HTTP(S) or CoAP(S).

![Screenshot of wot-fetch, wot-discovery, wot-scripting nodes](https://user-images.githubusercontent.com/12641361/132991809-14778a9a-08a6-4762-aafd-4a5cbc5c25a6.png)

## `wot-fetch` Node

The fetch node can retrieve TDs from URLs which can either be specified in the node itself or as a message property (using the field `msg.tdUrl`).
It supports the URL schemes `http(s)` and `coap(s)`.

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
