module.exports = function (RED) {
    "use strict";
    const coap = require("coap");
    const url = require("uri-js");

    function WoTDiscoveryNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        const coapAddresses = [];

        const contextVarKey = config.contextVar || "thingDescriptions";
        const contextVarType = config.contextVarType;
        const tdMsgProperty = config.msgProperty || "thingDescription";
        const msgOrContext = config.msgOrContext;
        const deleteExistingTDs = config.deleteExistingTDs != null ? config.deleteExistingTDs : true;
        const coreURI = config.coreURI;
        const tdURI = config.tdURI;

        const timeouts = {};

        // TODO: Add Implementations for MQTT

        if (config.useCoap) {
            _getCoapAddresses();
        }

        if (msgOrContext === "context" || msgOrContext === "both") {
            const contextVar = _getContextVar();
            if (!contextVar.get(contextVarKey)) {
                contextVar.set(contextVarKey, {});
            }
        }

        function _getCoapAddresses() {

            if (config.coapUseIPv6) {
                if (config.coapIPv6Address == "all") {
                    coapAddresses.push("[ff02::1]");
                } else if (config.coapIPv6Address == "coapOnly") {
                    coapAddresses.push("[ff02::fd]");
                }
            }

            if (config.coapUseIPv4) {
                if (config.coapIPv6Address == "all") {
                    coapAddresses.push("224.0.0.1");
                } else if (config.coapIPv6Address == "coapOnly") {
                    coapAddresses.push("224.0.1.187");
                }
            }
        }

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
                    _getDiscoveryLinks();
                }
            });
            }

            function _processThingDescriptionJSON(thingDescriptionJSON) {
                try {
                    const thingDescription = JSON.parse(thingDescriptionJSON.toString());
                    _processThingDescription(thingDescription);
                } catch (error) {
                    console.log(thingDescriptionJSON.toString());
                    node.error(error.message);
                }
            }

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

            function _resetContextVar() {
                const contextVar = _getContextVar();
                if (!contextVar.get(contextVarKey)) {
                    contextVar.set(contextVarKey, {});
                }
            }

            function _onResponse(res) {
                res.on("data", (data) => {
                    if (res.headers["Content-Format"] === "application/json") {
                        _processThingDescriptionJSON(data);
                    }
                });
            }

            function _getTDIdentifier(thingDescription) {
                const identifier = thingDescription.id || thingDescription.base || thingDescription.title;
                return identifier;
            }

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

            function _getDiscoveryLinks(){
                if (config.useCoap) {
                    coapAddresses.forEach(address => {
                        const reqOpts = url.parse(`coap://${address}/.well-known/core`);
                        reqOpts.pathname = reqOpts.path;
                        reqOpts.query ="rt=wot.thing";
                        reqOpts.multicast = true;
                        const req = coap.request(reqOpts);
                        req.on("response", function (res) {
                            _coreResponse(res);
                        });
                        req.on("error", function (err) {
                            node.log("client error");
                            node.log(err);
                        });
                        req.end();
                    });
                }
            }

        function _coreResponse(res){
            res.on("data", (data) => {
                 if (res.headers["Content-Format"] === "application/link-format") {
                    let links = data.toString().split(',');
                    
                    links = links.map(link => {
                        return link.split(";");
                    });
                    
                    links.forEach(link => {

                        let correctResourceType = false;
                        let correctContentType = false;
                        let path;

                        link.forEach(function (currentValue, index) {
                            if (index === 0 && (/^<\/.*>$/g).test(currentValue) && currentValue.match(/<|>/g).length === 2) {
                                //the first value starts with < ends with > and only contains exactly two characters of < or > characters
                                path = currentValue.substring(2, currentValue.length - 1);
                                return;
                            } else if (!path) {
                                return;
                            }

                            currentValue = currentValue.split("=");
                            const parameter = currentValue[0];
                            const values = currentValue[1];

                            switch (parameter) {
                                case "ct":
                                    if (values === "432") {
                                        correctContentType = true;
                                    }
                                    break;
                                case "rt":
                                    if (values === '"wot.thing"') {
                                        correctResourceType = true;
                                    }
                                    break;
                            }
                        });

                        if (correctContentType && correctResourceType) {
                            const uri = url.parse(path);
                            if (uri.host) {
                                _sendCoapDiscovery(uri.host, uri.path);
                            } else {
                                _sendCoapDiscovery(`[${res.rsinfo.address}]`, uri.path);
                            }
                        }
                    });
                }
            });
        }
        });
    }
    RED.nodes.registerType("wot-discovery", WoTDiscoveryNode);
};
