/**
 * Node-RED node that can discover WoT Thing Descriptions using CoAP and MQTT.
 * @module node-red-contrib-wot-discovery/wot-discovery
 */


/**
 * 
 * The definition of the wot-discovery node.
 * 
 * @param {*} RED 
 */
module.exports = function (RED) {
    "use strict";
    const mqtt = require("mqtt");
    const coap = require("coap");
    const url = require("uri-js");

    const mqttDiscoveryTopicBase = "wot/td";
    const mqttDiscoveryTopic = mqttDiscoveryTopicBase + "/#";

    /**
     * The main function for the wot-discovery node.
     *
     * @param {*} config
     */
    function WoTDiscoveryNode(config) {
        
        RED.nodes.createNode(this, config);
        const node = this;
        const coapAddresses = [];
        const coreRDAddresses = [];

        const contextVarKey = config.contextVar || "thingDescriptions";
        const contextVarType = config.contextVarType;
        const tdMsgProperty = config.msgProperty || "thingDescription";
        const msgOrContext = config.msgOrContext;
        const deleteExistingTDs = config.deleteExistingTDs != null ? config.deleteExistingTDs : true;
        const coreURI = config.coreURI;
        const tdURI = config.tdURI;

        const useMqttDiscovery = config.useMqtt || false;
        const mqttBrokerAddress = config.mqttBrokerAddress;
        let mqttClient;

        const timeouts = {};

        // TODO: Add Implementations for MQTT

        if (config.useCoap) {
            _getCoapAddresses();

            if (config.useCoreRD) {
                _getcoreRDAddresses();
            }
        }

        if (msgOrContext === "context" || msgOrContext === "both") {
            const contextVar = _getContextVar();
            if (!contextVar.get(contextVarKey)) {
                contextVar.set(contextVarKey, {});
            }
        }

       /**
        * 
        * @param {*} config whether the node should use coap for discovery.
        * @return {*} list of multicast addresses to use for discovery.
        */
       function _getCoapAddresses() {
            if (config.coapUseIPv6) {
                if (config.coapIPv6Address == "all") {
                    coapAddresses.push("[ff02::1]");
                } else if (config.coapIPv6Address == "coapOnly") {
                    coapAddresses.push("[ff02::fd]");
                }
            }

            if (config.coapUseIPv4) {
                if (config.coapIPv4Address == "all") {
                    coapAddresses.push("224.0.0.1");
                } else if (config.coapIPv4Address == "coapOnly") {
                    coapAddresses.push("224.0.1.187");
                }
            }
        }

        function _getcoreRDAddresses() {
            if (config.coreRDUseIPv6) {
                coreRDAddresses.push("[ff02::fe]");
            }

            if (config.coreRDUseIPv4) {
                coreRDAddresses.push("224.0.1.189");
            }
        }

        /**
         *
         *
         * @return {*} the context variable, the Thing Descriptions get stored in.
         */
        function _getContextVar() {
            if (contextVarType === "flow") {
                return node.context().flow;
            } else if (contextVarType === "global") {
                return node.context().global;
            }
            return null;
        }

        node.on("input", function(msg, send) {
            if (deleteExistingTDs && (msgOrContext === "context" || msgOrContext === "both")) {
                _resetContextVar();
            }

            coapAddresses.forEach(address => {
                if (tdURI) {
                    _sendCoapDiscovery(address, "/.well-known/wot-thing-description");
                }
                if (coreURI) {
                    _getDiscoveryLinks(address);
                }
            });

            coreRDAddresses.forEach(address => {
                _performResourceDirectoryDiscovery(address);
            });

            if (useMqttDiscovery) {
                _performMqttDiscovery();
            }

            function _performResourceDirectoryDiscovery(address) {
                const reqOpts = url.parse(
                    `coap://${address}/.well-known/core?rt=core.rd-lookup-res&ct=40`
                );
                reqOpts.pathname = reqOpts.path;
                reqOpts.method = "GET";
                reqOpts.multicast = true;
                const req = coap.request(reqOpts);
                req.on("response", _performRDLookUp);
                req.on("error", function (err) {
                    node.log("client error");
                    node.log(err);
                });
                req.end();
            }

            function _performRDLookUp(res) {
                res.on("data", (data) => {
                    const links = _parseCoreLinkFormat(data.toString());

                    links.forEach(link => {
                        try {
                            if (link.ct.includes("40") && link.rt.includes("core.rd-lookup-res")) {
                                const uri = url.parse(link.uri);
                                const address = _getResourceAddress(uri, res);

                                if (uri.scheme && uri.scheme !== "coap") {
                                    // Only CoAP is supported so far
                                    return;
                                } else {
                                    const reqOpts = url.parse(
                                        `coap://${address}${uri.path}?rt=wot.thing`
                                    );
                                    reqOpts.pathname = reqOpts.path;
                                    reqOpts.method = "GET";
                                    const req = coap.request(reqOpts);
                                    req.on("response", _coreResponse);
                                    req.on("error", function (err) {
                                        node.log("client error");
                                        node.log(err);
                                    });
                                    req.end();
                                }
                            }
                        } catch (error) {
                            node.log(error);
                            return;
                        }
                    });
                });
            }

            function _getResourceAddress(uri, res) {
                if (uri.host) {
                    return uri.host;
                }

                let address = res.rsinfo.address;
                if (res.rsinfo.family && res.rsinfo.family === "IPv6") {
                    address = `[${address}]`;
                }
                return address;
            }

            /**
             *
             *  Parses the Thing Description to an object and and calls {@link _processThingDescription} on it.
             * 
             * @param {*} thingDescriptionJSON the Thing Description in JSON
             */
            function _processThingDescriptionJSON(thingDescriptionJSON) {
                try {
                    const thingDescription = JSON.parse(thingDescriptionJSON.toString());
                    _processThingDescription(thingDescription);
                } catch (error) {
                    console.log(thingDescriptionJSON.toString());
                    node.error(error.message);
                }
            }

            /**
             *
             *  Stores the given Thing Description in the given context or sends it as message.
             *
             * @param {*} thingDescription
             * @return {*} 
             */
            function _processThingDescription(thingDescription) {
                if (msgOrContext === "msg" || msgOrContext === "both") {
                    msg[tdMsgProperty] = thingDescription;
                    send(msg);
                }
                if (msgOrContext === "context" || msgOrContext === "both") {
                    let contextVar;
                    if (contextVarType === "flow") {
                        contextVar = node.context().flow;
                    } else if (contextVarType === "global") {
                        contextVar = node.context().global;
                    } else {
                        node.error("Could not retrieve context variable.");
                        return;
                    }
                    const storedTDs = contextVar.get(contextVarKey);
                    const identifier = _getTDIdentifier(thingDescription);
                    storedTDs[identifier] = thingDescription;
                    if (config.timeoutRemoval) {
                        if (timeouts[identifier]) {
                            clearTimeout(timeouts[identifier]);
                        }
                        timeouts[identifier] = setTimeout(() => {
                            delete storedTDs[identifier];
                        }, config.removalTime * 60 * 60 * 1000);
                    }
                }
            }

            /**
             *
             * Resets the current context variable.
             */
            function _resetContextVar() {
                const contextVar = _getContextVar();
                if (!contextVar.get(contextVarKey)) {
                    contextVar.set(contextVarKey, {});
                }
            }

            /**
             *  Proceed with the data of the received message if the content format is application/json.
             *
             * @param {*} res
             */
            function _onResponse(res) {
                res.on("data", (data) => {
                    if (res.headers["Content-Format"] === "application/json") {
                        _processThingDescriptionJSON(data);
                    }
                });
            }

            /**
             *
             *
             * @param {*} thingDescription
             * @return {*} 
             */
            function _getTDIdentifier(thingDescription) {
                const identifier = thingDescription.id || thingDescription.base || thingDescription.title;
                return identifier;
            }

            /**
             * Sends a TD-Discovery to the given address, looking for the given path.
             *
             * @param {*} address
             * @param {*} path
             */
            function _sendCoapDiscovery(address, path) {
                const reqOpts = url.parse(
                    `coap://${address}${path}`
                );
                reqOpts.pathname = reqOpts.path;
                reqOpts.method = "GET";
                reqOpts.multicast = true;
                reqOpts.Block2 = Buffer.of(0x5); // TODO: Make block-size adjustable
                const req = coap.request(reqOpts);
                req.on("response", _onResponse);
                req.on("error", function (err) {
                    node.log("client error");
                    node.log(err);
                });
                req.end();
            }

            /**
             *
             * Discovers all links from /.well-known/core that have the resource type wot.thing based on {@link coapAddresses}.
             */
            function _getDiscoveryLinks(address){
                const reqOpts = url.parse(`coap://${address}/.well-known/core`);
                reqOpts.pathname = reqOpts.path;
                reqOpts.query ='rt=wot.thing';
                reqOpts.multicast = true;
                reqOpts.method = "GET";
                const req = coap.request(reqOpts);
                req.on("response", _coreResponse);
                req.on("error", function (err) {
                    node.log("client error");
                    node.log(err);
                });
                req.end();
            }

            /**
             *
             * Checks the syntax of the received links from {@ling _getDiscoveryLinks} and uses them for {@link _sendCoapDiscovery}.
             * @param {*} res
             */
            function _parseCoreLinkFormat(linksAsString) {
                const links = linksAsString.split(",").map(link => {
                    return link.split(";");
                });

                return links.reduce((results, link) => {
                    let errorOccured = false;
                    const linkObject = {};
                    link.forEach(function (currentValue, index) {
                        if (index === 0 && (/^<[^<>]*>$/g).test(currentValue)) {
                            linkObject.uri = currentValue.substring(1, currentValue.length -1);
                        } else {
                            try {
                                const query = currentValue.split("=");
                                const parameter = query[0];
                                const args = query[1].replace(/["]+/g, '').split(" ");
                                linkObject[parameter] = args;
                            } catch (error) {
                                errorOccured = true;
                            }
                        }
                    });

                    if ("uri" in linkObject && ! errorOccured) {
                        results.push(linkObject);
                    }
                    
                    return results;
                }, []);
            }

            /**
             *
             *
             * @param {*} res
             */
            function _coreResponse(res){
                res.on("data", (data) => {
                    if (res.headers["Content-Format"] === "application/link-format") {
                        const links = _parseCoreLinkFormat(data.toString());

                        links.forEach(link => {
                            const correctResourceType = "rt" in link && link.rt.includes('wot.thing');
                            const correctContentType = "ct" in link && link.ct.includes("432");

                            if (correctContentType && correctResourceType) {
                                const uri = url.parse(link.uri);
                                const address = _getResourceAddress(uri, res);
                                _sendCoapDiscovery(address, uri.path);
                            }
                        });
                    }
                });
            }
    
            function _performMqttDiscovery() {
                if (mqttClient) {
                    mqttClient.end();
                }
    
                if (mqttBrokerAddress) {
                    mqttClient = mqtt.connect(mqttBrokerAddress);
                } else {
                    node.error("No MQTT broker address defined!");
                    return;
                }
    
                mqttClient.on('message', function (topic, message) {
                    if (topic.startsWith(mqttDiscoveryTopicBase)) {
                        _processThingDescriptionJSON(message.toString());
                    }
                });
    
                mqttClient.on('connect', function () {
                    mqttClient.subscribe(mqttDiscoveryTopic);
                });
            }
        });
    }
    RED.nodes.registerType("wot-discovery", WoTDiscoveryNode);
};
