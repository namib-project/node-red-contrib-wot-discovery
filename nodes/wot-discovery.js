module.exports = function (RED) {
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
                    _sendCoapDiscovery(address);
                });
            }
        });

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
                    try {
                        var thingDescription = JSON.parse(data.toString());
                        _processThingDescription(thingDescription);
                    } catch (error) {
                        console.log(data.toString());
                        node.error(error.message);
                    }
                }
            });
        }

        function _getTDIdentifier(thingDescription) {
            let identifier = thingDescription.id || thingDescription.base || thingDescription.title;
            return identifier
        }

        function _sendCoapDiscovery(address) {
            var reqOpts = url.parse(
                `coap://${address}/.well-known/wot-thing-description`
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
    }
    RED.nodes.registerType("wot-discovery", WoTDiscoveryNode);
};
