module.exports = function (RED) {
    "use strict";
    var coap = require("coap");
    var url = require("uri-js");

    function WoTDiscoveryNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        var coapAddresses;

        var contextVarKey = config.contextVar || "thingDescriptions";
        var contextVarType = config.contextVarType;
        var tdMsgProperty = config.msgProperty || "thingDescription";
        var msgOrContext = config.msgOrContext;
        var deleteExistingTDs = config.deleteExistingTDs || true;
        var coreURI = config.coreURI;
        var tdURI = config.tdURI;

        var timeouts = {};

        // TODO: Add Implementations for MQTT and HTTP

        if (config.useCoap) {
            coapAddresses = _getCoapAddresses(config);
        }

        if (msgOrContext === "context" || msgOrContext === "both") {
            let contextVar = _getContextVar();
            if (!contextVar.get(contextVarKey)) {
                contextVar.set(contextVarKey, {});
            }
        }

        node.on("input", function (msg) {
            if (deleteExistingTDs && msgOrContext === "context") {
                _resetContextVar();
            }

            if (coapAddresses) {
                coapAddresses.forEach((address) => {
                    if(tdURI){
                        _sendCoapDiscovery(address, "/.well-known/wot-thing-description");
                    }
                    if(coreURI){
                        _getDiscoveryLinks();
                    }
                });
            }
        });

        function _processThingDescriptionJSON(thingDescriptionJSON) {
            try {
                var thingDescription = JSON.parse(thingDescriptionJSON.toString());
                _processThingDescription(thingDescription);
            } catch (error) {
                console.log(thingDescriptionJSON.toString());
                node.error(error.message);
            }
        }

        function _processThingDescription(thingDescription) {
            if (msgOrContext === "msg" || msgOrContext === "both") {
                let message = {};
                message[tdMsgProperty] = thingDescription;
                node.send(message);
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
                let storedTDs = contextVar.get(contextVarKey);
                let identifier = _getTDIdentifier(thingDescription);
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

        function _getContextVar() {
            if (contextVarType === "flow") {
                return node.context().flow;
            } else if (contextVarType === "global") {
                return node.context().global;
            }
            return null;
        }

        function _resetContextVar() {
            let contextVar = _getContextVar();
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
            let identifier = thingDescription.id || thingDescription.base || thingDescription.title;
            return identifier;
        }

        function _sendCoapDiscovery(address, knownURI) {
            var reqOpts = url.parse(
                `coap://${address}${knownURI}`
            );
            reqOpts.pathname = reqOpts.path;
            reqOpts.method = "GET";
            reqOpts.multicast = true;
            var req = coap.request(reqOpts);
            req.on("response", _onResponse);
            req.on("error", function (err) {
                node.log("client error");
                node.log(err);
            });
            req.end();
        }

        function _getCoapAddresses(config) {
            let addresses = [];

            if (config.coapUseIPv6) {
                if (config.coapIPv6Address == "all") {
                    addresses.push("[ff02::1]");
                } else if (config.coapIPv6Address == "coapOnly") {
                    addresses.push("[ff02::fd]");
                }
            }

            if (config.coapUseIPv4) {
                if (config.coapIPv6Address == "all") {
                    addresses.push("224.0.0.1");
                } else if (config.coapIPv6Address == "coapOnly") {
                    addresses.push("224.0.1.187");
                }
            }

            return addresses;
        }
        function _getDiscoveryLinks(){
            if (config.useCoap) {
                coapAddresses.forEach(address => {
                    const reqOpts = url.parse(`coap://${address}/.well-known/core`);
                    reqOpts.pathname = reqOpts.path;
                    reqOpts.query ="rt=wot.thing";
                    reqOpts.multicast = true;
                    const req = coap.request(reqOpts);
                    req.on("response", _coreResponse);
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

                        link.forEach(function (curentValue, index) {
                            if (index === 0) {
                                // First parameter must be the path
                                // TODO: Add assertion for </ ... > format
                                path = curentValue.substring(2, curentValue.length - 1);
                                return;
                            } else if (!path) {
                                return;
                            }

                            curentValue = curentValue.split("=");
                            let parameter = curentValue[0];
                            let values = curentValue[1]

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
                        })

                        if (correctContentType && correctResourceType) {
                            _sendCoapDiscovery(`[${res.rsinfo.address}]`, path);
                        }
                    });
                }
            });
        }
    }
    RED.nodes.registerType("wot-discovery", WoTDiscoveryNode);
};
