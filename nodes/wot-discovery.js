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
                    _getDiscoveryLinks(address);
                }
            });

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

            function _parseCoreLinkFormat(linksAsString) {
                const links = linksAsString.split(",").map(link => {
                    return link.split(";");
                });

                return links.reduce((results, link) => {
                    let errorOccured = false;
                    const linkObject = {};
                    link.forEach(function (currentValue, index) {
                        if (index === 0 && (/^<\/[^<>]*>$/g).test(currentValue)) {
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

            function _coreResponse(res){
                res.on("data", (data) => {
                    if (res.headers["Content-Format"] === "application/link-format") {
                        const links = _parseCoreLinkFormat(data.toString());

                        links.forEach(link => {
                            const correctResourceType = "rt" in link && link.rt.includes('"wot.thing"');
                            const correctContentType = "ct" in link && link.ct.includes("432");

                            if (correctContentType && correctResourceType) {
                                const uri = url.parse(link.uri);
                                const address = uri.host ? uri.host : `[${res.rsinfo.address}]`;
                                _sendCoapDiscovery(address, uri.path);
                            }
                        });
                    }
                });
            }
        });
    }
    RED.nodes.registerType("wot-discovery", WoTDiscoveryNode);
};
